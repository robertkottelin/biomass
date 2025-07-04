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
      // Format body as URLSearchParams to ensure proper encoding
      const tokenData = new URLSearchParams();
      tokenData.append('client_id', clientId);
      tokenData.append('client_secret', clientSecret);
      tokenData.append('grant_type', 'client_credentials');

      console.log('Authenticating with Copernicus Data Space...');
      
      // Copernicus Data Space authentication endpoint
      const tokenResponse = await fetch('https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
        },
        body: tokenData.toString()
      });

      const responseText = await tokenResponse.text();
      
      if (!tokenResponse.ok) {
        console.error('Authentication failed:', tokenResponse.status, responseText);
        
        // Parse error details if available
        try {
          const errorData = JSON.parse(responseText);
          if (errorData.error_description) {
            throw new Error(`${errorData.error}: ${errorData.error_description}`);
          }
        } catch (e) {
          // If not JSON, use raw response
        }
        
        throw new Error(`Authentication failed: ${tokenResponse.status} - ${responseText}`);
      }

      const tokenResult = JSON.parse(responseText);
      
      if (!tokenResult.access_token) {
        throw new Error('No access token received');
      }
      
      console.log('Authentication successful');
      console.log('Token type:', tokenResult.token_type);
      console.log('Token expires in:', tokenResult.expires_in, 'seconds');
      console.log('Token first 20 chars:', tokenResult.access_token.substring(0, 20) + '...');
      
      setAccessToken(tokenResult.access_token);
      setTokenExpiry(Date.now() + ((tokenResult.expires_in - 60) * 1000));
      setAuthenticated(true);
      setProcessingStatus('');
      
      return true;
    } catch (err) {
      console.error('Authentication error:', err);
      setError(`Authentication failed: ${err.message}. Use manual token mode if CORS is blocking.`);
      setProcessingStatus('');
      return false;
    }
  };

  // Test API access with Process API
  const testAPIAccess = async () => {
    if (!accessToken) {
      setError('Please authenticate first');
      return;
    }

    setError(null);
    setProcessingStatus('Testing API access...');

    try {
      // Test with Process API
      const testRequest = {
        input: {
          bounds: {
            bbox: [24.0, 61.0, 24.1, 61.1], // Small area in Finland (WGS84)
            properties: {
              crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84"
            }
          },
          data: [{
            type: "sentinel-2-l2a",
            dataFilter: {
              timeRange: {
                from: "2024-07-01T00:00:00Z",
                to: "2024-07-15T00:00:00Z"
              }
            }
          }]
        },
        output: {
          width: 10,
          height: 10,
          responses: [{
            identifier: "default",
            format: {
              type: "image/png"
            }
          }]
        },
        evalscript: `//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04"],
    output: { bands: 3 }
  };
}
function evaluatePixel(sample) {
  return [sample.B04, sample.B03, sample.B02];
}`
      };

      console.log('Testing Process API endpoint...');
      const response = await fetch('https://sh.dataspace.copernicus.eu/api/v1/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'image/png'
        },
        body: JSON.stringify(testRequest)
      });

      console.log('Process API Response Status:', response.status);
      
      if (response.ok) {
        setProcessingStatus('');
        setError(null);
        alert('Process API test successful! The API is accessible with your credentials.');
      } else {
        const responseText = await response.text();
        setProcessingStatus('');
        let errorMsg = `Process API test failed: ${response.status}`;
        try {
          const errorData = JSON.parse(responseText);
          if (errorData.error) {
            errorMsg += ` - ${errorData.error.message || errorData.error}`;
          }
        } catch (e) {
          errorMsg += ` - ${responseText}`;
        }
        setError(errorMsg);
      }
    } catch (err) {
      setProcessingStatus('');
      setError(`Test failed: ${err.message}`);
    }
  };

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

  // Fetch NDVI data using Process API
  const fetchNDVIData = async (polygon, dateFrom, dateTo) => {
    const coords = polygon.coords.map(coord => [coord[1], coord[0]]); // lon,lat
    
    // Create GeoJSON polygon
    const geoJson = {
      type: "Polygon",
      coordinates: [[...coords, coords[0]]]
    };
    
    // Calculate bounding box
    const lons = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);
    const bbox = [
      Math.min(...lons),
      Math.min(...lats),
      Math.max(...lons),
      Math.max(...lats)
    ];
    
    // Calculate resolution based on polygon size
    const latDistance = Math.abs(bbox[3] - bbox[1]) * 111000; // meters
    const lonDistance = Math.abs(bbox[2] - bbox[0]) * 111000 * Math.cos(((bbox[1] + bbox[3]) / 2) * Math.PI / 180);
    const maxDimension = Math.max(latDistance, lonDistance);
    
    // Adaptive resolution: higher resolution for smaller areas
    let pixelWidth, pixelHeight;
    if (maxDimension < 1000) {
      pixelWidth = pixelHeight = 50; // 50x50 pixels for very small areas
    } else if (maxDimension < 5000) {
      pixelWidth = pixelHeight = 100; // 100x100 pixels for small areas
    } else if (maxDimension < 20000) {
      pixelWidth = pixelHeight = 200; // 200x200 pixels for medium areas
    } else {
      pixelWidth = pixelHeight = 300; // 300x300 pixels for large areas
    }
    
    console.log(`Polygon dimensions: ${(latDistance/1000).toFixed(1)}km x ${(lonDistance/1000).toFixed(1)}km`);
    console.log(`Using resolution: ${pixelWidth}x${pixelHeight} pixels`);
    
    // Evalscript for NDVI calculation
    const evalscript = `
      //VERSION=3
      function setup() {
        return {
          input: [{
            bands: ["B04", "B08", "SCL", "dataMask"],
            units: "DN"
          }],
          output: {
            bands: 1,
            sampleType: "FLOAT32"
          }
        };
      }
      
      function evaluatePixel(samples) {
        // Scene Classification values
        const SCL_VEGETATION = 4;
        const SCL_NOT_VEGETATED = 5;
        const SCL_WATER = 6;
        
        // Check if pixel is valid
        if (samples.dataMask === 0) {
          return [NaN];
        }
        
        // Only process vegetation, bare soil, and water pixels
        if (samples.SCL !== SCL_VEGETATION && 
            samples.SCL !== SCL_NOT_VEGETATED && 
            samples.SCL !== SCL_WATER) {
          return [NaN];
        }
        
        // Calculate NDVI
        const ndvi = (samples.B08 - samples.B04) / (samples.B08 + samples.B04 + 0.00001);
        
        return [ndvi];
      }
    `;
    
    // Process API request
    const processRequest = {
      input: {
        bounds: {
          bbox: bbox,
          properties: {
            crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84"
          },
          geometry: geoJson
        },
        data: [{
          type: "sentinel-2-l2a",
          dataFilter: {
            timeRange: {
              from: `${dateFrom}T00:00:00Z`,
              to: `${dateTo}T23:59:59Z`
            },
            maxCloudCoverage: 30,
            mosaickingOrder: "leastCC"
          }
        }]
      },
      output: {
        width: pixelWidth,
        height: pixelHeight,
        responses: [{
          identifier: "default",
          format: {
            type: "image/tiff"
          }
        }]
      },
      evalscript: evalscript
    };
    
    console.log('=== PROCESS API REQUEST ===');
    console.log('Date range:', dateFrom, 'to', dateTo);
    console.log('Bbox:', bbox);
    console.log('Output size:', pixelWidth, 'x', pixelHeight);
    
    try {
      const response = await fetch('https://sh.dataspace.copernicus.eu/api/v1/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'image/tiff'
        },
        body: JSON.stringify(processRequest)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Process API error:', response.status, errorText);
        throw new Error(`Process API error: ${response.status} - ${errorText}`);
      }
      
      // Read the TIFF data
      const arrayBuffer = await response.arrayBuffer();
      
      // Simplified TIFF parsing for Sentinel Hub single-band Float32 response
      // Sentinel Hub returns a simple single-strip TIFF for single-band data
      const dataView = new DataView(arrayBuffer);
      const ndviValues = [];
      
      // Read TIFF header
      const byteOrder = dataView.getUint16(0);
      const littleEndian = byteOrder === 0x4949; // 'II' for little-endian
      
      // For Sentinel Hub single-band Float32 TIFF, pixel data typically starts after header
      // Standard offset for simple single-strip TIFF is often around 8 + IFD size
      
      // Try multiple common data offsets for Sentinel Hub responses
      const possibleOffsets = [
        8,      // Minimal header
        256,    // Common aligned offset
        512,    // Standard sector alignment
        1024,   // Common for complex headers
        8192    // Sometimes used for larger headers
      ];
      
      let bestOffset = 512;
      let maxValidValues = 0;
      
      // Test each offset to find where valid NDVI data starts
      for (const testOffset of possibleOffsets) {
        const testValues = [];
        const testCount = Math.min(100, pixelWidth * pixelHeight); // Test first 100 pixels
        
        for (let i = 0; i < testCount; i++) {
          const offset = testOffset + (i * 4);
          if (offset + 4 <= arrayBuffer.byteLength) {
            const value = dataView.getFloat32(offset, littleEndian);
            if (!isNaN(value) && value >= -1.0 && value <= 1.0) {
              testValues.push(value);
            }
          }
        }
        
        // Check if this offset yields valid NDVI range data
        if (testValues.length > maxValidValues) {
          maxValidValues = testValues.length;
          bestOffset = testOffset;
          if (testValues.length > testCount * 0.8) { // 80% valid values
            break;
          }
        }
      }
      
      console.log(`Using data offset: ${bestOffset}, found ${maxValidValues} valid test values`);
      
      // Read all pixel data from best offset
      const totalPixels = pixelWidth * pixelHeight;
      for (let i = 0; i < totalPixels; i++) {
        const offset = bestOffset + (i * 4);
        if (offset + 4 <= arrayBuffer.byteLength) {
          const value = dataView.getFloat32(offset, littleEndian);
          
          // Store all values, including NaN for masked pixels
          if (!isNaN(value)) {
            ndviValues.push(value);
          }
        }
      }
      
      // Additional validation: if too few valid pixels, try reading as big-endian
      if (ndviValues.length < totalPixels * 0.1 && littleEndian) {
        console.log('Retrying with big-endian byte order...');
        ndviValues.length = 0;
        
        for (let i = 0; i < totalPixels; i++) {
          const offset = bestOffset + (i * 4);
          if (offset + 4 <= arrayBuffer.byteLength) {
            const value = dataView.getFloat32(offset, false); // big-endian
            if (!isNaN(value)) {
              ndviValues.push(value);
            }
          }
        }
      }
      
      if (ndviValues.length === 0) {
        console.warn('No valid NDVI values extracted from TIFF');
        return null;
      }
      
      // Calculate statistics
      const validValues = ndviValues.filter(v => !isNaN(v));
      const mean = validValues.reduce((a, b) => a + b, 0) / validValues.length;
      const min = Math.min(...validValues);
      const max = Math.max(...validValues);
      
      // Detailed land cover analysis
      const vegetationPixels = validValues.filter(v => v > 0.3).length;
      const moderateVegPixels = validValues.filter(v => v > 0.2 && v <= 0.3).length;
      const barePixels = validValues.filter(v => v >= 0 && v <= 0.2).length;
      const waterPixels = validValues.filter(v => v < 0).length;
      
      console.log(`=== NDVI DATA VERIFICATION ===`);
      console.log(`Total valid pixels: ${validValues.length}/${totalPixels} (${(validValues.length/totalPixels*100).toFixed(1)}%)`);
      console.log(`NDVI Statistics: mean=${mean.toFixed(3)}, min=${min.toFixed(3)}, max=${max.toFixed(3)}`);
      console.log(`Land Cover Classification:`);
      console.log(`- Dense Vegetation (>0.3): ${vegetationPixels} pixels (${(vegetationPixels/validValues.length*100).toFixed(1)}%)`);
      console.log(`- Sparse Vegetation (0.2-0.3): ${moderateVegPixels} pixels (${(moderateVegPixels/validValues.length*100).toFixed(1)}%)`);
      console.log(`- Bare/Urban (0-0.2): ${barePixels} pixels (${(barePixels/validValues.length*100).toFixed(1)}%)`);
      console.log(`- Water (<0): ${waterPixels} pixels (${(waterPixels/validValues.length*100).toFixed(1)}%)`);
      
      // Area suitability check
      if (mean < 0.2) {
        console.warn('⚠️ AREA NOT SUITABLE FOR FOREST ANALYSIS - NDVI too low');
        console.warn('→ Please select a polygon over forested area (expected NDVI > 0.3)');
      }
      
      return {
        mean: mean,
        min: min,
        max: max,
        validPixels: validValues.length,
        totalPixels: totalPixels
      };
      
    } catch (error) {
      console.error('Error fetching NDVI data:', error);
      throw error;
    }
  };

  // Process satellite data using Process API
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
    setProcessingStatus('Fetching satellite data using Process API...');

    try {
      const selectedForest = selectedForests[selectedForestIndex];
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;
      const results = [];
      const startYear = currentYear - 10;
      
      // Process last 10 years of summer data
      for (let year = startYear; year <= currentYear; year++) {
        const yearsFromStart = year - startYear;
        
        // Skip future dates
        if (year === currentYear && currentMonth < 9) {
          console.log(`Skipping ${year} as summer season not complete yet`);
          continue;
        }
        
        // Define date range for summer season (June-August for better data availability)
        const dateFrom = `${year}-06-01`;
        const dateTo = `${year}-08-31`;
        
        setProcessingStatus(`Processing ${year} summer season...`);
        
        try {
          // Fetch NDVI data from Process API
          const ndviStats = await fetchNDVIData(selectedForest, dateFrom, dateTo);
          
          if (ndviStats && ndviStats.validPixels > 0) {
            const avgNDVI = ndviStats.mean;
            
            // Check if this is likely water (NDVI < 0.1) 
            const isWater = avgNDVI < 0.1;
            
            if (isWater && year === startYear) {
              setError('Warning: Selected area appears to be water body (NDVI < 0.1). Biomass estimates may not be accurate.');
            }
            
            const biomass = estimateBiomass(avgNDVI, selectedForest.type, yearsFromStart, forestAge);
            
            // Log detailed data for verification
            console.log(`Year ${year} Data Verification:`);
            console.log(`- NDVI: mean=${avgNDVI.toFixed(3)}, min=${ndviStats.min.toFixed(3)}, max=${ndviStats.max.toFixed(3)}`);
            console.log(`- Coverage: ${ndviStats.validPixels}/${ndviStats.totalPixels} pixels (${(ndviStats.validPixels/ndviStats.totalPixels*100).toFixed(1)}%)`);
            console.log(`- Calculated Biomass: ${biomass.toFixed(2)} tons/ha`);
            console.log(`- Forest Type: ${selectedForest.type}, Age: ${forestAge + yearsFromStart} years`);
            
            results.push({
              date: `${year}-07-15`,
              year,
              month: 7,
              yearsFromStart,
              ndvi: avgNDVI,
              ndviMin: ndviStats.min,
              ndviMax: ndviStats.max,
              biomass,
              forestAge: forestAge + yearsFromStart,
              validPixels: ndviStats.validPixels,
              totalPixels: ndviStats.totalPixels,
              coverage: (ndviStats.validPixels / ndviStats.totalPixels * 100).toFixed(1),
              isWater: isWater
            });
          } else {
            console.warn(`No valid data for ${year}`);
          }
        } catch (yearError) {
          console.error(`Error processing year ${year}:`, yearError);
          // Continue with next year
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      if (results.length === 0) {
        setError('No valid satellite data found. Please try a different location or check your API access.');
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
      'Valid Pixels',
      'Total Pixels',
      'Coverage (%)',
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
      row.validPixels || 'N/A',
      row.totalPixels || 'N/A',
      row.coverage || 'N/A',
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
    },
    note: {
      backgroundColor: '#ffeeba',
      padding: '10px',
      borderRadius: '4px',
      fontSize: '14px',
      color: '#856404',
      marginTop: '10px'
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Kalliomarken - Sentinel-2 NDVI & Biomass Analysis (Process API)</h1>
      
      <div style={styles.info}>
        <strong>Now Using Copernicus Process API - More Reliable Alternative</strong>
        <ul style={{ fontSize: '14px', margin: '10px 0', paddingLeft: '20px' }}>
          <li>Process API endpoint for direct pixel data retrieval</li>
          <li>Downloads NDVI raster data for polygon area</li>
          <li>Calculates statistics locally from raw pixel values</li>
          <li>Adaptive resolution based on polygon size (50-300 pixels)</li>
          <li>Scene Classification Layer (SCL) filtering for vegetation/water</li>
          <li>Species-specific biomass estimation models</li>
        </ul>
        <p style={{ fontSize: '13px', marginTop: '10px', fontStyle: 'italic' }}>
          <strong>Note:</strong> This version uses the Process API which is more stable than Statistical API. 
          CORS may still block direct authentication in local development.
        </p>
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
          <>
            <p style={{ color: '#28a745', marginTop: '10px' }}>
              ✓ Authenticated successfully
            </p>
            <button
              style={{
                ...styles.button,
                backgroundColor: '#17a2b8',
                marginTop: '10px',
                marginRight: '10px'
              }}
              onClick={testAPIAccess}
            >
              Test Process API Access
            </button>
          </>
        )}
        
        <div style={styles.note}>
          <strong>Process API Implementation:</strong> This version uses the Process API which:
          <ul style={{ margin: '5px 0 0 20px', fontSize: '13px' }}>
            <li>Downloads actual pixel data as GeoTIFF format</li>
            <li>Calculates NDVI statistics locally from raw pixel values</li>
            <li>More reliable than Statistical API for polygon-based analysis</li>
            <li>Adaptive resolution: 50x50 to 300x300 pixels based on area size</li>
          </ul>
        </div>
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
        {loading ? 'Processing Satellite Data...' : 'Analyze with Process API'}
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
          <p>Processing satellite data via Process API...</p>
          <p style={{ fontSize: '14px', color: '#999' }}>{processingStatus}</p>
        </div>
      )}

      {biomassData.length > 0 && (
        <div style={styles.chartContainer}>
          <div style={styles.buttonContainer}>
            <h2 style={{ margin: 0 }}>Satellite Data: NDVI & Biomass Trends</h2>
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
                  return item ? `${label} (Forest Age: ${item.forestAge} years, Coverage: ${item.coverage}%)` : label;
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
            <h3>Technical Implementation - Process API</h3>
            
            <h4>1. Process API Integration</h4>
            <p><strong>API Endpoint:</strong> https://sh.dataspace.copernicus.eu/api/v1/process</p>
            <p><strong>Authentication:</strong> OAuth2 Bearer Token</p>
            <p><strong>Data Format:</strong> GeoTIFF (Float32 single band)</p>
            <p><strong>Collection:</strong> sentinel-2-l2a</p>
            <p><strong>Cloud Filter:</strong> maxCloudCoverage: 30%</p>
            <p><strong>Mosaicking:</strong> leastCC (least cloud cover)</p>
            
            <h4>2. Adaptive Resolution System</h4>
            <ul style={{ fontSize: '13px', marginLeft: '20px' }}>
              <li>{'< 1km'}: 50×50 pixels (very high detail)</li>
              <li>1-5km: 100×100 pixels (high detail)</li>
              <li>5-20km: 200×200 pixels (medium detail)</li>
              <li>{'>20km'}: 300×300 pixels (overview)</li>
            </ul>
            
            <h4>3. NDVI Calculation Evalscript</h4>
            <pre style={{ fontSize: '12px', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
{`function evaluatePixel(samples) {
  // Scene Classification filtering
  const SCL_VEGETATION = 4;
  const SCL_NOT_VEGETATED = 5;
  const SCL_WATER = 6;
  
  // Only process valid pixels
  if (samples.dataMask === 0) return [NaN];
  
  // Filter by scene classification
  if (samples.SCL !== SCL_VEGETATION && 
      samples.SCL !== SCL_NOT_VEGETATED && 
      samples.SCL !== SCL_WATER) {
    return [NaN];
  }
  
  // Calculate NDVI
  const ndvi = (samples.B08 - samples.B04) / 
               (samples.B08 + samples.B04 + 0.00001);
  
  return [ndvi];
}`}
            </pre>
            
            <h4>4. Current Analysis Results</h4>
            {biomassData.length > 0 && (
              <ul style={{ fontSize: '13px', marginLeft: '20px' }}>
                <li><strong>Time Series:</strong> {biomassData.length} annual observations</li>
                <li><strong>Average NDVI:</strong> {(biomassData.reduce((sum, d) => sum + d.ndvi, 0) / biomassData.length).toFixed(3)}</li>
                <li><strong>NDVI Range:</strong> {Math.min(...biomassData.map(d => d.ndvi)).toFixed(3)} to {Math.max(...biomassData.map(d => d.ndvi)).toFixed(3)}</li>
                <li><strong>Biomass Growth:</strong> {((biomassData[biomassData.length-1].biomass - biomassData[0].biomass) / biomassData[0].biomass * 100).toFixed(1)}% over {biomassData.length} years</li>
                <li><strong>Average Coverage:</strong> {(biomassData.reduce((sum, d) => sum + parseFloat(d.coverage), 0) / biomassData.length).toFixed(1)}% valid pixels</li>
              </ul>
            )}
            
            <h4>5. Process API Advantages</h4>
            <ul style={{ fontSize: '13px', marginLeft: '20px' }}>
              <li>Direct pixel access - full control over data processing</li>
              <li>More reliable than Statistical API for complex polygons</li>
              <li>Adaptive resolution based on area size</li>
              <li>Local statistics calculation ensures accuracy</li>
              <li>Compatible with standard GeoTIFF processing workflows</li>
            </ul>
            
            <p style={{ fontSize: '12px', marginTop: '15px', color: '#666' }}>
              <strong>Data Processing:</strong> Real-time satellite data from Copernicus Sentinel-2 L2A, 
              processed through Sentinel Hub Process API with atmospheric correction and cloud masking.
              Statistics calculated locally from raw pixel values.
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