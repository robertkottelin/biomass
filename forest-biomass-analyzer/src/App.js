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
  const [forestAge, setForestAge] = useState(20);
  const [biomassData, setBiomassData] = useState([]);
  const [selectedForestIndex, setSelectedForestIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [processingStatus, setProcessingStatus] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [tokenExpiry, setTokenExpiry] = useState(null);
  const [manualAuthMode, setManualAuthMode] = useState(false);
  const mapRef = useRef();

  // Forest parameters with growth curves based on scientific literature
  const forestParams = {
    pine: { 
      maxBiomass: 450,      // Maximum biomass (tons/ha) at maturity
      growthRate: 0.08,     // Growth rate parameter
      ndviSaturation: 0.85, // NDVI saturation level for mature forest
      youngBiomass: 20      // Initial biomass for young forest
    },
    fir: { 
      maxBiomass: 500,
      growthRate: 0.07,
      ndviSaturation: 0.88,
      youngBiomass: 25
    },
    birch: { 
      maxBiomass: 300,
      growthRate: 0.12,
      ndviSaturation: 0.82,
      youngBiomass: 15
    },
    aspen: { 
      maxBiomass: 250,
      growthRate: 0.15,
      ndviSaturation: 0.80,
      youngBiomass: 12
    }
  };

  // Load GeometryUtil on mount
  useEffect(() => {
    loadGeometryUtil();
  }, []);

  // Check token expiry
  useEffect(() => {
    if (tokenExpiry && Date.now() > tokenExpiry) {
      setAuthenticated(false);
      setAccessToken('');
      setTokenExpiry(null);
      setError('Authentication token expired. Please re-authenticate.');
    }
  }, [tokenExpiry]);

  // Authenticate with Copernicus Data Space
  const authenticateCDSE = async () => {
    if (!clientId || !clientSecret) {
      setError('Client ID and Client Secret required');
      return false;
    }

    setError(null);
    setProcessingStatus('Authenticating...');

    try {
      const tokenData = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      });

      // Copernicus Data Space authentication endpoint
      const tokenResponse = await fetch('https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: tokenData
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Authentication failed:', errorText);
        throw new Error(`Authentication failed: ${tokenResponse.status}`);
      }

      const tokenResult = await tokenResponse.json();
      console.log('Authentication successful, token expires in:', tokenResult.expires_in, 'seconds');
      
      setAccessToken(tokenResult.access_token);
      setTokenExpiry(Date.now() + ((tokenResult.expires_in - 60) * 1000));
      setAuthenticated(true);
      setProcessingStatus('');
      
      return true;
    } catch (err) {
      setError(`Authentication failed: ${err.message}. Use manual token mode if CORS is blocking.`);
      setProcessingStatus('');
      return false;
    }
  };

  // Estimate biomass using growth model and NDVI
  const estimateBiomass = (ndvi, forestType, yearsFromStart, currentForestAge) => {
    const params = forestParams[forestType];
    
    // For water bodies (negative NDVI), return 0 biomass
    if (ndvi < 0) {
      return 0;
    }
    
    // Logistic growth model for forest biomass accumulation
    const currentAge = currentForestAge + yearsFromStart;
    const growthFactor = 1 - Math.exp(-params.growthRate * currentAge);
    
    // NDVI-based adjustment factor (accounts for vegetation health/density)
    const ndviNormalized = Math.max(0, ndvi) / params.ndviSaturation;
    const ndviFactor = Math.min(1, ndviNormalized);
    
    // Calculate biomass combining growth model and NDVI
    const biomass = params.youngBiomass + 
                   (params.maxBiomass - params.youngBiomass) * growthFactor * ndviFactor;
    
    return Math.max(0, biomass);
  };

  // Calculate rolling average with specified window size
  const calculateRollingAverage = (data, key, windowSize) => {
    return data.map((item, index) => {
      const startIndex = Math.max(0, index - windowSize + 1);
      const windowData = data.slice(startIndex, index + 1);
      
      const sum = windowData.reduce((acc, d) => acc + d[key], 0);
      const average = sum / windowData.length;
      
      return {
        ...item,
        [`${key}RollingAvg`]: average
      };
    });
  };

  // Use Statistical API for actual NDVI data
  const fetchNDVIStatistics = async (polygon, dateFrom, dateTo) => {
    const coords = polygon.coords.map(coord => [coord[1], coord[0]]); // lon,lat
    
    // Calculate polygon bounds and appropriate resolution
    const lons = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    
    // Calculate approximate polygon dimensions in meters
    const latDistance = (maxLat - minLat) * 111000; // ~111km per degree latitude
    const lonDistance = (maxLon - minLon) * 111000 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
    const maxDimension = Math.max(latDistance, lonDistance);
    
    // Convert WGS84 to appropriate UTM zone for Finland
    const centerLon = (minLon + maxLon) / 2;
    const utmZone = Math.floor((centerLon + 180) / 6) + 1; // UTM zone calculation
    
    // For Finland (around 24°E), this is typically UTM zone 35N (EPSG:32635)
    const EPSG_CODE = 32635; // UTM zone 35N for Finland
    
    // Convert polygon to projected coordinates (approximate conversion for demo)
    // In production, use a proper coordinate transformation library
    const projectedCoords = coords.map(coord => {
      const lon = coord[0];
      const lat = coord[1];
      
      // Approximate UTM conversion (simplified for demo)
      const k0 = 0.9996; // UTM scale factor
      const a = 6378137; // WGS84 semi-major axis
      const e = 0.08181919084; // WGS84 eccentricity
      
      const lonRad = lon * Math.PI / 180;
      const latRad = lat * Math.PI / 180;
      const lonOrigin = ((utmZone - 1) * 6 - 180 + 3) * Math.PI / 180;
      
      const N = a / Math.sqrt(1 - e * e * Math.sin(latRad) * Math.sin(latRad));
      const T = Math.tan(latRad) * Math.tan(latRad);
      const C = e * e * Math.cos(latRad) * Math.cos(latRad) / (1 - e * e);
      const A = Math.cos(latRad) * (lonRad - lonOrigin);
      
      const M = a * ((1 - e * e / 4 - 3 * e * e * e * e / 64) * latRad
        - (3 * e * e / 8 + 3 * e * e * e * e / 32) * Math.sin(2 * latRad)
        + (15 * e * e * e * e / 256) * Math.sin(4 * latRad));
      
      const easting = k0 * N * (A + (1 - T + C) * A * A * A / 6) + 500000;
      const northing = k0 * (M + N * Math.tan(latRad) * (A * A / 2));
      
      return [easting, northing];
    });
    
    // Use projected resolution in meters
    const resolutionMeters = 10; // Always use 10m for Sentinel-2 native resolution
    
    console.log(`Using UTM Zone ${utmZone}N (EPSG:${EPSG_CODE})`);
    console.log(`Resolution: ${resolutionMeters}m`);
    
    // Statistical API evalscript for NDVI
    const evalscript = `
      //VERSION=3
      function setup() {
        return {
          input: [
            {
              bands: ["B04", "B08"],
              units: "REFLECTANCE"
            },
            {
              bands: ["SCL", "dataMask"],
              units: "DN"
            }
          ],
          output: [
            {
              id: "ndvi",
              bands: 1,
              sampleType: "FLOAT32"
            },
            {
              id: "ndvi_valid_pixels",
              bands: 1,
              sampleType: "UINT16"
            },
            {
              id: "dataMask",
              bands: 1,
              sampleType: "UINT8"
            }
          ]
        };
      }
      
      function evaluatePixel(samples) {
        // Calculate NDVI from reflectance values
        let ndvi = (samples.B08 - samples.B04) / (samples.B08 + samples.B04 + 0.00001);
        
        // Validate pixel: must be vegetation (SCL 4 or 5) or water (SCL 6)
        // SCL values are in DN units (integer classification values)
        let isValid = samples.dataMask === 1 && 
                     (samples.SCL === 4 || samples.SCL === 5 || samples.SCL === 6);
        
        return {
          ndvi: [isValid ? ndvi : NaN],
          ndvi_valid_pixels: [isValid ? 1 : 0],
          dataMask: [samples.dataMask]
        };
      }
    `;
    
    const statsRequest = {
      input: {
        bounds: {
          geometry: {
            type: "Polygon",
            coordinates: [[...projectedCoords, projectedCoords[0]]]
          },
          properties: {
            crs: `http://www.opengis.net/def/crs/EPSG/0/${EPSG_CODE}`
          }
        },
        data: [{
          dataFilter: {
            timeRange: {
              from: `${dateFrom}T00:00:00Z`,
              to: `${dateTo}T23:59:59Z`
            },
            maxCloudCoverage: 30,
            mosaickingOrder: "leastCC"
          },
          type: "sentinel-2-l2a"
        }]
      },
      aggregation: {
        evalscript: evalscript,
        timeRange: {
          from: `${dateFrom}T00:00:00Z`,
          to: `${dateTo}T23:59:59Z`
        },
        aggregationInterval: {
          of: "P1D"
        },
        resx: resolutionMeters,
        resy: resolutionMeters
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
    
    // Log the complete request for debugging
    console.log('=== STATISTICAL API REQUEST ===');
    console.log('Endpoint:', 'https://sh.dataspace.copernicus.eu/api/v3/statistics');
    console.log('Request payload:', JSON.stringify(statsRequest, null, 2));
    console.log('Auth token (first 20 chars):', accessToken.substring(0, 20) + '...');
    
    try {
      const response = await fetch('https://sh.dataspace.copernicus.eu/api/v3/statistics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(statsRequest)
      });
      
      const responseText = await response.text();
      console.log('=== STATISTICAL API RESPONSE ===');
      console.log('Status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      console.log('Response body:', responseText);
      
      if (!response.ok) {
        console.error(`Statistics API error: ${response.status} - ${responseText}`);
        
        // If auth fails, try to parse error
        if (response.status === 401) {
          throw new Error('Authentication failed. Token may be expired.');
        }
        
        // Check for specific dataset error
        if (responseText.includes('Dataset with id')) {
          console.error('Dataset ID error - Collection type may need adjustment for Copernicus Data Space');
          throw new Error('Dataset not found. Collection ID may be incorrect for this endpoint.');
        }
        
        throw new Error(`Failed to fetch statistics: ${response.status}`);
      }
      
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse response JSON:', parseError);
        throw new Error('Invalid JSON response from API');
      }
      
      console.log('=== PARSED STATISTICS RESULT ===');
      console.log(JSON.stringify(result, null, 2));
      
      return result;
    } catch (error) {
      console.error('Statistics API error:', error);
      throw error;
    }
  };

  // Process satellite data using actual API calls
  const fetchSatelliteData = async () => {
    if (selectedForests.length === 0) {
      setError('Draw at least one forest polygon');
      return;
    }

    if (!authenticated) {
      setError('Authenticate first or use manual token');
      return;
    }

    if (selectedForestIndex >= selectedForests.length) {
      setError('Invalid forest selection');
      return;
    }

    setLoading(true);
    setError(null);
    setBiomassData([]);
    setProcessingStatus('Fetching real satellite data...');

    try {
      const selectedForest = selectedForests[selectedForestIndex];
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-indexed
      const results = [];
      const startYear = currentYear - 10;
      
      // Process last 10 years of summer data
      for (let year = startYear; year <= currentYear; year++) {
        const yearsFromStart = year - startYear;
        
        // Skip future dates
        if (year === currentYear && currentMonth < 9) {
          // If we're in the current year but haven't reached September yet,
          // skip this year's summer data as it may not be complete
          console.log(`Skipping ${year} as summer season not complete yet`);
          continue;
        }
        
        // Define date range for summer season (May-August)
        const dateFrom = `${year}-05-01`;
        const dateTo = `${year}-08-31`;
        
        setProcessingStatus(`Fetching Sentinel-2 data for ${year} summer season...`);
        
        try {
          // Fetch actual statistics from Sentinel Hub
          const statsResponse = await fetchNDVIStatistics(selectedForest, dateFrom, dateTo);
          
          if (statsResponse && statsResponse.data && statsResponse.data.length > 0) {
            // Process each available acquisition
            let validData = 0;
            let totalNDVI = 0;
            let maxNDVI = -1;
            let minNDVI = 1;
            
            for (const dataPoint of statsResponse.data) {
              // Statistical API returns data in a different structure
              // Check for the default output (since we used "default" in calculations)
              if (dataPoint.outputs) {
                // Try different possible output structures
                let stats = null;
                
                // Try structure 1: outputs.default
                if (dataPoint.outputs.default && dataPoint.outputs.default.bands && dataPoint.outputs.default.bands.B0) {
                  stats = dataPoint.outputs.default.bands.B0.stats;
                }
                // Try structure 2: outputs.ndvi (in case output ID matters)
                else if (dataPoint.outputs.ndvi && dataPoint.outputs.ndvi.bands && dataPoint.outputs.ndvi.bands.B0) {
                  stats = dataPoint.outputs.ndvi.bands.B0.stats;
                }
                // Try structure 3: outputs.output_ndvi
                else if (dataPoint.outputs.output_ndvi && dataPoint.outputs.output_ndvi.bands && dataPoint.outputs.output_ndvi.bands.B0) {
                  stats = dataPoint.outputs.output_ndvi.bands.B0.stats;
                }
                
                if (stats && stats.mean !== undefined && !isNaN(stats.mean)) {
                  validData++;
                  totalNDVI += stats.mean;
                  maxNDVI = Math.max(maxNDVI, stats.max || stats.mean);
                  minNDVI = Math.min(minNDVI, stats.min || stats.mean);
                  
                  console.log(`Found valid data for ${dataPoint.interval.from}: NDVI mean=${stats.mean.toFixed(3)}`);
                }
              }
            }
            
            if (validData > 0) {
              const avgNDVI = totalNDVI / validData;
              
              // Check if this is likely water (NDVI < 0.1) 
              const isWater = avgNDVI < 0.1;
              
              if (isWater && year === startYear) {
                setError('Selected area appears to be water body (NDVI < 0.1). Please select a forested area.');
              }
              
              const biomass = estimateBiomass(avgNDVI, selectedForest.type, yearsFromStart, forestAge);
              
              results.push({
                date: `${year}-07-15`,
                year,
                month: 7,
                yearsFromStart,
                ndvi: avgNDVI,
                ndviMin: minNDVI,
                ndviMax: maxNDVI,
                biomass,
                forestAge: forestAge + yearsFromStart,
                dataPoints: validData,
                isWater: isWater
              });
            } else {
              // No valid data for this year
              console.warn(`No valid data for ${year}`);
            }
          }
        } catch (yearError) {
          console.error(`Error processing year ${year}:`, yearError);
          // Continue with next year
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (results.length === 0) {
        setError('No valid satellite data found for the selected area and time period.');
        return;
      }
      
      // Sort by date
      results.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Calculate rolling averages
      const resultsWithRollingAvg = calculateRollingAverage(results, 'biomass', 3);
      const finalResults = calculateRollingAverage(resultsWithRollingAvg, 'ndvi', 3);
      
      setBiomassData(finalResults);
      setProcessingStatus('');
      
      // Check if the area is consistently water
      const waterCount = finalResults.filter(d => d.isWater).length;
      if (waterCount > finalResults.length * 0.7) {
        setError('Warning: This area shows characteristics of a water body (low NDVI). Biomass estimates may not be accurate.');
      }
      
    } catch (err) {
      setError(`Processing error: ${err.message}`);
    } finally {
      setLoading(false);
      setProcessingStatus('');
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
      type: forestType
    };

    setSelectedForests(prev => [...prev, newForest]);
  }, [forestType]);

  const handleDeleted = useCallback((e) => {
    setSelectedForests([]);
    setSelectedForestIndex(0);
    setBiomassData([]);
  }, []);

  const handleForestTypeChange = (newType) => {
    setForestType(newType);
    
    if (selectedForests.length > 0 && selectedForestIndex < selectedForests.length) {
      setSelectedForests(prevForests => {
        const updatedForests = [...prevForests];
        updatedForests[selectedForestIndex] = {
          ...updatedForests[selectedForestIndex],
          type: newType
        };
        return updatedForests;
      });
      
      setBiomassData([]);
    }
  };

  // Export data to CSV
  const exportToCSV = () => {
    if (biomassData.length === 0) return;
    if (selectedForests.length === 0 || selectedForestIndex >= selectedForests.length) return;

    const headers = [
      'Date',
      'Year',
      'Month',
      'Forest Age (years)',
      'NDVI Mean',
      'NDVI Min',
      'NDVI Max',
      'NDVI Rolling Avg',
      'Biomass (tons/ha)',
      'Biomass Rolling Avg (tons/ha)',
      'Forest Type',
      'Forest Area (ha)',
      'Valid Data Points',
      'Is Water Body'
    ];

    const csvRows = biomassData.map(row => [
      row.date,
      row.year,
      row.month,
      row.forestAge,
      row.ndvi.toFixed(4),
      row.ndviMin ? row.ndviMin.toFixed(4) : 'N/A',
      row.ndviMax ? row.ndviMax.toFixed(4) : 'N/A',
      row.ndviRollingAvg.toFixed(4),
      row.biomass.toFixed(2),
      row.biomassRollingAvg.toFixed(2),
      selectedForests[selectedForestIndex].type,
      selectedForests[selectedForestIndex].area,
      row.dataPoints || 'N/A',
      row.isWater ? 'Yes' : 'No'
    ]);

    const csvContent = [
      headers.join(','),
      ...csvRows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const filename = `forest_biomass_${selectedForests[selectedForestIndex].type}_${new Date().toISOString().slice(0, 10)}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const styles = {
    container: {
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
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
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
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
    warning: {
      backgroundColor: '#fff3cd',
      color: '#856404',
      padding: '12px 20px',
      borderRadius: '4px',
      marginBottom: '20px',
      border: '1px solid #ffeeba'
    },
    loading: {
      textAlign: 'center',
      padding: '40px',
      fontSize: '18px',
      color: '#666'
    },
    info: {
      backgroundColor: '#d1ecf1',
      color: '#0c5460',
      padding: '12px 20px',
      borderRadius: '4px',
      marginBottom: '20px',
      border: '1px solid #bee5eb'
    },
    techDetails: {
      marginTop: '20px',
      padding: '15px',
      backgroundColor: '#f8f9fa',
      borderRadius: '4px',
      fontSize: '14px'
    },
    exportButton: {
      padding: '10px 20px',
      backgroundColor: '#28a745',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      fontSize: '16px',
      cursor: 'pointer',
      marginLeft: '10px'
    },
    buttonContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      marginBottom: '20px'
    },
    checkbox: {
      marginRight: '8px'
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Kalliomarken - Real-time Sentinel-2 NDVI & Biomass Analysis</h1>
      
      <div style={styles.info}>
        <strong>Copernicus Sentinel-2 L2A - Actual Satellite Data Processing</strong>
        <ul style={{ fontSize: '14px', margin: '10px 0', paddingLeft: '20px' }}>
          <li>Fetches real Sentinel-2 satellite imagery via Statistical API</li>
          <li>Calculates actual NDVI from NIR (B08) and Red (B04) bands</li>
          <li>Filters vegetation pixels using Scene Classification Layer (SCL)</li>
          <li>Detects water bodies (NDVI {'<'} 0.1) and alerts user</li>
          <li>Applies species-specific growth models to estimate biomass</li>
        </ul>
      </div>

      {error && (
        <div style={error.includes('Warning') ? styles.warning : styles.error}>
          <strong>{error.includes('Warning') ? 'Warning:' : 'Error:'}</strong> {error}
        </div>
      )}

      <div style={styles.authSection}>
        <h3>Authentication</h3>
        <div style={{ marginBottom: '10px' }}>
          <label>
            <input
              type="checkbox"
              style={styles.checkbox}
              checked={manualAuthMode}
              onChange={(e) => setManualAuthMode(e.target.checked)}
            />
            Use manual token mode (if CORS blocks direct auth)
          </label>
        </div>
        
        {!manualAuthMode ? (
          <div style={styles.controls}>
            <div>
              <label style={styles.label}>Client ID</label>
              <input
                style={styles.input}
                type="text"
                placeholder="OAuth2 Client ID"
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
                placeholder="OAuth2 Client Secret"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                disabled={authenticated}
              />
            </div>
          </div>
        ) : (
          <div>
            <label style={styles.label}>Access Token (get from Copernicus Data Space)</label>
            <input
              style={styles.input}
              type="text"
              placeholder="Paste your access token here"
              onChange={(e) => {
                if (e.target.value) {
                  setAccessToken(e.target.value);
                  setTokenExpiry(Date.now() + (540 * 1000)); // 9 minutes
                  setAuthenticated(true);
                  setError(null);
                }
              }}
              disabled={authenticated}
            />
            <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              Get token from: https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token
            </p>
          </div>
        )}
        
        {!manualAuthMode && (
          <button
            style={{
              ...styles.button,
              ...(authenticated ? styles.buttonDisabled : {})
            }}
            onClick={authenticateCDSE}
            disabled={authenticated}
          >
            {authenticated ? 'Authenticated' : 'Authenticate'}
          </button>
        )}
        
        {authenticated && (
          <p style={{ color: '#28a745', marginTop: '10px' }}>
            ✓ Authenticated successfully
          </p>
        )}
      </div>

      <div style={styles.controls}>
        <div>
          <label style={styles.label}>Forest Type</label>
          <select
            style={styles.select}
            value={forestType}
            onChange={(e) => handleForestTypeChange(e.target.value)}
          >
            <option value="pine">Pine</option>
            <option value="fir">Fir</option>
            <option value="birch">Birch</option>
            <option value="aspen">Aspen</option>
          </select>
        </div>
        <div>
          <label style={styles.label}>Forest Age (years at start)</label>
          <input
            style={styles.input}
            type="number"
            min="1"
            max="100"
            value={forestAge}
            onChange={(e) => setForestAge(parseInt(e.target.value) || 20)}
          />
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
        {loading ? 'Processing Real Satellite Data...' : 'Analyze with Real Sentinel-2 Data'}
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
              <p><strong>Initial Age:</strong> {forestAge} years</p>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div style={styles.loading}>
          <p>Processing real Sentinel-2 satellite data...</p>
          <p style={{ fontSize: '14px', color: '#999' }}>{processingStatus}</p>
        </div>
      )}

      {biomassData.length > 0 && (
        <div style={styles.chartContainer}>
          <div style={styles.buttonContainer}>
            <h2 style={{ margin: 0 }}>Real Satellite Data: NDVI & Biomass Trends</h2>
            <button
              style={styles.exportButton}
              onClick={exportToCSV}
              title="Export complete data to CSV"
            >
              Export CSV
            </button>
          </div>
          
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={biomassData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis 
                yAxisId="biomass" 
                orientation="left" 
                label={{ value: 'Biomass (tons/ha)', angle: -90, position: 'insideLeft' }} 
              />
              <YAxis 
                yAxisId="ndvi" 
                orientation="right" 
                label={{ value: 'NDVI', angle: 90, position: 'insideRight' }} 
                domain={[-0.2, 1]}
              />
              <Tooltip 
                formatter={(value, name) => {
                  if (name === 'Biomass') return [`${value.toFixed(1)} t/ha`, name];
                  if (name === 'NDVI') return [value.toFixed(3), name];
                  if (name === 'Biomass Trend') return [`${value.toFixed(1)} t/ha`, name];
                  if (name === 'NDVI Trend') return [value.toFixed(3), name];
                  return [value, name];
                }}
                labelFormatter={(label) => {
                  const item = biomassData.find(d => d.date === label);
                  return item ? `${label} (Forest Age: ${item.forestAge} years, ${item.dataPoints} observations)` : label;
                }}
              />
              <Legend />
              
              <Line
                yAxisId="biomass"
                type="monotone"
                dataKey="biomass"
                stroke="#82ca9d"
                name="Biomass"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line
                yAxisId="ndvi"
                type="monotone"
                dataKey="ndvi"
                stroke="#8884d8"
                name="NDVI"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              
              {/* Rolling average trend lines */}
              <Line
                yAxisId="biomass"
                type="monotone"
                dataKey="biomassRollingAvg"
                stroke="#2ca02c"
                name="Biomass Trend"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={false}
              />
              <Line
                yAxisId="ndvi"
                type="monotone"
                dataKey="ndviRollingAvg"
                stroke="#1f77b4"
                name="NDVI Trend"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>

          <div style={styles.techDetails}>
            <h3>Technical Implementation - Real Satellite Data Processing</h3>
            
            <h4>1. Sentinel Hub Statistical API Integration</h4>
            <p><strong>API Endpoint:</strong> https://sh.dataspace.copernicus.eu/api/v3/statistics</p>
            <p><strong>Authentication:</strong> OAuth2 Bearer Token</p>
            <p><strong>Data Collection:</strong> sentinel-2-l2a (Level-2A atmospherically corrected)</p>
            <p><strong>Spatial Resolution:</strong> 10m × 10m pixels</p>
            <p><strong>Cloud Coverage Filter:</strong> Maximum 30%</p>
            
            <h4>2. NDVI Calculation from Real Satellite Data</h4>
            <pre style={{ fontSize: '12px', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
{`// Evalscript executed on Sentinel Hub servers
function evaluatePixel(samples) {
  // Calculate NDVI from real band values
  let ndvi = (samples.B08 - samples.B04) / (samples.B08 + samples.B04 + 0.00001);
  
  // Validate pixel using Scene Classification Layer
  let isValid = samples.dataMask === 1 && 
               (samples.SCL === 4 ||  // Vegetation
                samples.SCL === 5 ||  // Not vegetated
                samples.SCL === 6);   // Water
  
  return {
    ndvi: [isValid ? ndvi : NaN],
    ndvi_valid_pixels: [isValid ? 1 : 0]
  };
}`}
            </pre>
            
            <h4>3. Current Analysis Results</h4>
            {biomassData.length > 0 && (
              <ul style={{ fontSize: '13px', marginLeft: '20px' }}>
                <li><strong>Data Points:</strong> {biomassData.length} temporal observations</li>
                <li><strong>Average NDVI:</strong> {(biomassData.reduce((sum, d) => sum + d.ndvi, 0) / biomassData.length).toFixed(3)}</li>
                <li><strong>NDVI Range:</strong> {Math.min(...biomassData.map(d => d.ndvi)).toFixed(3)} to {Math.max(...biomassData.map(d => d.ndvi)).toFixed(3)}</li>
                <li><strong>Total Biomass Change:</strong> {((biomassData[biomassData.length-1].biomass - biomassData[0].biomass) / biomassData[0].biomass * 100).toFixed(1)}%</li>
                <li><strong>Water Detection:</strong> {biomassData.some(d => d.isWater) ? 'Water characteristics detected' : 'Vegetation confirmed'}</li>
              </ul>
            )}
            
            <h4>4. Scene Classification Layer (SCL) Classes Used</h4>
            <table style={{ fontSize: '13px', borderCollapse: 'collapse', marginTop: '10px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f0f0f0' }}>
                  <th style={{ padding: '8px', border: '1px solid #ddd' }}>SCL Value</th>
                  <th style={{ padding: '8px', border: '1px solid #ddd' }}>Class</th>
                  <th style={{ padding: '8px', border: '1px solid #ddd' }}>Used</th>
                  <th style={{ padding: '8px', border: '1px solid #ddd' }}>Expected NDVI</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>4</td>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>Vegetation</td>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>✓</td>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>0.3 - 0.9</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>5</td>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>Not vegetated</td>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>✓</td>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>0.0 - 0.3</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>6</td>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>Water</td>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>✓</td>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>-0.2 - 0.1</td>
                </tr>
                <tr style={{ backgroundColor: '#f8f8f8' }}>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>8, 9</td>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>Cloud medium/high</td>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>✗</td>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>Filtered out</td>
                </tr>
              </tbody>
            </table>
            
            <h4>5. API Response Structure</h4>
            <pre style={{ fontSize: '12px', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
{`{
  "data": [{
    "interval": {
      "from": "2024-07-01T00:00:00Z",
      "to": "2024-07-02T00:00:00Z"
    },
    "outputs": {
      "ndvi": {
        "bands": {
          "B0": {
            "stats": {
              "min": 0.234,
              "max": 0.876,
              "mean": 0.654,
              "stDev": 0.123,
              "sampleCount": 45678,
              "noDataCount": 1234
            }
          }
        }
      }
    }
  }]
}`}
            </pre>
            
            <p style={{ fontSize: '12px', marginTop: '15px', color: '#666' }}>
              <strong>Data Processing:</strong> Real-time satellite data from Copernicus Sentinel-2 L2A, 
              processed through Sentinel Hub Statistical API with atmospheric correction and cloud masking.
            </p>
          </div>
        </div>
      )}
      <p style={{ fontSize: '12px', marginTop: '15px', color: '#666' }}>
          <strong>Author:</strong> @robertkottelin at X
      </p>
    </div>
  );
};

export default ForestBiomassApp;