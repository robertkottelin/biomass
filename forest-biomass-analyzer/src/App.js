import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, FeatureGroup, Polygon, useMap } from 'react-leaflet';
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet icon issue
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Load leaflet-geometryutil for area calculations
const loadGeometryUtil = () => {
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet-geometryutil/0.10.3/leaflet.geometryutil.min.js';
  document.head.appendChild(script);
  return new Promise((resolve) => {
    script.onload = resolve;
  });
};

// Custom Draw Control Component
const DrawControl = ({ onCreated, onDeleted }) => {
  const map = useMap();
  const drawnItemsRef = useRef(new L.FeatureGroup());
  const drawControlRef = useRef(null);

  useEffect(() => {
    const drawnItems = drawnItemsRef.current;
    map.addLayer(drawnItems);

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js';
    script.onload = () => {
      const drawControl = new L.Control.Draw({
        edit: {
          featureGroup: drawnItems,
          remove: true
        },
        draw: {
          polygon: {
            allowIntersection: false,
            showArea: true,
            drawError: {
              color: '#b00b00',
              timeout: 1000
            }
          },
          rectangle: false,
          circle: false,
          circlemarker: false,
          marker: false,
          polyline: false
        }
      });

      drawControlRef.current = drawControl;
      map.addControl(drawControl);

      map.on(L.Draw.Event.CREATED, (e) => {
        const layer = e.layer;
        drawnItems.addLayer(layer);
        if (onCreated) {
          onCreated({ layer });
        }
      });

      map.on(L.Draw.Event.DELETED, (e) => {
        if (onDeleted) {
          onDeleted(e);
        }
      });
    };

    document.head.appendChild(script);

    return () => {
      if (drawControlRef.current) {
        map.removeControl(drawControlRef.current);
      }
      map.removeLayer(drawnItems);
      map.off(L.Draw.Event.CREATED);
      map.off(L.Draw.Event.DELETED);
    };
  }, [map, onCreated, onDeleted]);

  return null;
};

const ForestBiomassApp = () => {
  const [selectedForests, setSelectedForests] = useState([]);
  const [forestType, setForestType] = useState('pine');
  const [biomassData, setBiomassData] = useState([]);
  const [selectedForestIndex, setSelectedForestIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [cloudCoverage, setCloudCoverage] = useState(20);
  const [processingStatus, setProcessingStatus] = useState('');
  const [trendStartDate, setTrendStartDate] = useState('');
  const [trendEndDate, setTrendEndDate] = useState('');
  const mapRef = useRef();
  
  // Use refs to avoid stale closure issues with token management
  const authRef = useRef({
    accessToken: '',
    tokenExpiry: null,
    isAuthenticating: false,
    lastAuthTime: 0
  });
  
  // Global rate limit state
  const [rateLimitExpiry, setRateLimitExpiry] = useState(0);
  const [apiFailureCount, setApiFailureCount] = useState(0);
  const [simulatedDataCount, setSimulatedDataCount] = useState(0);

  // Load GeometryUtil on mount
  useEffect(() => {
    loadGeometryUtil();
  }, []);

  // Forest growth parameters for biomass estimation from NDVI
  const forestParams = {
    pine: { maxBiomass: 350, a: 0.7, b: 1.2 },
    fir: { maxBiomass: 400, a: 0.75, b: 1.15 },
    birch: { maxBiomass: 250, a: 0.65, b: 1.3 },
    aspen: { maxBiomass: 200, a: 0.6, b: 1.35 }
  };

  // Convert NDVI to biomass using empirical relationship
  const ndviToBiomass = (ndvi, forestType) => {
    const params = forestParams[forestType];
    return params.a * Math.exp(params.b * ndvi) * params.maxBiomass / 10;
  };

  // Get current access token from ref
  const getAccessToken = () => authRef.current.accessToken;

  // Check if token is valid using ref
  const isTokenValid = () => {
    const now = Date.now();
    return authRef.current.accessToken && 
           authRef.current.tokenExpiry && 
           now < authRef.current.tokenExpiry;
  };

  // Authenticate with Copernicus Data Space Ecosystem
  const authenticateCDSE = async () => {
    // Prevent concurrent authentication attempts
    if (authRef.current.isAuthenticating) {
      console.log('Authentication already in progress');
      return false;
    }
    
    // Prevent rapid re-authentication (minimum 5 second gap)
    const now = Date.now();
    if (now - authRef.current.lastAuthTime < 5000) {
      console.log('Too soon to re-authenticate');
      return false;
    }
    
    if (!clientId || !clientSecret) {
      setError('Missing credentials: Client ID and Client Secret required');
      return false;
    }

    authRef.current.isAuthenticating = true;
    authRef.current.lastAuthTime = now;
    setError(null);
    setProcessingStatus('Authenticating...');

    try {
      const tokenData = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      });

      const tokenResponse = await fetch('https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: tokenData
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        throw new Error(`HTTP ${tokenResponse.status}: ${errorData.error_description || tokenResponse.statusText}`);
      }

      const tokenResult = await tokenResponse.json();
      
      // Update auth ref with new token data
      authRef.current.accessToken = tokenResult.access_token;
      // Calculate token expiry with 60 second safety margin
      authRef.current.tokenExpiry = Date.now() + ((tokenResult.expires_in - 60) * 1000);
      
      setAuthenticated(true);
      setProcessingStatus('');
      
      console.log(`Token acquired. Expires in: ${tokenResult.expires_in}s (${new Date(authRef.current.tokenExpiry).toLocaleTimeString()})`);
      return true;
    } catch (err) {
      if (err.message.includes('Failed to fetch')) {
        setError('CORS blocked. Solutions:\n1. Configure OAuth client for SPA with domain whitelist\n2. Use manual token entry field\n3. Implement backend proxy endpoint');
      } else {
        setError(`Authentication failed: ${err.message}`);
      }
      setProcessingStatus('');
      return false;
    } finally {
      authRef.current.isAuthenticating = false;
    }
  };
  
  // Re-authenticate when token expires
  const reauthenticate = async () => {
    console.log('Re-authenticating with client credentials...');
    return await authenticateCDSE();
  };
  
  // Ensure valid token before API calls
  const ensureValidToken = async () => {
    if (!isTokenValid()) {
      console.log('Token expired or missing. Re-authenticating...');
      return await reauthenticate();
    }
    return true;
  };

  // Search for Sentinel-2 products with token validation
  const searchSentinel2Products = async (polygon, startDate, endDate) => {
    // Ensure valid token before API call
    if (!await ensureValidToken()) {
      throw new Error('Failed to obtain valid token');
    }
    
    const coords = polygon.coords.map(coord => [coord[1], coord[0]]); // Convert to lon,lat
    const coordsString = [...coords, coords[0]].map(c => `${c[0]} ${c[1]}`).join(',');
    const wktPolygon = `POLYGON((${coordsString}))`;

    // Build filter string
    const collectionFilter = `Collection/Name eq 'SENTINEL-2'`;
    const spatialFilter = `OData.CSC.Intersects(area=geography'SRID=4326;${wktPolygon}')`;
    const dateStartFilter = `ContentDate/Start gt ${startDate}T00:00:00.000Z`;
    const dateEndFilter = `ContentDate/Start lt ${endDate}T00:00:00.000Z`;
    const cloudFilter = `Attributes/OData.CSC.DoubleAttribute/any(att:att/Name eq 'cloudCover' and att/OData.CSC.DoubleAttribute/Value le ${cloudCoverage}.00)`;
    const productTypeFilter = `Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'productType' and att/OData.CSC.StringAttribute/Value eq 'S2MSI2A')`;

    const filterQuery = `${collectionFilter} and ${spatialFilter} and ${dateStartFilter} and ${dateEndFilter} and ${cloudFilter} and ${productTypeFilter}`;
    const searchUrl = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=${encodeURIComponent(filterQuery)}&$orderby=ContentDate/Start&$top=100`;

    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${getAccessToken()}`
      }
    });

    if (response.status === 401) {
      // Token expired, try to re-authenticate once
      console.log('Search returned 401. Re-authenticating...');
      if (await reauthenticate()) {
        // Retry with new token
        const retryResponse = await fetch(searchUrl, {
          headers: {
            'Authorization': `Bearer ${getAccessToken()}`
          }
        });
        
        if (!retryResponse.ok) {
          throw new Error(`Search failed after re-authentication: ${retryResponse.status}`);
        }
        
        const data = await retryResponse.json();
        return data.value || [];
      } else {
        throw new Error('Authentication failed');
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Search error:', errorText);
      throw new Error(`Search failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  };

  // Process Sentinel-2 NDVI data using Sentinel Hub Statistical API
  const processSentinel2NDVI = async (product, polygon, cloudCoverage) => {
    const acquisitionDate = new Date(product.ContentDate.Start);
    const dateStr = acquisitionDate.toISOString().split('T')[0];
    
    // NDVI evalscript for Statistical API - OPTIMIZED VERSION
    const evalscript = `
      //VERSION=3
      function setup() {
        return {
          input: [{
            bands: ["B04", "B08", "SCL", "dataMask"],
            units: "DN"
          }],
          output: [
            {
              id: "ndvi",
              bands: 1,
              sampleType: "FLOAT32"
            },
            {
              id: "dataMask", 
              bands: 1
            }
          ]
        };
      }
      
      function evaluatePixel(samples) {
        // Valid pixel check
        if (samples.dataMask === 0) {
          return {
            ndvi: [NaN],
            dataMask: [0]
          };
        }
        
        // Less aggressive cloud masking - SCL classification:
        // 0: No Data, 1: Saturated/Defective
        // 2: Dark Area Pixels, 3: Cloud Shadows
        // 4: Vegetation, 5: Bare Soils
        // 6: Water, 7: Unclassified
        // 8: Cloud medium probability, 9: Cloud high probability
        // 10: Thin cirrus, 11: Snow/Ice
        // Only exclude high confidence clouds and no data
        const scl = samples.SCL;
        const cloudMask = (scl === 0 || scl === 1 || scl === 9) ? 0 : 1;
        
        // Calculate NDVI with bounds checking
        const red = samples.B04;
        const nir = samples.B08;
        const denominator = nir + red;
        
        if (denominator === 0) {
          return {
            ndvi: [0],
            dataMask: [0]
          };
        }
        
        const ndvi = (nir - red) / denominator;
        
        // Validate NDVI range
        if (ndvi < -1 || ndvi > 1 || isNaN(ndvi)) {
          return {
            ndvi: [0],
            dataMask: [0]
          };
        }
        
        return {
          ndvi: [ndvi],
          dataMask: [cloudMask]
        };
      }
    `;
    
    const coordinates = polygon.coords.map(coord => [coord[1], coord[0]]); // lon, lat
    
    // Extend time range to ±7 days for increased data availability
    const startDate = new Date(acquisitionDate);
    const endDate = new Date(acquisitionDate);
    startDate.setDate(startDate.getDate() - 7);
    endDate.setDate(endDate.getDate() + 7);
    
    // Statistical API request payload - OPTIMIZED VERSION
    const statsRequest = {
      input: {
        bounds: {
          geometry: {
            type: "Polygon",
            coordinates: [[...coordinates, coordinates[0]]]
          },
          properties: {
            crs: "http://www.opengis.net/def/crs/EPSG/0/4326"
          }
        },
        data: [{
          type: "sentinel-2-l2a",
          dataFilter: {
            timeRange: {
              from: startDate.toISOString(),
              to: endDate.toISOString()
            },
            maxCloudCoverage: cloudCoverage / 100,
            mosaickingOrder: "leastCC"
          }
        }]
      },
      aggregation: {
        timeRange: {
          from: startDate.toISOString(),
          to: endDate.toISOString()
        },
        aggregationInterval: {
          of: "P15D"  // 15-day interval to capture at least one scene
        },
        evalscript: evalscript,
        resx: 10,
        resy: 10
      },
      calculations: {
        default: {
          statistics: {
            default: {
              percentiles: {
                k: [25, 50, 75]
              }
            }
          }
        }
      }
    };
    
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
      try {
        // Ensure valid token before API call
        if (!isTokenValid() && !(await reauthenticate())) {
          throw new Error('Failed to obtain valid token');
        }
        
        const response = await fetch('https://sh.dataspace.copernicus.eu/api/v1/statistics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAccessToken()}`
          },
          body: JSON.stringify(statsRequest)
        });
        
        if (response.status === 401 && retries < maxRetries - 1) {
          // Token expired, re-authenticate and retry
          console.log('Statistical API returned 401. Re-authenticating...');
          if (await reauthenticate()) {
            retries++;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Short delay before retry
            continue;
          } else {
            throw new Error('Failed to re-authenticate');
          }
        }
        
        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('retry-after');
          const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader) * 1000 : 10000;
          
          const error = new Error('Rate limit exceeded');
          error.status = 429;
          error.retryAfter = retryAfterMs;
          throw error;
        }
        
        if (!response.ok) {
          console.error(`Statistical API error: ${response.status}`);
          const errorText = await response.text();
          console.error('Error details:', errorText);
          
          // Try to parse error response
          try {
            const errorData = JSON.parse(errorText);
            console.error('Parsed error:', errorData);
          } catch (e) {
            // Not JSON error response
          }
          
          return { ndvi: estimateNDVIFromDate(acquisitionDate), isSimulated: true };
        }
        
        const statsData = await response.json();
        
        // Extract NDVI value from Statistical API response - FIXED parsing
        if (statsData && statsData.data && statsData.data.length > 0) {
          for (const interval of statsData.data) {
            if (interval.outputs && interval.outputs.ndvi) {
              const ndviOutput = interval.outputs.ndvi;
              
              // Check different possible response structures
              let ndviValue = null;
              
              // Debug logging to understand response structure
              console.log('NDVI Output structure:', JSON.stringify(ndviOutput, null, 2));
              
              // Structure 1: bands.B0.stats (standard structure)
              if (ndviOutput.bands && ndviOutput.bands.B0 && ndviOutput.bands.B0.stats) {
                const stats = ndviOutput.bands.B0.stats;
                console.log('Stats found:', stats);
                
                // Check if we have valid data (not all pixels masked)
                if (stats.sampleCount > 0 && stats.sampleCount > stats.noDataCount) {
                  ndviValue = stats.mean !== undefined ? stats.mean : 
                             (stats.percentiles && stats.percentiles['50.0'] !== undefined ? stats.percentiles['50.0'] :
                             (stats.percentiles && stats.percentiles['50'] !== undefined ? stats.percentiles['50'] : null));
                } else {
                  console.warn(`All pixels masked - sampleCount: ${stats.sampleCount}, noDataCount: ${stats.noDataCount}`);
                }
              }
              // Structure 2: direct stats (alternative structure)
              else if (ndviOutput.stats) {
                const stats = ndviOutput.stats;
                console.log('Direct stats found:', stats);
                
                if (stats.sampleCount > 0 && stats.sampleCount > stats.noDataCount) {
                  ndviValue = stats.mean !== undefined ? stats.mean :
                             (stats.percentiles && stats.percentiles['50.0'] !== undefined ? stats.percentiles['50.0'] :
                             (stats.percentiles && stats.percentiles['50'] !== undefined ? stats.percentiles['50'] : null));
                }
              }
              
              if (ndviValue !== null && !isNaN(ndviValue) && ndviValue >= -1 && ndviValue <= 1) {
                console.log(`NDVI value retrieved: ${ndviValue} for date ${dateStr}`);
                return { ndvi: ndviValue, isSimulated: false };
              }
            }
          }
        }
        
        console.warn('No valid NDVI data in response, using simulated value');
        return { ndvi: estimateNDVIFromDate(acquisitionDate), isSimulated: true };
        
      } catch (error) {
        if (error.status === 429) {
          throw error; // Re-throw rate limit errors
        }
        if (retries >= maxRetries - 1) {
          console.error('NDVI processing error after retries:', error);
          return { ndvi: estimateNDVIFromDate(acquisitionDate), isSimulated: true };
        }
        retries++;
        await new Promise(resolve => setTimeout(resolve, 2000 * retries)); // Exponential backoff
      }
    }
  };
  
  // Fallback NDVI estimation based on date
  const estimateNDVIFromDate = (date) => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfYear = (month - 1) * 30 + day;
    
    // Seasonal NDVI model for temperate forests
    const seasonalFactor = 0.3 * Math.sin(2 * Math.PI * (dayOfYear - 80) / 365) + 0.5;
    return Math.max(0, Math.min(1, seasonalFactor));
  };

  // Fetch satellite data main function
  const fetchSatelliteData = async () => {
    if (selectedForests.length === 0) {
      setError('Draw at least one forest polygon');
      return;
    }

    if (!authenticated) {
      setError('Authenticate with Copernicus Data Space first');
      return;
    }

    // Ensure token is valid before starting
    if (!isTokenValid()) {
      setProcessingStatus('Token expired. Re-authenticating...');
      const success = await reauthenticate();
      if (!success) {
        setError('Re-authentication failed. Please enter credentials again.');
        return;
      }
    }

    setLoading(true);
    setError(null);
    setBiomassData([]);
    setProcessingStatus('Searching for Sentinel-2 products...');

    try {
      const selectedForest = selectedForests[selectedForestIndex];
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = '2015-07-01';

      // Batch requests by year
      const startYear = 2015;
      const endYear = new Date().getFullYear();
      const allProducts = [];

      for (let year = startYear; year <= endYear; year++) {
        const yearStart = year === 2015 ? '2015-07-01' : `${year}-01-01`;
        const yearEnd = year === endYear ? endDate : `${year}-12-31`;

        setProcessingStatus(`Fetching data for ${year}...`);

        try {
          const yearProducts = await searchSentinel2Products(selectedForest, yearStart, yearEnd);
          allProducts.push(...yearProducts);

          if (year < endYear) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (err) {
          console.warn(`Failed to fetch data for ${year}:`, err);
        }
      }

      if (allProducts.length === 0) {
        setError('No Sentinel-2 products found for the selected area');
        return;
      }

      setProcessingStatus(`Found ${allProducts.length} products. Processing NDVI...`);

      // Process products with rate limiting
      const biomassResults = [];
      const batchSize = 5;
      const baseDelay = 3000;
      let simulatedCount = 0;
      let apiFailures = 0;
      let successCount = 0;

      for (let i = 0; i < allProducts.length; i += batchSize) {
        const batch = allProducts.slice(i, i + batchSize);

        // Check rate limit
        const now = Date.now();
        if (rateLimitExpiry > now) {
          const waitTime = rateLimitExpiry - now;
          setProcessingStatus(`Rate limited. Waiting ${Math.ceil(waitTime / 1000)}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        for (const product of batch) {
          const date = new Date(product.ContentDate.Start).toISOString().split('T')[0];

          let retries = 0;
          let ndviResult = null;
          
          while (retries < 3 && ndviResult === null) {
            try {
              if (retries === 0) {
                await new Promise(resolve => setTimeout(resolve, baseDelay));
              } else {
                const backoffDelay = Math.min(baseDelay * Math.pow(2, retries), 30000);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
              }

              ndviResult = await processSentinel2NDVI(product, selectedForest);
              
              if (!ndviResult.isSimulated) {
                successCount++;
                console.log(`SUCCESS: Retrieved real NDVI data for ${date}`);
              }
              
            } catch (error) {
              if (error.status === 429 && error.retryAfter) {
                setRateLimitExpiry(Date.now() + error.retryAfter);
                console.log(`Rate limited. Will retry after ${error.retryAfter}ms`);
              }
              retries++;
              
              if (retries >= 3) {
                console.error(`Failed to process product after ${retries} retries`);
                ndviResult = { ndvi: estimateNDVIFromDate(new Date(product.ContentDate.Start)), isSimulated: true };
                apiFailures++;
              }
            }
          }
          
          if (ndviResult.isSimulated) {
            simulatedCount++;
          }
          
          const biomass = ndviToBiomass(ndviResult.ndvi, selectedForest.type);

          const cloudCoverAttr = product.Attributes?.find(attr =>
            attr.Name === 'cloudCover' && attr.ValueType === 'Double'
          );
          const cloudCoverValue = cloudCoverAttr ? cloudCoverAttr.Value : 0;

          biomassResults.push({
            date: date,
            year: parseInt(date.split('-')[0]),
            month: parseInt(date.split('-')[1]),
            ndvi: ndviResult.ndvi,
            biomass: biomass,
            productId: product.Id,
            productName: product.Name,
            cloudCover: cloudCoverValue,
            footprint: product.GeoFootprint,
            isSimulated: ndviResult.isSimulated
          });
        }

        setProcessingStatus(`Processing: ${Math.round((i + batchSize) / allProducts.length * 100)}% complete (${successCount} real, ${simulatedCount} simulated)`);
      }

      // Sort by date
      biomassResults.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Calculate annual means
      const yearlyBiomass = {};
      biomassResults.forEach(point => {
        if (!yearlyBiomass[point.year]) {
          yearlyBiomass[point.year] = [];
        }
        yearlyBiomass[point.year].push(point.biomass);
      });

      biomassResults.forEach(point => {
        const yearData = yearlyBiomass[point.year];
        if (yearData && yearData.length > 0) {
          point.biomassMean = yearData.reduce((sum, val) => sum + val, 0) / yearData.length;
        }
      });

      setBiomassData(biomassResults);
      setSimulatedDataCount(simulatedCount);
      setApiFailureCount(apiFailures);
      setProcessingStatus('');
    } catch (err) {
      setError('Data fetch error: ' + err.message);
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreated = useCallback((e) => {
    const layer = e.layer;
    const coords = layer.getLatLngs()[0];

    let area;
    if (window.L && window.L.GeometryUtil && window.L.GeometryUtil.geodesicArea) {
      area = L.GeometryUtil.geodesicArea(coords) / 10000;
    } else {
      let sum = 0;
      const n = coords.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        sum += coords[i].lat * coords[j].lng;
        sum -= coords[j].lat * coords[i].lng;
      }
      const latRad = coords[0].lat * Math.PI / 180;
      area = Math.abs(sum * 111319.9 * 111319.9 * Math.cos(latRad) / 2) / 10000;
    }

    const newForest = {
      id: Date.now(),
      coords: coords.map(c => [c.lat, c.lng]),
      area: area.toFixed(2),
      type: forestType,
      analysisYear: new Date().getFullYear()
    };

    setSelectedForests(prev => [...prev, newForest]);
  }, [forestType]);

  const handleDeleted = useCallback((e) => {
    setSelectedForests(forests => forests.slice(0, -1));
    if (selectedForestIndex >= selectedForests.length - 1) {
      setSelectedForestIndex(Math.max(0, selectedForests.length - 2));
    }
  }, [selectedForestIndex, selectedForests.length]);

  const styles = {
    container: {
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      minHeight: '100vh',
      overflowY: 'auto'
    },
    header: {
      textAlign: 'center',
      marginBottom: '20px',
      color: '#2c3e50'
    },
    controls: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '15px',
      marginBottom: '20px',
      padding: '20px',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px'
    },
    input: {
      padding: '8px 12px',
      border: '1px solid #ddd',
      borderRadius: '4px',
      fontSize: '14px',
      width: '100%'
    },
    select: {
      padding: '8px 12px',
      border: '1px solid #ddd',
      borderRadius: '4px',
      fontSize: '14px',
      width: '100%',
      backgroundColor: 'white'
    },
    label: {
      display: 'block',
      marginBottom: '5px',
      fontWeight: '500',
      color: '#555'
    },
    button: {
      padding: '10px 20px',
      backgroundColor: '#007bff',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      fontSize: '16px',
      cursor: 'pointer',
      marginTop: '20px'
    },
    buttonDisabled: {
      backgroundColor: '#ccc',
      cursor: 'not-allowed'
    },
    authSection: {
      backgroundColor: '#fff',
      padding: '20px',
      borderRadius: '8px',
      marginBottom: '20px',
      border: '1px solid #e9ecef'
    },
    mapContainer: {
      height: '600px',
      marginBottom: '20px',
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      position: 'relative'
    },
    chartContainer: {
      backgroundColor: 'white',
      padding: '20px',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      marginBottom: '20px'
    },
    forestInfo: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
      gap: '15px',
      marginBottom: '20px'
    },
    infoCard: {
      backgroundColor: '#f8f9fa',
      padding: '15px',
      borderRadius: '8px',
      border: '1px solid #e9ecef'
    },
    error: {
      backgroundColor: '#f8d7da',
      color: '#721c24',
      padding: '12px 20px',
      borderRadius: '4px',
      marginBottom: '20px',
      border: '1px solid #f5c6cb'
    },
    loading: {
      textAlign: 'center',
      padding: '40px',
      fontSize: '18px',
      color: '#666'
    },
    success: {
      backgroundColor: '#d4edda',
      color: '#155724',
      padding: '12px 20px',
      borderRadius: '4px',
      marginBottom: '20px',
      border: '1px solid #c3e6cb'
    },
    info: {
      backgroundColor: '#d1ecf1',
      color: '#0c5460',
      padding: '12px 20px',
      borderRadius: '4px',
      marginBottom: '20px',
      border: '1px solid #bee5eb'
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Forest Biomass Analysis - Sentinel-2 Integration</h1>

      {error && (
        <div style={styles.error}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {authenticated && authRef.current.accessToken && (
        <div style={styles.info}>
          <strong>Authentication Status:</strong>
          <ul style={{ fontSize: '14px', margin: '10px 0', paddingLeft: '20px' }}>
            <li>Token acquired: {new Date().toLocaleTimeString()}</li>
            <li>Token expires: {authRef.current.tokenExpiry ? new Date(authRef.current.tokenExpiry).toLocaleTimeString() : 'Unknown'}</li>
            <li>Time remaining: {authRef.current.tokenExpiry && isTokenValid() ? Math.max(0, Math.floor((authRef.current.tokenExpiry - Date.now()) / 1000)) + ' seconds' : 'Expired'}</li>
            <li>API endpoint: catalogue.dataspace.copernicus.eu/odata/v1</li>
          </ul>
        </div>
      )}

      <div style={styles.authSection}>
        <h3>Copernicus Data Space Configuration</h3>
        <div style={styles.info}>
          <strong>OAuth2 Client Credentials Flow:</strong>
          <ol style={{ margin: '10px 0', paddingLeft: '20px' }}>
            <li>Register at <a href="https://dataspace.copernicus.eu/" target="_blank" rel="noopener noreferrer">dataspace.copernicus.eu</a></li>
            <li>Create OAuth2 client (no refresh tokens in client credentials flow)</li>
            <li>Alternative: Generate token via command line:
              <pre style={{ backgroundColor: '#f5f5f5', padding: '10px', marginTop: '5px', fontSize: '11px', overflow: 'auto' }}>
{`curl -d "grant_type=client_credentials&client_id=YOUR_CLIENT_ID&\\
client_secret=YOUR_CLIENT_SECRET" \\
-H "Content-Type: application/x-www-form-urlencoded" \\
-X POST https://identity.dataspace.copernicus.eu/auth/realms/CDSE/\\
protocol/openid-connect/token`}
              </pre>
            </li>
          </ol>
        </div>
        <div style={styles.controls}>
          <div>
            <label style={styles.label}>Client ID</label>
            <input
              style={styles.input}
              type="text"
              placeholder="Enter your OAuth2 Client ID"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={authenticated}
            />
          </div>
          <div>
            <label style={styles.label}>Client Secret</label>
            <input
              style={styles.input}
              type="password"
              placeholder="Enter your OAuth2 Client Secret"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              disabled={authenticated}
            />
          </div>
          <div>
            <label style={styles.label}>Access Token (Manual Entry)</label>
            <input
              style={styles.input}
              type="text"
              placeholder="Paste access token if CORS blocked"
              onChange={(e) => {
                if (e.target.value) {
                  // Update ref instead of state to avoid stale closures
                  authRef.current.accessToken = e.target.value;
                  authRef.current.tokenExpiry = Date.now() + (540 * 1000); // 9 minutes
                  authRef.current.lastAuthTime = Date.now();
                  setAuthenticated(true);
                }
              }}
              disabled={authenticated}
            />
          </div>
          <div>
            <label style={styles.label}>Max Cloud Coverage (%)</label>
            <input
              style={styles.input}
              type="number"
              min="0"
              max="100"
              value={cloudCoverage}
              onChange={(e) => setCloudCoverage(parseInt(e.target.value))}
            />
          </div>
        </div>
        <button
          style={{
            ...styles.button,
            ...(authenticated ? styles.buttonDisabled : {})
          }}
          onClick={authenticateCDSE}
          disabled={authenticated}
        >
          {authenticated ? 'Authenticated' : 'Authenticate with CDSE'}
        </button>
        {authenticated && (
          <button
            style={{ ...styles.button, marginLeft: '10px' }}
            onClick={reauthenticate}
          >
            Re-authenticate
          </button>
        )}
      </div>

      <div style={styles.controls}>
        <div>
          <label style={styles.label}>Forest Type</label>
          <select
            style={styles.select}
            value={forestType}
            onChange={(e) => setForestType(e.target.value)}
          >
            <option value="pine">Pine</option>
            <option value="fir">Fir</option>
            <option value="birch">Birch</option>
            <option value="aspen">Aspen</option>
          </select>
        </div>
      </div>

      <div style={styles.mapContainer}>
        <MapContainer
          center={[61.086011, 24.065087]}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
          />
          <TileLayer
            url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            attribution='Labels &copy; <a href="https://www.esri.com/">Esri</a>'
          />
          <FeatureGroup>
            <DrawControl
              onCreated={handleCreated}
              onDeleted={handleDeleted}
            />
            {selectedForests.map((forest, idx) => (
              <Polygon
                key={forest.id}
                positions={forest.coords}
                pathOptions={{
                  color: idx === selectedForestIndex ? '#ff7800' : '#51a351',
                  weight: 3,
                  opacity: 0.8,
                  fillOpacity: 0.3
                }}
                eventHandlers={{
                  click: () => setSelectedForestIndex(idx)
                }}
              />
            ))}
          </FeatureGroup>
        </MapContainer>
      </div>

      <button
        style={{
          ...styles.button,
          ...(loading || selectedForests.length === 0 || !authenticated ? styles.buttonDisabled : {})
        }}
        onClick={fetchSatelliteData}
        disabled={loading || selectedForests.length === 0 || !authenticated}
      >
        {loading ? 'Processing Sentinel-2 Data...' : 'Analyze Full Sentinel-2 Archive (2015-Present)'}
      </button>

      {selectedForests.length > 0 && (
        <div style={styles.forestInfo}>
          {selectedForests.map((forest, idx) => (
            <div
              key={forest.id}
              style={{
                ...styles.infoCard,
                border: idx === selectedForestIndex ? '2px solid #ff7800' : '1px solid #e9ecef',
                cursor: 'pointer'
              }}
              onClick={() => setSelectedForestIndex(idx)}
            >
              <h3>Forest #{idx + 1}</h3>
              <p><strong>Type:</strong> {forest.type}</p>
              <p><strong>Area:</strong> {forest.area} hectares</p>
              <p><strong>Data Source:</strong> Sentinel-2 MSI</p>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div style={styles.loading}>
          <p>Processing Sentinel-2 imagery...</p>
          <p style={{ fontSize: '14px', color: '#999' }}>{processingStatus}</p>
        </div>
      )}

      {biomassData.length > 0 && (
        <div style={styles.chartContainer}>
          <h2>Historical Biomass Analysis</h2>
          
          {simulatedDataCount > 0 && (
            <div style={{
              backgroundColor: '#fff3cd',
              color: '#856404',
              padding: '12px 20px',
              borderRadius: '4px',
              marginBottom: '20px',
              border: '1px solid #ffeaa7',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <strong>⚠️ API Failure Warning:</strong>
              <span>{simulatedDataCount} of {biomassData.length} data points ({((simulatedDataCount / biomassData.length) * 100).toFixed(1)}%) are using fallback NDVI estimation due to API failures. These simulated values are marked with hollow dots in the chart.</span>
            </div>
          )}
          
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
            NDVI time series from Sentinel-2 MSI (10m resolution for B4/B8).
            Cloud-filtered scenes with less than {cloudCoverage}% cloud coverage.
            Processed via Copernicus Data Space Ecosystem API.
          </p>
          
          <div style={styles.controls}>
            <div>
              <label style={styles.label}>Growth Trend Start Date</label>
              <input
                style={styles.input}
                type="date"
                value={trendStartDate}
                onChange={(e) => setTrendStartDate(e.target.value)}
                min={biomassData[0]?.date}
                max={biomassData[biomassData.length - 1]?.date}
              />
            </div>
            <div>
              <label style={styles.label}>Growth Trend End Date</label>
              <input
                style={styles.input}
                type="date"
                value={trendEndDate}
                onChange={(e) => setTrendEndDate(e.target.value)}
                min={biomassData[0]?.date}
                max={biomassData[biomassData.length - 1]?.date}
              />
            </div>
          </div>

          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={biomassData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={100}
                interval={Math.floor(biomassData.length / 20)}
              />
              <YAxis yAxisId="biomass" orientation="left" label={{ value: 'Biomass (tons/ha)', angle: -90, position: 'insideLeft' }} />
              <YAxis yAxisId="ndvi" orientation="right" label={{ value: 'NDVI', angle: 90, position: 'insideRight' }} domain={[-0.2, 1]} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        padding: '10px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }}>
                        <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>{label}</p>
                        {data.isSimulated && (
                          <p style={{ margin: '2px 0', fontSize: '12px', color: '#ff6b6b', fontWeight: 'bold' }}>
                            ⚠️ SIMULATED DATA (API Failure)
                          </p>
                        )}
                        <p style={{ margin: '2px 0', fontSize: '12px' }}>
                          NDVI: {data.ndvi.toFixed(3)}
                        </p>
                        <p style={{ margin: '2px 0', fontSize: '12px' }}>
                          Biomass: {data.biomass.toFixed(1)} tons/ha
                        </p>
                        {data.biomassMean && (
                          <p style={{ margin: '2px 0', fontSize: '12px', color: '#ff0000', fontWeight: 'bold' }}>
                            Annual Mean: {data.biomassMean.toFixed(1)} tons/ha
                          </p>
                        )}
                        <p style={{ margin: '2px 0', fontSize: '12px', color: '#666' }}>
                          Cloud Cover: {data.cloudCover.toFixed(1)}%
                        </p>
                        <p style={{ margin: '2px 0', fontSize: '10px', color: '#999' }}>
                          Source: {data.isSimulated ? 'Seasonal Model' : 'Sentinel-2 API'}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend />
              <Line
                yAxisId="biomass"
                type="monotone"
                dataKey="biomass"
                stroke="#82ca9d"
                name="Scene Biomass"
                strokeWidth={0}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={3}
                      fill={payload.isSimulated ? 'none' : '#82ca9d'}
                      stroke="#82ca9d"
                      strokeWidth={payload.isSimulated ? 2 : 0}
                    />
                  );
                }}
              />
              <Line
                yAxisId="ndvi"
                type="monotone"
                dataKey="ndvi"
                stroke="#8884d8"
                name="Scene NDVI"
                strokeWidth={0}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={3}
                      fill={payload.isSimulated ? 'none' : '#8884d8'}
                      stroke="#8884d8"
                      strokeWidth={payload.isSimulated ? 2 : 0}
                    />
                  );
                }}
              />
              <Line
                yAxisId="biomass"
                type="monotone"
                dataKey="biomassMean"
                stroke="#ff0000"
                name="Annual Mean"
                strokeWidth={3}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>

          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
            <h4>Analysis Summary</h4>
            <p style={{ fontSize: '14px', margin: '5px 0' }}>
              Total Observations: {biomassData.length} cloud-free scenes
            </p>
            <p style={{ fontSize: '14px', margin: '5px 0' }}>
              Real Data (Sentinel-2 API): {biomassData.length - simulatedDataCount} scenes ({((biomassData.length - simulatedDataCount) / biomassData.length * 100).toFixed(1)}%)
            </p>
            <p style={{ fontSize: '14px', margin: '5px 0' }}>
              Simulated Data (Fallback): {simulatedDataCount} scenes ({(simulatedDataCount / biomassData.length * 100).toFixed(1)}%)
            </p>
            <p style={{ fontSize: '14px', margin: '5px 0' }}>
              Analysis Period: {biomassData[0]?.year} - {biomassData[biomassData.length - 1]?.year}
            </p>
            <p style={{ fontSize: '14px', margin: '5px 0' }}>
              Average NDVI: {(biomassData.reduce((sum, d) => sum + d.ndvi, 0) / biomassData.length).toFixed(3)}
            </p>
            <p style={{ fontSize: '14px', margin: '5px 0' }}>
              Average Biomass: {(biomassData.reduce((sum, d) => sum + d.biomass, 0) / biomassData.length).toFixed(1)} tons/ha
            </p>
            <p style={{ fontSize: '14px', margin: '5px 0' }}>
              Growth Trend: {(() => {
                // Calculate yearly means for growth trend
                const startDate = trendStartDate || biomassData[0]?.date;
                const endDate = trendEndDate || biomassData[biomassData.length - 1]?.date;
                
                // Filter data based on date range
                const filteredData = biomassData.filter(d => 
                  d.date >= startDate && d.date <= endDate
                );
                
                if (filteredData.length === 0) return 'No data in selected range';
                
                // Group by year and calculate means
                const yearlyMeans = {};
                filteredData.forEach(d => {
                  if (!yearlyMeans[d.year]) {
                    yearlyMeans[d.year] = { sum: 0, count: 0 };
                  }
                  yearlyMeans[d.year].sum += d.biomass;
                  yearlyMeans[d.year].count++;
                });
                
                // Convert to array and sort by year
                const years = Object.keys(yearlyMeans).sort();
                if (years.length < 2) return 'Insufficient data for trend';
                
                // Calculate mean for first and last year
                const firstYearMean = yearlyMeans[years[0]].sum / yearlyMeans[years[0]].count;
                const lastYearMean = yearlyMeans[years[years.length - 1]].sum / yearlyMeans[years[years.length - 1]].count;
                
                // Calculate percentage change
                const trendPercent = ((lastYearMean - firstYearMean) / firstYearMean * 100).toFixed(1);
                
                return `${trendPercent}% (${years[0]}-${years[years.length - 1]}, from ${firstYearMean.toFixed(1)} to ${lastYearMean.toFixed(1)} tons/ha)`;
              })()}
            </p>
          </div>
        </div>
      )}

      <div style={styles.info}>
        <h4>Technical Notes</h4>
        <ul style={{ fontSize: '14px', margin: '10px 0', paddingLeft: '20px' }}>
          <li>Sentinel Satellite active from 2015-08</li>
          <li>Authentication: OAuth2 Client Credentials Flow (no refresh tokens)</li>
          <li>Token endpoint: https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token</li>
          <li>Grant type: client_credentials (access token: 600s expiry)</li>
          <li>Token management: Using ref to avoid stale closure issues</li>
          <li>Stale closure prevention: authRef.current stores mutable token state</li>
          <li>Re-authentication protection: Minimum 5s gap, mutex to prevent concurrent auth</li>
          <li>Rate limiting: Global rate limit tracking with exponential backoff (base: 3s, max: 30s)</li>
          <li>API resilience: Token validation before requests, 401 retry with re-authentication</li>
          <li>Data source: Copernicus Data Space Ecosystem OData API + Sentinel Hub Statistical API</li>
          <li>NDVI Processing: Real-time calculation via Sentinel Hub Statistical API</li>
          <li>Cloud masking: Scene Classification Layer (SCL) band filters</li>
          <li>Spatial resolution: 10m for NDVI bands (B4/B8)</li>
          <li>Temporal resolution: ~5 days (combined S2A/S2B)</li>
          <li>Statistical API endpoint: https://sh.dataspace.copernicus.eu/api/v1/statistics</li>
          <li>Error handling: 3 retries per request with exponential backoff</li>
          <li>Biomass estimation: Empirical exponential model based on NDVI</li>
          <li>OPTIMIZED: Extended temporal window (±7 days), refined SCL masking, enhanced debug logging</li>
          <li>VALIDATED: Response structure checks sampleCount is bigger noDataCount before processing statistics</li>
        </ul>
      </div>
    </div>
  );
};

export default ForestBiomassApp;