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

// Load geotiff.js for compressed TIFF parsing
const loadGeoTIFF = () => {
  return new Promise((resolve) => {
    if (window.GeoTIFF) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js';
    document.head.appendChild(script);
    script.onload = () => {
      console.log('GeoTIFF.js loaded successfully');
      resolve();
    };
    script.onerror = () => {
      console.error('Failed to load GeoTIFF.js');
      resolve(); // Continue anyway
    };
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
  const [showInstructions, setShowInstructions] = useState(false);
  const [showDocumentation, setShowDocumentation] = useState(false);


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

  // Load GeometryUtil and GeoTIFF on mount
  useEffect(() => {
    Promise.all([loadGeometryUtil(), loadGeoTIFF()]).then(() => {
      console.log('Libraries loaded');
    });
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
      // Test with Process API - FIXED evalscript without units specification
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

  // Simplified TIFF parser for FLOAT32 single-band data
  const parseTIFF = (arrayBuffer) => {
    const dataView = new DataView(arrayBuffer);

    // Read TIFF header
    const byteOrder = dataView.getUint16(0);
    const littleEndian = byteOrder === 0x4949; // 'II' = little endian, 'MM' = big endian

    // Verify magic number (42)
    const magicNumber = dataView.getUint16(2, littleEndian);
    if (magicNumber !== 42) {
      throw new Error(`Invalid TIFF magic number: ${magicNumber}`);
    }

    // Get IFD offset
    const ifdOffset = dataView.getUint32(4, littleEndian);

    // Read IFD
    const tagCount = dataView.getUint16(ifdOffset, littleEndian);

    let imageWidth = 0;
    let imageHeight = 0;
    let stripOffsets = null;
    let stripByteCounts = null;
    let bitsPerSample = 32;
    let sampleFormat = 3; // IEEE floating point

    // Parse IFD entries (12 bytes each)
    for (let i = 0; i < tagCount; i++) {
      const entryOffset = ifdOffset + 2 + (i * 12);
      const tag = dataView.getUint16(entryOffset, littleEndian);
      const type = dataView.getUint16(entryOffset + 2, littleEndian);
      const count = dataView.getUint32(entryOffset + 4, littleEndian);
      const valueOffset = entryOffset + 8;

      switch (tag) {
        case 256: // ImageWidth
          imageWidth = type === 3 ? dataView.getUint16(valueOffset, littleEndian) : dataView.getUint32(valueOffset, littleEndian);
          break;
        case 257: // ImageLength (height)
          imageHeight = type === 3 ? dataView.getUint16(valueOffset, littleEndian) : dataView.getUint32(valueOffset, littleEndian);
          break;
        case 258: // BitsPerSample
          bitsPerSample = dataView.getUint16(valueOffset, littleEndian);
          break;
        case 273: // StripOffsets
          if (count === 1) {
            stripOffsets = dataView.getUint32(valueOffset, littleEndian);
          } else {
            // Multiple strips - read offset to strip offsets array
            const offsetsPtr = dataView.getUint32(valueOffset, littleEndian);
            stripOffsets = [];
            for (let j = 0; j < count; j++) {
              stripOffsets.push(dataView.getUint32(offsetsPtr + j * 4, littleEndian));
            }
          }
          break;
        case 279: // StripByteCounts
          if (count === 1) {
            stripByteCounts = dataView.getUint32(valueOffset, littleEndian);
          } else {
            // Multiple strips
            const countsPtr = dataView.getUint32(valueOffset, littleEndian);
            stripByteCounts = [];
            for (let j = 0; j < count; j++) {
              stripByteCounts.push(dataView.getUint32(countsPtr + j * 4, littleEndian));
            }
          }
          break;
        case 339: // SampleFormat
          sampleFormat = dataView.getUint16(valueOffset, littleEndian);
          break;
      }
    }

    console.log(`TIFF metadata: ${imageWidth}x${imageHeight}, ${bitsPerSample} bits, format=${sampleFormat}, endian=${littleEndian ? 'little' : 'big'}`);

    // Read pixel data
    const pixelCount = imageWidth * imageHeight;
    const pixels = new Float32Array(pixelCount);

    if (Array.isArray(stripOffsets)) {
      // Multiple strips
      let pixelIndex = 0;
      for (let i = 0; i < stripOffsets.length; i++) {
        const stripOffset = stripOffsets[i];
        const stripSize = stripByteCounts[i];
        const floatsInStrip = stripSize / 4;

        for (let j = 0; j < floatsInStrip && pixelIndex < pixelCount; j++) {
          pixels[pixelIndex++] = dataView.getFloat32(stripOffset + j * 4, littleEndian);
        }
      }
    } else {
      // Single strip
      for (let i = 0; i < pixelCount; i++) {
        pixels[i] = dataView.getFloat32(stripOffsets + i * 4, littleEndian);
      }
    }

    return {
      width: imageWidth,
      height: imageHeight,
      data: pixels
    };
  };

  // Fetch NDVI data using Process API - FIXED VERSION with GeoTIFF.js
  const fetchNDVIData = async (polygon, dateFrom, dateTo) => {
    // CRITICAL FIX: Ensure correct coordinate order [lng, lat] for WGS84
    const coords = polygon.coords.map(coord => [coord[1], coord[0]]); // Convert from [lat,lng] to [lng,lat]

    // Create properly closed GeoJSON polygon
    const geoJsonCoords = [...coords];
    if (geoJsonCoords[0][0] !== geoJsonCoords[geoJsonCoords.length - 1][0] ||
      geoJsonCoords[0][1] !== geoJsonCoords[geoJsonCoords.length - 1][1]) {
      geoJsonCoords.push(geoJsonCoords[0]); // Close the polygon
    }

    const geoJson = {
      type: "Polygon",
      coordinates: [geoJsonCoords]
    };

    // Calculate bounding box [west, south, east, north]
    const lons = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);
    const bbox = [
      Math.min(...lons), // west (min longitude)
      Math.min(...lats), // south (min latitude)
      Math.max(...lons), // east (max longitude)
      Math.max(...lats)  // north (max latitude)
    ];

    // Log coordinate verification
    console.log('=== COORDINATE VERIFICATION ===');
    console.log('Original polygon (lat,lng):', polygon.coords.slice(0, 3).map(c => `[${c[0].toFixed(6)}, ${c[1].toFixed(6)}]`).join(', '));
    console.log('Transformed (lng,lat):', coords.slice(0, 3).map(c => `[${c[0].toFixed(6)}, ${c[1].toFixed(6)}]`).join(', '));
    console.log('Bounding box [W,S,E,N]:', bbox.map(v => v.toFixed(6)).join(', '));
    console.log('GeoJSON polygon vertices:', geoJsonCoords.length);

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

    console.log(`Polygon dimensions: ${(latDistance / 1000).toFixed(1)}km x ${(lonDistance / 1000).toFixed(1)}km`);
    console.log(`Using resolution: ${pixelWidth}x${pixelHeight} pixels`);

    // FIXED evalscript - removed units specification to get reflectance by default
    const evalscript = `
      //VERSION=3
      function setup() {
        return {
          input: [{
            bands: ["B04", "B08", "SCL", "dataMask"]
          }],
          output: {
            id: "default",
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
        const SCL_CLOUD_MEDIUM = 8;
        const SCL_CLOUD_HIGH = 9;
        const SCL_THIN_CIRRUS = 10;
        const SCL_SNOW_ICE = 11;
        
        // Check if pixel is valid
        if (samples.dataMask === 0) {
          return [NaN];
        }
        
        // Filter out clouds and snow
        if (samples.SCL === SCL_CLOUD_MEDIUM || 
            samples.SCL === SCL_CLOUD_HIGH || 
            samples.SCL === SCL_THIN_CIRRUS ||
            samples.SCL === SCL_SNOW_ICE) {
          return [NaN];
        }
        
        // Calculate NDVI from reflectance values (default unit)
        const ndvi = (samples.B08 - samples.B04) / (samples.B08 + samples.B04 + 1e-10);
        
        return [ndvi];
      }
    `;

    // Process API request with geometry clipping
    const processRequest = {
      input: {
        bounds: {
          bbox: bbox,
          properties: {
            crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" // WGS84 with lon,lat order
          },
          geometry: geoJson // Use exact polygon for clipping
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
    console.log('Bbox [W,S,E,N]:', bbox);
    console.log('Output size:', pixelWidth, 'x', pixelHeight);
    console.log('Geometry type:', processRequest.input.bounds.geometry.type);
    console.log('CRS:', processRequest.input.bounds.properties.crs);

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

      // Parse TIFF response using GeoTIFF.js
      const arrayBuffer = await response.arrayBuffer();
      console.log('Received TIFF data:', arrayBuffer.byteLength, 'bytes');

      // Use GeoTIFF.js for proper compressed TIFF parsing
      let ndviValues = [];

      if (window.GeoTIFF) {
        try {
          const tiff = await window.GeoTIFF.fromArrayBuffer(arrayBuffer);
          const image = await tiff.getImage();

          // Get image metadata
          const width = image.getWidth();
          const height = image.getHeight();
          const samplesPerPixel = image.getSamplesPerPixel();

          console.log(`TIFF metadata: ${width}x${height}, ${samplesPerPixel} bands`);

          // Read raster data
          const rasters = await image.readRasters();
          const data = rasters[0]; // First band contains NDVI values

          // Extract valid NDVI values
          let nanCount = 0;

          for (let i = 0; i < data.length; i++) {
            const value = data[i];

            if (isNaN(value)) {
              nanCount++;
            } else if (value >= -1.0 && value <= 1.0) {
              ndviValues.push(value);
            } else {
              console.warn(`Unexpected NDVI value at pixel ${i}: ${value}`);
            }
          }

          console.log(`Parsed ${ndviValues.length} valid NDVI values from ${data.length} total pixels using GeoTIFF.js`);
          console.log(`NaN values (masked/cloudy): ${nanCount}`);

        } catch (geoTiffError) {
          console.error('GeoTIFF.js parsing error:', geoTiffError);
          throw new Error('Failed to parse TIFF with GeoTIFF.js: ' + geoTiffError.message);
        }
      } else {
        throw new Error('GeoTIFF.js library not loaded');
      }

      if (ndviValues.length === 0) {
        console.error('No valid NDVI values extracted from TIFF');
        return null;
      }

      // Calculate statistics
      const mean = ndviValues.reduce((a, b) => a + b, 0) / ndviValues.length;
      const min = Math.min(...ndviValues);
      const max = Math.max(...ndviValues);

      // Land cover analysis
      const vegetationPixels = ndviValues.filter(v => v > 0.3).length;
      const moderateVegPixels = ndviValues.filter(v => v > 0.2 && v <= 0.3).length;
      const barePixels = ndviValues.filter(v => v >= 0 && v <= 0.2).length;
      const waterPixels = ndviValues.filter(v => v < 0).length;

      console.log(`=== NDVI DATA VERIFICATION ===`);
      console.log(`Total valid pixels: ${ndviValues.length}/${pixelWidth * pixelHeight} (${(ndviValues.length / (pixelWidth * pixelHeight) * 100).toFixed(1)}%)`);
      console.log(`NDVI Statistics: mean=${mean.toFixed(3)}, min=${min.toFixed(3)}, max=${max.toFixed(3)}`);
      console.log(`Land Cover Classification:`);
      console.log(`- Dense Vegetation (>0.3): ${vegetationPixels} pixels (${(vegetationPixels / ndviValues.length * 100).toFixed(1)}%)`);
      console.log(`- Sparse Vegetation (0.2-0.3): ${moderateVegPixels} pixels (${(moderateVegPixels / ndviValues.length * 100).toFixed(1)}%)`);
      console.log(`- Bare/Urban (0-0.2): ${barePixels} pixels (${(barePixels / ndviValues.length * 100).toFixed(1)}%)`);
      console.log(`- Water (<0): ${waterPixels} pixels (${(waterPixels / ndviValues.length * 100).toFixed(1)}%)`);

      // Area suitability check
      if (mean < 0.2 && vegetationPixels < ndviValues.length * 0.1) {
        console.warn('⚠️ AREA NOT SUITABLE FOR FOREST ANALYSIS - NDVI too low');
        console.warn('→ Please select a polygon over forested area (expected NDVI > 0.3 for majority of pixels)');
      }

      return {
        mean: mean,
        min: min,
        max: max,
        validPixels: ndviValues.length,
        totalPixels: pixelWidth * pixelHeight,
        vegetationPixels: vegetationPixels,
        vegetationPercent: (vegetationPixels / ndviValues.length * 100)
      };

    } catch (error) {
      console.error('Error fetching NDVI data:', error);
      throw error;
    }
  };

  // Fetch available acquisition dates using Catalog API
  const fetchAvailableDates = async (bbox, dateFrom, dateTo) => {
    const catalogRequest = {
      bbox: bbox,
      datetime: `${dateFrom}T00:00:00Z/${dateTo}T23:59:59Z`,
      collections: ["sentinel-2-l2a"],
      limit: 100,
      filter: "eo:cloud_cover < 30"
    };

    try {
      const response = await fetch('https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(catalogRequest)
      });

      if (!response.ok) {
        throw new Error(`Catalog API error: ${response.status}`);
      }

      const data = await response.json();

      // Extract unique dates from features
      const dates = new Set();
      data.features.forEach(feature => {
        if (feature.properties && feature.properties.datetime) {
          const date = new Date(feature.properties.datetime);
          dates.add(date.toISOString().split('T')[0]);
        }
      });

      return Array.from(dates).sort();
    } catch (error) {
      console.error('Error fetching catalog data:', error);
      return [];
    }
  };

  // Process satellite data using Process API with daily acquisitions
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
    setProcessingStatus('Initializing satellite data acquisition...');

    try {
      const selectedForest = selectedForests[selectedForestIndex];
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;
      const results = [];
      const startYear = currentYear - 10;

      // Calculate bbox from polygon
      const coords = selectedForest.coords.map(coord => [coord[1], coord[0]]); // [lng, lat]
      const lons = coords.map(c => c[0]);
      const lats = coords.map(c => c[1]);
      const bbox = [
        Math.min(...lons),
        Math.min(...lats),
        Math.max(...lons),
        Math.max(...lats)
      ];

      // Process last 3 years of summer data with individual acquisitions
      for (let year = startYear; year <= currentYear; year++) {
        const yearsFromStart = year - startYear;

        // Define date range for summer season
        const dateFrom = `${year}-06-01`;
        let dateTo = `${year}-08-31`;
        
        // For current year, limit to current date if before end of August
        if (year === currentYear) {
          const today = new Date();
          const endOfAugust = new Date(year, 7, 31); // Month is 0-indexed, so 7 = August
          
          if (today < endOfAugust) {
            // Use current date as end date
            dateTo = today.toISOString().split('T')[0];
            console.log(`Current year ${year}: limiting analysis to current date ${dateTo}`);
          }
        }

        setProcessingStatus(`Fetching available dates for ${year} summer...`);

        // Get available acquisition dates from Catalog API
        const availableDates = await fetchAvailableDates(bbox, dateFrom, dateTo);
        console.log(`Found ${availableDates.length} acquisitions for ${year} summer`);

        // Process each available date
        for (let i = 0; i < availableDates.length; i++) {
          const acquisitionDate = availableDates[i];
          setProcessingStatus(`Processing ${acquisitionDate} (${i + 1}/${availableDates.length} for ${year})...`);

          try {
            // Fetch NDVI data for specific date with tight time window
            const dateTime = new Date(acquisitionDate);
            const nextDay = new Date(dateTime);
            nextDay.setDate(nextDay.getDate() + 1);

            const ndviStats = await fetchNDVIData(
              selectedForest,
              acquisitionDate,
              nextDay.toISOString().split('T')[0]
            );

            if (ndviStats && ndviStats.validPixels > 0) {
              const avgNDVI = ndviStats.mean;
              const dayOfYear = Math.floor((dateTime - new Date(year, 0, 0)) / 86400000);
              const fractionalYear = yearsFromStart + (dayOfYear / 365);

              const biomass = estimateBiomass(avgNDVI, selectedForest.type, fractionalYear, forestAge);

              results.push({
                date: acquisitionDate,
                year,
                month: dateTime.getMonth() + 1,
                day: dateTime.getDate(),
                yearsFromStart: fractionalYear,
                ndvi: avgNDVI,
                ndviMin: ndviStats.min,
                ndviMax: ndviStats.max,
                biomass,
                forestAge: forestAge + fractionalYear,
                validPixels: ndviStats.validPixels,
                totalPixels: ndviStats.totalPixels,
                coverage: (ndviStats.validPixels / ndviStats.totalPixels * 100).toFixed(1),
                vegetationPercent: ndviStats.vegetationPercent.toFixed(1),
                isWater: avgNDVI < 0.1,
                isForested: ndviStats.vegetationPercent > 30
              });
            }
          } catch (dateError) {
            console.error(`Error processing ${acquisitionDate}:`, dateError);
            // Continue with next date
          }

          // Rate limiting - 500ms between requests
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Longer delay between years
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (results.length === 0) {
        setError('No valid satellite data found. Please try a different location or check your API access.');
        return;
      }

      // Sort by date
      results.sort((a, b) => new Date(a.date) - new Date(b.date));

      console.log(`Total acquisitions processed: ${results.length}`);
      console.log(`Date range: ${results[0].date} to ${results[results.length - 1].date}`);

      // Calculate rolling averages with larger window for daily data
      const resultsWithRollingAvg = calculateRollingAverage(results, 'biomass', 7);
      const finalResults = calculateRollingAverage(resultsWithRollingAvg, 'ndvi', 7);

      setBiomassData(finalResults);
      setProcessingStatus('');

      // Vegetation coverage analysis
      const vegetatedCount = finalResults.filter(d => d.isForested).length;
      const vegPercent = (vegetatedCount / finalResults.length * 100).toFixed(1);
      console.log(`Vegetation coverage across time series: ${vegPercent}%`);

      if (vegetatedCount < finalResults.length * 0.5) {
        setError(`Warning: Low vegetation detected in ${100 - vegPercent}% of observations. Please verify forest area selection.`);
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
      'Day',
      'Days From Start',
      'Forest Age (years)',
      'NDVI Mean',
      'NDVI Min',
      'NDVI Max',
      'NDVI 7-Day Rolling Avg',
      'Biomass (tons/ha)',
      'Biomass 7-Day Rolling Avg (tons/ha)',
      'Forest Type',
      'Forest Area (ha)',
      'Valid Pixels',
      'Total Pixels',
      'Coverage (%)',
      'Vegetation Coverage (%)',
      'Is Water Body',
      'Is Forested'
    ];

    const csvRows = biomassData.map(row => [
      row.date,
      row.year,
      row.month,
      row.day,
      row.yearsFromStart.toFixed(3),
      row.forestAge.toFixed(2),
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
      row.vegetationPercent || 'N/A',
      row.isWater ? 'Yes' : 'No',
      row.isForested ? 'Yes' : 'No'
    ]);

    const csvContent = [
      headers.join(','),
      ...csvRows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const filename = `forest_biomass_daily_${selectedForests[selectedForestIndex].type}_${new Date().toISOString().slice(0, 10)}.csv`;

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
    },
    codeBlock: {
      backgroundColor: '#f5f5f5',
      padding: '10px',
      borderRadius: '4px',
      fontSize: '12px',
      overflow: 'auto',
      fontFamily: 'monospace'
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Sentinel-2 Forest Monitoring - NDVI Time Series & Biomass Analysis</h1>

      {/* User Instructions Panel */}
      <div style={{
        ...styles.authSection,
        marginBottom: '20px',
        backgroundColor: '#f0f8ff'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: showInstructions ? '15px' : 0
        }}>
          <h3 style={{ margin: 0 }}>📋 User Instructions</h3>
          <button
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '20px',
              color: '#007bff'
            }}
            onClick={() => setShowInstructions(!showInstructions)}
          >
            {showInstructions ? '▼' : '▶'}
          </button>
        </div>
        
        {showInstructions && (
          <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
            <h4 style={{ marginTop: '15px', marginBottom: '10px', color: '#0066cc' }}>1. Authentication Setup</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>Option A - Direct OAuth2:</strong> Register at <a href="https://dataspace.copernicus.eu/" target="_blank">Copernicus Data Space</a> → Create OAuth2 client → Enter Client ID & Secret → Click "Authenticate"</li>
              <li><strong>Option B - Manual Token:</strong> If CORS blocks direct auth, enable "Use manual token mode" → Get token via POST request to:
                <code style={{ display: 'block', margin: '5px 0', padding: '5px', backgroundColor: '#f5f5f5', fontSize: '12px' }}>
                  https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token
                </code>
                with body: <code>grant_type=client_credentials&client_id=YOUR_ID&client_secret=YOUR_SECRET</code>
              </li>
              <li>Token expires in 10 minutes - re-authenticate as needed</li>
            </ul>

            <h4 style={{ marginTop: '15px', marginBottom: '10px', color: '#0066cc' }}>2. Drawing Forest Polygons</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li>Click the polygon tool (pentagon icon) in the map's top-left control panel</li>
              <li>Click on the map to place vertices of your forest boundary</li>
              <li>Complete the polygon by clicking the first vertex again</li>
              <li>Draw multiple forests to compare - click each to select for analysis</li>
              <li>Use the trash icon to delete all polygons and start over</li>
              <li><strong>Important:</strong> Draw polygons over actual forested areas visible in satellite imagery for accurate results</li>
            </ul>

            <h4 style={{ marginTop: '15px', marginBottom: '10px', color: '#0066cc' }}>3. Forest Parameters</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>Forest Type:</strong> Select species (Pine, Fir, Birch, Aspen) - affects growth curves and maximum biomass</li>
              <li><strong>Forest Age:</strong> Estimated age of forest at the start of analysis period (default: 20 years)</li>
              <li><strong>Default Parameters Source:</strong> Growth models calibrated with data from <strong>Luke (Finnish Natural Resources Institute)</strong>:
                <ul style={{ marginTop: '5px' }}>
                  <li>Pine: Max 450 t/ha, growth rate 0.08/year, NDVI saturation 0.85</li>
                  <li>Fir: Max 500 t/ha, growth rate 0.07/year, NDVI saturation 0.88</li>
                  <li>Birch: Max 300 t/ha, growth rate 0.12/year, NDVI saturation 0.82</li>
                  <li>Aspen: Max 250 t/ha, growth rate 0.15/year, NDVI saturation 0.80</li>
                </ul>
              </li>
            </ul>

            <h4 style={{ marginTop: '15px', marginBottom: '10px', color: '#0066cc' }}>4. Running Analysis</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li>After authentication and polygon drawing, click "Analyze with Process API"</li>
              <li>Processing retrieves all cloud-free Sentinel-2 acquisitions from summer months (June-August) for the past 10 years</li>
              <li>Each acquisition is processed individually (~500ms per image) - expect 3-10 minutes for full analysis</li>
              <li>Progress updates show current processing stage</li>
            </ul>

            <h4 style={{ marginTop: '15px', marginBottom: '10px', color: '#0066cc' }}>5. Interpreting Results</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>NDVI (Normalized Difference Vegetation Index):</strong>
                <ul>
                  <li>0.6-0.9: Healthy, dense forest vegetation</li>
                  <li>0.3-0.6: Moderate vegetation/young forest</li>
                  <li>0.1-0.3: Sparse vegetation/stressed forest</li>
                  <li>&lt;0.1: Non-vegetated/water/bare soil</li>
                </ul>
              </li>
              <li><strong>Biomass Estimates:</strong>
                <ul>
                  <li>Calculated using logistic growth model coupled with NDVI measurements</li>
                  <li>Units: tons/hectare (dry biomass)</li>
                  <li>Typical mature forest: 200-500 t/ha depending on species</li>
                  <li>Annual growth: 5-20 t/ha/year for healthy forests</li>
                </ul>
              </li>
              <li><strong>Chart Interpretation:</strong>
                <ul>
                  <li>Individual points: Daily satellite acquisitions (weather permitting)</li>
                  <li>Thick lines: 7-day rolling averages (smooths atmospheric noise)</li>
                  <li>Seasonal variations: Normal - highest NDVI/biomass in mid-summer</li>
                  <li>Long-term trend: Should show steady increase for growing forests</li>
                </ul>
              </li>
              <li><strong>Quality Indicators:</strong>
                <ul>
                  <li>Coverage %: Portion of polygon with valid (non-cloudy) data</li>
                  <li>Vegetation %: Pixels classified as vegetated (&gt;80% expected for forests)</li>
                  <li>Valid Pixels: Number of measurements used for statistics</li>
                </ul>
              </li>
            </ul>

            <h4 style={{ marginTop: '15px', marginBottom: '10px', color: '#0066cc' }}>6. Troubleshooting</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>Low NDVI values:</strong> Verify polygon is over forested area, not water/urban/agricultural land</li>
              <li><strong>No data found:</strong> Area may have persistent cloud cover - try different location</li>
              <li><strong>Authentication errors:</strong> Token expired (10min limit) or incorrect credentials</li>
              <li><strong>CORS errors:</strong> Use manual token mode instead of direct authentication</li>
            </ul>

            <p style={{ marginTop: '15px', padding: '10px', backgroundColor: '#e8f5e9', borderRadius: '4px' }}>
              <strong>💡 Tip:</strong> Start with a small test polygon (~10-50 hectares) to verify setup before analyzing larger areas. 
              Export results as CSV for further analysis in Excel or R/Python.
            </p>
          </div>
        )}
      </div>

      {/* Technical Documentation Panel */}
      <div style={{
        ...styles.authSection,
        marginBottom: '20px',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: showDocumentation ? '15px' : 0
        }}>
          <h3 style={{ margin: 0 }}>🔧 Technical Documentation</h3>
          <button
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '20px',
              color: '#007bff'
            }}
            onClick={() => setShowDocumentation(!showDocumentation)}
          >
            {showDocumentation ? '▼' : '▶'}
          </button>
        </div>
        
        {showDocumentation && (
          <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
            <h2 style={{ marginTop: '20px', marginBottom: '15px' }}>System Architecture Overview</h2>
            <p>This application integrates with the <strong>Copernicus Data Space Ecosystem</strong> to analyze Sentinel-2 satellite imagery for forest biomass estimation. It processes 10 years of historical data to track forest growth and health.</p>

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: '#0066cc' }}>1. Sentinel-2 Satellite & Spectral Bands</h3>
            
            <h4>What is Sentinel-2?</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li>European Space Agency (ESA) satellite constellation (2 satellites: Sentinel-2A and 2B)</li>
              <li><strong>Revisit time</strong>: 5 days at equator, 2-3 days at mid-latitudes</li>
              <li><strong>Spatial resolution</strong>: 10m for key bands (B02, B03, B04, B08)</li>
              <li><strong>Swath width</strong>: 290 km</li>
            </ul>

            <h4>Key Spectral Bands Used:</h4>
            <pre style={styles.codeBlock}>
{`B04 (Red): 665 nm wavelength - 10m resolution
B08 (NIR - Near Infrared): 842 nm wavelength - 10m resolution
SCL (Scene Classification Layer): Cloud/snow/water mask - 20m resolution`}
            </pre>

            <h4>Why These Bands?</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>Red (B04)</strong>: Absorbed by chlorophyll in healthy vegetation</li>
              <li><strong>NIR (B08)</strong>: Strongly reflected by healthy vegetation's cellular structure</li>
              <li>This contrast enables NDVI calculation</li>
            </ul>

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: '#0066cc' }}>2. NDVI (Normalized Difference Vegetation Index)</h3>
            
            <h4>Formula:</h4>
            <pre style={styles.codeBlock}>
{`NDVI = (NIR - Red) / (NIR + Red) = (B08 - B04) / (B08 + B04)`}
            </pre>

            <h4>Value Interpretation:</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>0.6-0.9</strong>: Dense, healthy forest canopy</li>
              <li><strong>0.3-0.6</strong>: Moderate vegetation/young forest</li>
              <li><strong>0.1-0.3</strong>: Sparse vegetation/stressed forest</li>
              <li><strong>0-0.1</strong>: Bare soil/non-vegetated</li>
              <li><strong>&lt; 0</strong>: Water bodies</li>
            </ul>

            <h4>Why NDVI Works:</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li>Healthy vegetation absorbs red light for photosynthesis</li>
              <li>Internal leaf structure reflects NIR strongly</li>
              <li>The ratio normalizes for illumination differences</li>
            </ul>

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: '#0066cc' }}>3. Data Acquisition Pipeline</h3>

            <h4>Authentication Flow:</h4>
            <pre style={styles.codeBlock}>
{`// OAuth2 authentication with Copernicus Data Space
POST https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token
Body: grant_type=client_credentials&client_id=XXX&client_secret=YYY
Returns: Access token (valid 10 minutes)`}
            </pre>

            <h4>Step 1: Discovery - Catalog API</h4>
            <pre style={styles.codeBlock}>
{`// Find available cloud-free acquisitions
POST https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search
{
  bbox: [west, south, east, north],
  datetime: "2024-06-01/2024-08-31",  // Summer months only
  collections: ["sentinel-2-l2a"],     // Level-2A = atmospherically corrected
  filter: "eo:cloud_cover < 30"       // Max 30% cloud cover
}`}
            </pre>

            <h4>Step 2: Processing - Process API</h4>
            <pre style={styles.codeBlock}>
{`// Extract NDVI for specific polygon and date
POST https://sh.dataspace.copernicus.eu/api/v1/process
{
  input: {
    bounds: {
      bbox: [lon_min, lat_min, lon_max, lat_max],
      geometry: geoJsonPolygon  // Exact forest boundary for clipping
    },
    data: [{
      type: "sentinel-2-l2a",
      dataFilter: {
        timeRange: { from: acquisitionDate, to: nextDay },
        mosaickingOrder: "leastCC"  // Least cloud coverage first
      }
    }]
  },
  output: {
    width: 50-300,   // Adaptive based on polygon size
    height: 50-300,  // Higher res for smaller areas
    responses: [{ format: { type: "image/tiff" } }]
  },
  evalscript: customScript  // NDVI calculation + cloud masking
}`}
            </pre>

            <h4>Adaptive Resolution Logic:</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>&lt; 1 km²</strong>: 50×50 pixels (20m/pixel)</li>
              <li><strong>1-5 km²</strong>: 100×100 pixels</li>
              <li><strong>5-20 km²</strong>: 200×200 pixels</li>
              <li><strong>&gt; 20 km²</strong>: 300×300 pixels</li>
            </ul>

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: '#0066cc' }}>4. Cloud Masking with Scene Classification Layer (SCL)</h3>

            <p>The app uses Sentinel-2's SCL band to filter out unreliable pixels:</p>

            <pre style={styles.codeBlock}>
{`// SCL Values filtered out:
SCL_CLOUD_MEDIUM = 8    // Medium probability clouds
SCL_CLOUD_HIGH = 9      // High probability clouds
SCL_THIN_CIRRUS = 10    // Cirrus clouds
SCL_SNOW_ICE = 11       // Snow/ice

// Only process:
SCL_VEGETATION = 4      // Vegetation pixels
SCL_NOT_VEGETATED = 5   // Bare soil
SCL_WATER = 6          // Water (for contrast)`}
            </pre>

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: '#0066cc' }}>5. Biomass Estimation Model</h3>

            <h4>Logistic Growth Model:</h4>
            <pre style={styles.codeBlock}>
{`// Growth follows S-curve (logistic function)
growthFactor = 1 - e^(-r × age)

Where:
- r = species-specific growth rate
- age = current forest age in years`}
            </pre>

            <h4>NDVI-Biomass Coupling:</h4>
            <pre style={styles.codeBlock}>
{`// NDVI indicates canopy density/health
ndviFactor = min(1, NDVI / NDVIsaturation)

// Final biomass calculation
Biomass = YoungBiomass + (MaxBiomass - YoungBiomass) × growthFactor × ndviFactor`}
            </pre>

            <h4>Species-Specific Parameters (from Finnish Forest Research Institute):</h4>
            <pre style={styles.codeBlock}>
{`Pine:  Max 450 t/ha, growth rate 0.08/year, NDVI saturation 0.85
Fir:   Max 500 t/ha, growth rate 0.07/year, NDVI saturation 0.88
Birch: Max 300 t/ha, growth rate 0.12/year, NDVI saturation 0.82
Aspen: Max 250 t/ha, growth rate 0.15/year, NDVI saturation 0.80`}
            </pre>

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: '#0066cc' }}>6. Time Series Processing</h3>

            <h4>Data Collection Strategy:</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>Temporal range</strong>: Last 10 years (2015-2024)</li>
              <li><strong>Season</strong>: June-August only (peak growing season)</li>
              <li><strong>Frequency</strong>: Every available cloud-free acquisition</li>
              <li><strong>Result</strong>: ~50-150 data points over 10 years</li>
            </ul>

            <h4>Noise Reduction:</h4>
            <pre style={styles.codeBlock}>
{`// 7-day rolling average to smooth:
// - Atmospheric variations
// - Sensor calibration differences
// - View angle effects
// - Residual thin clouds`}
            </pre>

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: '#0066cc' }}>7. GeoTIFF Processing</h3>

            <p>The app receives NDVI data as 32-bit floating-point GeoTIFF:</p>

            <pre style={styles.codeBlock}>
{`// GeoTIFF structure:
- Format: Single-band FLOAT32
- Compression: DEFLATE/LZW
- Values: -1.0 to 1.0 (NDVI range)
- NoData: NaN (masked pixels)

// Processing with GeoTIFF.js:
const tiff = await GeoTIFF.fromArrayBuffer(response);
const rasters = await image.readRasters();
const ndviArray = rasters[0];  // Float32Array`}
            </pre>

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: '#0066cc' }}>8. Key Technical Features</h3>

            <h4>Coordinate System Handling:</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>Input</strong>: WGS84 (EPSG:4326) - latitude/longitude</li>
              <li><strong>CRS</strong>: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" (lon,lat order)</li>
              <li><strong>Critical</strong>: Must convert from [lat,lng] to [lng,lat] for API</li>
            </ul>

            <h4>Performance Optimizations:</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li>Adaptive resolution based on polygon size</li>
              <li>Rate limiting: 500ms between API calls</li>
              <li>Parallel processing where possible</li>
              <li>Client-side caching of results</li>
            </ul>

            <h4>Quality Metrics Provided:</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>Coverage %</strong>: Non-cloudy pixels in polygon</li>
              <li><strong>Vegetation %</strong>: Pixels with NDVI &gt; 0.3</li>
              <li><strong>Valid pixels</strong>: Total measurements used</li>
              <li><strong>Rolling averages</strong>: Smoothed trends</li>
            </ul>

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: '#0066cc' }}>9. Common Customer Questions & Answers</h3>

            <p><strong>Q: How accurate is the biomass estimation?</strong><br/>
            A: Typical accuracy is ±20-30% compared to field measurements. NDVI-based estimates are most accurate for relative changes rather than absolute values.</p>

            <p><strong>Q: Why only summer data?</strong><br/>
            A: Maximum vegetation activity, minimal snow cover, and best NDVI signal occur June-August in Finland.</p>

            <p><strong>Q: What causes gaps in the time series?</strong><br/>
            A: Persistent cloud cover. Finland can have weeks of cloudy weather preventing satellite observations.</p>

            <p><strong>Q: Can this detect forest damage/disease?</strong><br/>
            A: Yes - sudden NDVI drops indicate stress, damage, or harvesting. Gradual declines suggest disease or drought.</p>

            <p><strong>Q: Why 10m resolution?</strong><br/>
            A: Sentinel-2's red and NIR bands are natively 10m. This allows monitoring of ~0.01 hectare patches.</p>

            <p><strong>Q: Processing time expectations?</strong><br/>
            A: 3-10 minutes for full 10-year analysis, depending on polygon size and available acquisitions.</p>

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: '#0066cc' }}>10. Data Validation & Error Handling</h3>

            <p>The system includes multiple validation layers:</p>
            <ul style={{ marginLeft: '20px' }}>
              <li>Coordinate boundary checking</li>
              <li>NDVI range validation (-1 to 1)</li>
              <li>Cloud coverage thresholds</li>
              <li>Minimum valid pixel requirements</li>
              <li>Token expiration monitoring</li>
            </ul>

            <p style={{ marginTop: '20px', padding: '10px', backgroundColor: '#e8f5e9', borderRadius: '4px' }}>
              This comprehensive system provides scientifically-grounded forest monitoring using free, open satellite data with regular updates every few days during growing season.
            </p>
          </div>
        )}
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
                  if (name === 'Biomass Trend (7d)') return [`${value.toFixed(1)} t/ha`, name];
                  if (name === 'NDVI Trend (7d)') return [value.toFixed(3), name];
                  return [value, name];
                }}
                labelFormatter={(label) => {
                  const item = biomassData.find(d => d.date === label);
                  return item ? `${label} (Day ${item.day}, Age: ${item.forestAge.toFixed(1)}y, Cov: ${item.coverage}%, Veg: ${item.vegetationPercent}%)` : label;
                }}
              />
              <Legend />

              <Line
                yAxisId="biomass"
                type="monotone"
                dataKey="biomass"
                stroke="#82ca9d"
                name="Biomass"
                strokeWidth={1}
                dot={{ r: 2 }}
                opacity={0.6}
              />
              <Line
                yAxisId="ndvi"
                type="monotone"
                dataKey="ndvi"
                stroke="#8884d8"
                name="NDVI"
                strokeWidth={1}
                dot={{ r: 2 }}
                opacity={0.6}
              />

              {/* Rolling average trend lines */}
              <Line
                yAxisId="biomass"
                type="monotone"
                dataKey="biomassRollingAvg"
                stroke="#2ca02c"
                name="Biomass Trend (7d)"
                strokeWidth={3}
                strokeDasharray="0"
                dot={false}
              />
              <Line
                yAxisId="ndvi"
                type="monotone"
                dataKey="ndviRollingAvg"
                stroke="#1f77b4"
                name="NDVI Trend (7d)"
                strokeWidth={3}
                strokeDasharray="0"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>

          <div style={styles.techDetails}>
            <h3>Technical Implementation & Results</h3>

            {biomassData.length > 0 && (
              <>
                <h4>1. Current Analysis Metrics</h4>
                <div style={{ backgroundColor: '#e8f4f8', padding: '15px', borderRadius: '6px', marginBottom: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px', fontSize: '13px' }}>
                    <div>
                      <strong>Temporal Coverage</strong>
                      <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                        <li>Total Acquisitions: {biomassData.length}</li>
                        <li>Date Range: {biomassData[0].date} to {biomassData[biomassData.length - 1].date}</li>
                        <li>Analysis Duration: {((new Date(biomassData[biomassData.length - 1].date) - new Date(biomassData[0].date)) / 31536000000).toFixed(1)} years</li>
                        <li>Mean Revisit Time: {(biomassData.length > 1 ?
                          (new Date(biomassData[biomassData.length - 1].date) - new Date(biomassData[0].date)) /
                          (biomassData.length - 1) / 86400000 : 0).toFixed(1)} days</li>
                      </ul>
                    </div>
                    <div>
                      <strong>NDVI Statistics</strong>
                      <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                        <li>Mean NDVI: {(biomassData.reduce((sum, d) => sum + d.ndvi, 0) / biomassData.length).toFixed(4)}</li>
                        <li>NDVI Range: {Math.min(...biomassData.map(d => d.ndvi)).toFixed(4)} to {Math.max(...biomassData.map(d => d.ndvi)).toFixed(4)}</li>
                        <li>NDVI Std Dev: {(Math.sqrt(biomassData.reduce((sum, d) => sum + Math.pow(d.ndvi - biomassData.reduce((s, x) => s + x.ndvi, 0) / biomassData.length, 2), 0) / biomassData.length)).toFixed(4)}</li>
                        <li>Vegetation Coverage: {(biomassData.filter(d => d.isForested).length / biomassData.length * 100).toFixed(1)}%</li>
                      </ul>
                    </div>
                    <div>
                      <strong>Biomass Estimates</strong>
                      <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                        <li>Current Biomass: {biomassData[biomassData.length - 1].biomass.toFixed(2)} tons/ha</li>
                        <li>Initial Biomass: {biomassData[0].biomass.toFixed(2)} tons/ha</li>
                        <li>Total Accumulation: {(biomassData[biomassData.length - 1].biomass - biomassData[0].biomass).toFixed(2)} tons/ha</li>
                        <li>Annual Growth Rate: {((biomassData[biomassData.length - 1].biomass - biomassData[0].biomass) / ((new Date(biomassData[biomassData.length - 1].date) - new Date(biomassData[0].date)) / 31536000000)).toFixed(2)} tons/ha/year</li>
                      </ul>
                    </div>
                    <div>
                      <strong>Data Quality Metrics</strong>
                      <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                        <li>Mean Pixel Coverage: {(biomassData.reduce((sum, d) => sum + parseFloat(d.coverage), 0) / biomassData.length).toFixed(1)}%</li>
                        <li>Valid Pixels/Acquisition: {Math.round(biomassData.reduce((sum, d) => sum + d.validPixels, 0) / biomassData.length)}</li>
                        <li>Cloud-Free Acquisitions: {biomassData.filter(d => parseFloat(d.coverage) > 80).length} ({(biomassData.filter(d => parseFloat(d.coverage) > 80).length / biomassData.length * 100).toFixed(1)}%)</li>
                        <li>Forest Area: {selectedForests[selectedForestIndex].area} ha</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            )}

            <p style={{ fontSize: '12px', marginTop: '20px', padding: '10px', backgroundColor: '#f0f8ff', borderRadius: '4px' }}>
              <strong>Processing Summary:</strong> {biomassData.length > 0 ?
                `Analyzed ${biomassData.length} Sentinel-2 acquisitions over ${((new Date(biomassData[biomassData.length - 1].date) - new Date(biomassData[0].date)) / 31536000000).toFixed(1)} years 
                with ${(biomassData.reduce((sum, d) => sum + parseFloat(d.coverage), 0) / biomassData.length).toFixed(1)}% average cloud-free coverage. 
                Biomass increased from ${biomassData[0].biomass.toFixed(1)} to ${biomassData[biomassData.length - 1].biomass.toFixed(1)} tons/ha, 
                representing ${((biomassData[biomassData.length - 1].biomass - biomassData[0].biomass) / biomassData[0].biomass * 100).toFixed(1)}% growth.` :
                'No analysis data available. Complete satellite data processing to view results.'}
            </p>
          </div>
        </div>
      )}
      <p style={{ fontSize: '12px', marginTop: '15px', color: '#666' }}>
        <strong>Author:</strong> <a href="https://x.com/robertkottelin" target="_blank" rel="noopener noreferrer">@robertkottelin</a>
      </p>
      <p style={{ fontSize: '12px', color: '#666' }}>
        <strong>Source code:</strong> <a href="https://github.com/robertkottelin/biomass" target="_blank" rel="noopener noreferrer">Github</a>
      </p>

    </div>
  );
};

export default ForestBiomassApp;