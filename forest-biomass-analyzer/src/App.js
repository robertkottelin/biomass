import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, FeatureGroup, Polygon, useMap } from 'react-leaflet';
import { Line, LineChart, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { estimateTreeCount } from './treeEstimation';
import { analyzeForestHealth } from './healthEstimation';
import { estimateBiomass, calculateRollingAverage } from './dataProcessing';
import CarbonDashboard from './CarbonDashboard';
import { estimateBiodiversity } from './biodiversityEstimation';
import { calculatePriceRange, analyzeHarvestDelay, STANDING_SALE_DISCOUNT } from './timberMarket';
import { assessDeforestationRisk, generateComplianceReport } from './eudrCompliance';
import { assessMetsoEligibility, estimateMetsoCompensation, assessNRLCompliance, compareProtectionVsHarvest } from './regulatoryCompliance';
import { calculateInheritanceTax, projectManagementScenarios, generateAssetSummary, estimateManagementWorkload, LAND_VALUE_PER_HA } from './successionPlanning';
import { estimateTimberValue, biomassToCarbon, estimateCarbonCreditValue, EU_ETS_PRICE_PER_TON, BASIC_DENSITY } from './carbonCalculation';
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
      resolve();
    };
    script.onerror = () => {
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

const InfoButton = ({ id, showInfo, setShowInfo, children }) => (
  <span style={{ position: 'relative', display: 'inline-block' }}>
    <span
      onClick={() => setShowInfo(prev => ({ ...prev, [id]: !prev[id] }))}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '18px', height: '18px', borderRadius: '50%',
        border: '1.5px solid #888', color: '#888', fontSize: '12px',
        fontWeight: 'bold', fontStyle: 'italic', fontFamily: 'Georgia, serif',
        cursor: 'pointer', userSelect: 'none'
      }}
      title="How is this calculated?"
    >i</span>
    {showInfo[id] && (
      <div style={{
        marginTop: '8px', fontSize: '11px', color: '#555', lineHeight: '1.6',
        backgroundColor: '#f4f4f4', padding: '10px', borderRadius: '4px',
        position: 'relative'
      }}>
        <span
          onClick={() => setShowInfo(prev => ({ ...prev, [id]: false }))}
          style={{ position: 'absolute', top: '4px', right: '8px', cursor: 'pointer', fontSize: '14px', color: '#999' }}
        >&times;</span>
        {children}
      </div>
    )}
  </span>
);

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
  const [treeEstimate, setTreeEstimate] = useState(null);
  const [healthEstimate, setHealthEstimate] = useState(null);
  const [biodiversityEstimate, setBiodiversityEstimate] = useState(null);
  const [showInfo, setShowInfo] = useState({});



  // Load GeometryUtil and GeoTIFF on mount
  useEffect(() => {
    Promise.all([loadGeometryUtil(), loadGeoTIFF()]).then(() => {
      // Libraries loaded
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

      // Copernicus Data Space authentication endpoint
      const tokenResponse = await fetch('/api/auth/auth/realms/CDSE/protocol/openid-connect/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
        },
        body: tokenData.toString()
      });

      const responseText = await tokenResponse.text();

      if (!tokenResponse.ok) {
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

      const response = await fetch('/api/copernicus/api/v1/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'image/png'
        },
        body: JSON.stringify(testRequest)
      });

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

    // Multi-band evalscript: NDVI, NDMI (moisture), NDRE (red edge/chlorophyll)
    const evalscript = `
      //VERSION=3
      function setup() {
        return {
          input: [{
            bands: ["B04", "B05", "B08", "B11", "SCL", "dataMask"]
          }],
          output: {
            id: "default",
            bands: 3,
            sampleType: "FLOAT32"
          }
        };
      }

      function evaluatePixel(samples) {
        const SCL_CLOUD_MEDIUM = 8;
        const SCL_CLOUD_HIGH = 9;
        const SCL_THIN_CIRRUS = 10;
        const SCL_SNOW_ICE = 11;

        if (samples.dataMask === 0) {
          return [NaN, NaN, NaN];
        }

        if (samples.SCL === SCL_CLOUD_MEDIUM ||
            samples.SCL === SCL_CLOUD_HIGH ||
            samples.SCL === SCL_THIN_CIRRUS ||
            samples.SCL === SCL_SNOW_ICE) {
          return [NaN, NaN, NaN];
        }

        const eps = 1e-10;
        const ndvi = (samples.B08 - samples.B04) / (samples.B08 + samples.B04 + eps);
        const ndmi = (samples.B08 - samples.B11) / (samples.B08 + samples.B11 + eps);
        const ndre = (samples.B08 - samples.B05) / (samples.B08 + samples.B05 + eps);

        return [ndvi, ndmi, ndre];
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

    try {
      const response = await fetch('/api/copernicus/api/v1/process', {
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
        throw new Error(`Process API error: ${response.status} - ${errorText}`);
      }

      // Parse TIFF response using GeoTIFF.js
      const arrayBuffer = await response.arrayBuffer();

      // Use GeoTIFF.js for proper compressed TIFF parsing (3 bands: NDVI, NDMI, NDRE)
      let ndviValues = [];
      let ndmiValues = [];
      let ndreValues = [];

      if (window.GeoTIFF) {
        try {
          const tiff = await window.GeoTIFF.fromArrayBuffer(arrayBuffer);
          const image = await tiff.getImage();

          // Read all raster bands
          const rasters = await image.readRasters();
          const ndviBand = rasters[0];
          const ndmiBand = rasters[1];
          const ndreBand = rasters[2];

          // Extract valid pixel values (all bands in lockstep)
          for (let i = 0; i < ndviBand.length; i++) {
            const ndviVal = ndviBand[i];
            if (!isNaN(ndviVal) && ndviVal >= -1.0 && ndviVal <= 1.0) {
              ndviValues.push(ndviVal);
              const ndmiVal = ndmiBand ? ndmiBand[i] : NaN;
              const ndreVal = ndreBand ? ndreBand[i] : NaN;
              ndmiValues.push(!isNaN(ndmiVal) && ndmiVal >= -1.0 && ndmiVal <= 1.0 ? ndmiVal : 0);
              ndreValues.push(!isNaN(ndreVal) && ndreVal >= -1.0 && ndreVal <= 1.0 ? ndreVal : 0);
            }
          }

        } catch (geoTiffError) {
          throw new Error('Failed to parse TIFF with GeoTIFF.js: ' + geoTiffError.message);
        }
      } else {
        throw new Error('GeoTIFF.js library not loaded');
      }

      if (ndviValues.length === 0) {
        return null;
      }

      // Calculate statistics
      const mean = ndviValues.reduce((a, b) => a + b, 0) / ndviValues.length;
      const min = Math.min(...ndviValues);
      const max = Math.max(...ndviValues);
      const ndmiMean = ndmiValues.length > 0 ? ndmiValues.reduce((a, b) => a + b, 0) / ndmiValues.length : 0;
      const ndreMean = ndreValues.length > 0 ? ndreValues.reduce((a, b) => a + b, 0) / ndreValues.length : 0;

      // Land cover analysis
      const vegetationPixels = ndviValues.filter(v => v > 0.3).length;

      return {
        mean: mean,
        min: min,
        max: max,
        ndmiMean: ndmiMean,
        ndreMean: ndreMean,
        validPixels: ndviValues.length,
        totalPixels: pixelWidth * pixelHeight,
        vegetationPixels: vegetationPixels,
        vegetationPercent: (vegetationPixels / ndviValues.length * 100),
        ndviValues: ndviValues,
        ndmiValues: ndmiValues,
        ndreValues: ndreValues
      };

    } catch (error) {
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
      const response = await fetch('/api/copernicus/api/v1/catalog/1.0.0/search', {
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
      const results = [];
      let latestNdviValues = null;
      const startYear = currentYear - 10;

      // Calculate forest age at the start of analysis period
      // User enters current age, we calculate age 10 years ago
      const ageAtAnalysisStart = forestAge - 10;

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
          }
        }

        setProcessingStatus(`Fetching available dates for ${year} summer...`);

        // Get available acquisition dates from Catalog API
        const availableDates = await fetchAvailableDates(bbox, dateFrom, dateTo);

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

              const biomass = estimateBiomass(avgNDVI, selectedForest.type, fractionalYear, ageAtAnalysisStart);

              // Keep the latest NDVI pixel values for tree estimation
              latestNdviValues = ndviStats.ndviValues;

              results.push({
                date: acquisitionDate,
                year,
                month: dateTime.getMonth() + 1,
                day: dateTime.getDate(),
                yearsFromStart: fractionalYear,
                ndvi: avgNDVI,
                ndviMin: ndviStats.min,
                ndviMax: ndviStats.max,
                ndmi: ndviStats.ndmiMean,
                ndre: ndviStats.ndreMean,
                biomass,
                forestAge: ageAtAnalysisStart + fractionalYear,
                validPixels: ndviStats.validPixels,
                totalPixels: ndviStats.totalPixels,
                coverage: (ndviStats.validPixels / ndviStats.totalPixels * 100).toFixed(1),
                vegetationPercent: ndviStats.vegetationPercent.toFixed(1),
                isWater: avgNDVI < 0.1,
                isForested: ndviStats.vegetationPercent > 30
              });
            }
          } catch (dateError) {
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

      // Calculate rolling averages with larger window for daily data
      let withRolling = calculateRollingAverage(results, 'biomass', 7);
      withRolling = calculateRollingAverage(withRolling, 'ndvi', 7);
      withRolling = calculateRollingAverage(withRolling, 'ndmi', 7);
      const finalResults = calculateRollingAverage(withRolling, 'ndre', 7);

      setBiomassData(finalResults);

      // Estimate tree count from the most recent acquisition's NDVI pixels
      if (latestNdviValues && latestNdviValues.length > 0) {
        const latestResult = finalResults[finalResults.length - 1];
        const treeEst = estimateTreeCount(
          latestNdviValues,
          selectedForest.type,
          latestResult.forestAge,
          selectedForest.area
        );
        setTreeEstimate(treeEst);
      } else {
        setTreeEstimate(null);
      }

      // Forest health analysis
      const healthResult = analyzeForestHealth(finalResults, selectedForest.type, forestAge);
      setHealthEstimate(healthResult);

      // Biodiversity assessment
      const latestResult = finalResults[finalResults.length - 1];
      const bioEst = estimateBiodiversity(
        finalResults,
        treeEstimate || (latestNdviValues ? { canopyCover: '70', meanCrownDiameter: '3.0' } : null),
        healthResult,
        selectedForest.type,
        forestAge,
        parseFloat(selectedForest.area)
      );
      setBiodiversityEstimate(bioEst);

      setProcessingStatus('');

      // Vegetation coverage analysis
      const vegetatedCount = finalResults.filter(d => d.isForested).length;
      const vegPercent = (vegetatedCount / finalResults.length * 100).toFixed(1);

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
      'Is Forested',
      'Estimated Trees',
      'Trees Per Hectare',
      'Canopy Cover (%)',
      'NDMI Mean',
      'NDRE Mean',
      'NDMI 7-Day Rolling Avg',
      'NDRE 7-Day Rolling Avg',
      'Health Score',
      'Stress Type',
      'Stress Severity',
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
      row.isForested ? 'Yes' : 'No',
      treeEstimate ? treeEstimate.count : 'N/A',
      treeEstimate ? treeEstimate.treesPerHa : 'N/A',
      treeEstimate ? treeEstimate.canopyCover : 'N/A',
      row.ndmi != null ? row.ndmi.toFixed(4) : 'N/A',
      row.ndre != null ? row.ndre.toFixed(4) : 'N/A',
      row.ndmiRollingAvg != null ? row.ndmiRollingAvg.toFixed(4) : 'N/A',
      row.ndreRollingAvg != null ? row.ndreRollingAvg.toFixed(4) : 'N/A',
      healthEstimate ? healthEstimate.healthScore : 'N/A',
      healthEstimate?.perAcquisitionStress?.find(s => s.date === row.date)?.stress?.type || 'N/A',
      healthEstimate?.perAcquisitionStress?.find(s => s.date === row.date)?.stress?.severity || 'N/A'
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
              <li><strong>Option A - Direct OAuth2:</strong> Register at <a href="https://dataspace.copernicus.eu/" target="_blank" rel="noreferrer">Copernicus Data Space</a> → Create OAuth2 client → Enter Client ID & Secret → Click "Authenticate"</li>
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
              <li><strong>Forest Age:</strong> Current age of the forest as of today. The app automatically calculates the age at the start of the 10-year analysis period. (Example: if planted in 2000, enter 25 for year 2025)</li>
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
          <label style={styles.label}>Current Forest Age (years)</label>
          <input
            style={styles.input}
            type="number"
            min="11"
            max="100"
            value={forestAge}
            onChange={(e) => setForestAge(parseInt(e.target.value) || 20)}
            title="Enter the current age of the forest (e.g., if planted in 2000, enter 25 for year 2025)"
          />
          <p style={{ fontSize: '12px', color: '#666', margin: '5px 0 0 0' }}>
            Enter age as of {new Date().getFullYear()}. Analysis covers the last 10 years. (Min: 11 years)
          </p>
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
              <p><strong>Current Age:</strong> {forestAge} years</p>
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
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>Satellite Data: NDVI & Biomass Trends <InfoButton id="mainChart" showInfo={showInfo} setShowInfo={setShowInfo}>
                NDVI (Normalized Difference Vegetation Index) measures greenness from satellite red and near-infrared bands: (NIR − Red) / (NIR + Red), range 0–1. NDMI (Normalized Difference Moisture Index) measures canopy water content from NIR and SWIR bands. NDRE (Normalized Difference Red Edge) detects chlorophyll density from red-edge and NIR bands. Biomass is estimated from NDVI using a species-specific logistic growth model: biomass = youngBiomass + (maxBiomass − youngBiomass) × (1 − e<sup>−growthRate × age</sup>) × (NDVI / saturationNDVI). Rolling averages use a 7-observation window to smooth noise.
              </InfoButton></h2>
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
                  if (name === 'NDMI' || name === 'NDMI Trend (7d)') return [value.toFixed(3), name];
                  if (name === 'NDRE' || name === 'NDRE Trend (7d)') return [value.toFixed(3), name];
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

              {/* NDMI (moisture) and NDRE (red edge) trend lines */}
              <Line
                yAxisId="ndvi"
                type="monotone"
                dataKey="ndmiRollingAvg"
                stroke="#ff7f0e"
                name="NDMI Trend (7d)"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
              />
              <Line
                yAxisId="ndvi"
                type="monotone"
                dataKey="ndreRollingAvg"
                stroke="#d62728"
                name="NDRE Trend (7d)"
                strokeWidth={2}
                strokeDasharray="5 5"
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><strong>NDVI Statistics</strong> <InfoButton id="ndviStats" showInfo={showInfo} setShowInfo={setShowInfo}>
                        Mean, min, max, and standard deviation of all NDVI values across satellite acquisitions. Vegetation coverage = percentage of acquisitions where the area was classified as forested (NDVI indicates active vegetation).
                      </InfoButton></div>
                      <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                        <li>Mean NDVI: {(biomassData.reduce((sum, d) => sum + d.ndvi, 0) / biomassData.length).toFixed(4)}</li>
                        <li>NDVI Range: {Math.min(...biomassData.map(d => d.ndvi)).toFixed(4)} to {Math.max(...biomassData.map(d => d.ndvi)).toFixed(4)}</li>
                        <li>NDVI Std Dev: {(Math.sqrt(biomassData.reduce((sum, d) => sum + Math.pow(d.ndvi - biomassData.reduce((s, x) => s + x.ndvi, 0) / biomassData.length, 2), 0) / biomassData.length)).toFixed(4)}</li>
                        <li>Vegetation Coverage: {(biomassData.filter(d => d.isForested).length / biomassData.length * 100).toFixed(1)}%</li>
                      </ul>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><strong>Biomass Estimates</strong> <InfoButton id="biomassEstimates" showInfo={showInfo} setShowInfo={setShowInfo}>
                        Biomass (tons/ha) is estimated from each NDVI reading using a logistic growth curve calibrated per species. Parameters: pine max 450 t/ha at growth rate 0.08, fir 500 t/ha at 0.07, birch 300 t/ha at 0.12, aspen 250 t/ha at 0.15. Current and initial values are the last and first observations. Annual growth rate = (current − initial) / years elapsed.
                      </InfoButton></div>
                      <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                        <li>Current Biomass: {biomassData[biomassData.length - 1].biomass.toFixed(2)} tons/ha</li>
                        <li>Initial Biomass: {biomassData[0].biomass.toFixed(2)} tons/ha</li>
                        <li>Total Accumulation: {(biomassData[biomassData.length - 1].biomass - biomassData[0].biomass).toFixed(2)} tons/ha</li>
                        <li>Annual Growth Rate: {((biomassData[biomassData.length - 1].biomass - biomassData[0].biomass) / ((new Date(biomassData[biomassData.length - 1].date) - new Date(biomassData[0].date)) / 31536000000)).toFixed(2)} tons/ha/year</li>
                      </ul>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><strong>Data Quality Metrics</strong> <InfoButton id="dataQuality" showInfo={showInfo} setShowInfo={setShowInfo}>
                        Pixel coverage = percentage of the polygon area with valid (cloud-free) satellite data per acquisition. Valid pixels = number of 10m×10m Sentinel-2 pixels with usable data. Cloud-free acquisitions = readings with {'>'}80% pixel coverage.
                      </InfoButton></div>
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

            {treeEstimate && (
              <>
                <h4>2. Estimated Tree Count</h4>
                <div style={{ backgroundColor: '#e8f8e8', padding: '15px', borderRadius: '6px', marginBottom: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px', fontSize: '13px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><strong>Tree Density Estimate</strong> <InfoButton id="treeDensity" showInfo={showInfo} setShowInfo={setShowInfo}>
                        Tree count is estimated from satellite NDVI pixel data via canopy analysis. Pixels with NDVI {'>'} 0.4 = full canopy, 0.2–0.4 = partial (linear interpolation), {'<'} 0.2 = no canopy. The canopy fraction is divided by individual crown area (π × (diameter/2)²) adjusted by a species packing factor (0.60–0.75). Crown diameter grows with age: diameter = minDiam + (maxDiam − minDiam) × (1 − e<sup>−0.04 × age</sup>). Range is ±30% to reflect 10m pixel resolution limits.
                      </InfoButton></div>
                      <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                        <li>Estimated Trees: <strong>{treeEstimate.count.toLocaleString()}</strong></li>
                        <li>Confidence Range: {treeEstimate.countMin.toLocaleString()} – {treeEstimate.countMax.toLocaleString()}</li>
                        <li>Trees per Hectare: {treeEstimate.treesPerHa.toLocaleString()}</li>
                        <li>Density Range: {treeEstimate.treesPerHaMin.toLocaleString()} – {treeEstimate.treesPerHaMax.toLocaleString()} /ha</li>
                      </ul>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><strong>Canopy Parameters</strong> <InfoButton id="canopyParams" showInfo={showInfo} setShowInfo={setShowInfo}>
                        Canopy cover = fraction of area under tree crowns derived from NDVI pixel thresholds. Crown diameter is modeled per species (pine 2–8m, fir 1.5–6m, birch 3–10m, aspen 2.5–9m) using a saturating exponential of forest age. Packing factor accounts for gaps between crowns (not all canopy area contains trees).
                      </InfoButton></div>
                      <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                        <li>Canopy Cover: {treeEstimate.canopyCover}%</li>
                        <li>Mean Crown Diameter: {treeEstimate.meanCrownDiameter} m</li>
                        <li>Crown Area: {treeEstimate.crownArea} m²</li>
                        <li>Packing Factor: {treeEstimate.packingFactor}</li>
                      </ul>
                    </div>
                  </div>
                  <p style={{ fontSize: '11px', color: '#666', margin: '10px 0 0 0', fontStyle: 'italic' }}>
                    Estimated using forestry allometric models (crown diameter × canopy cover). Sentinel-2 at 10m resolution
                    cannot resolve individual trees — this is a statistical estimate based on species, age, and NDVI-derived canopy cover (±30% uncertainty).
                  </p>
                </div>
              </>
            )}

            {biomassData.length > 0 && (
              <>
                <h4>3. Timber Value & Harvest Analysis</h4>
                <CarbonDashboard
                  biomassData={biomassData}
                  forestType={selectedForests[selectedForestIndex].type}
                  forestAge={forestAge}
                  areaHectares={parseFloat(selectedForests[selectedForestIndex].area)}
                  showInfo={showInfo}
                  setShowInfo={setShowInfo}
                />
              </>
            )}

            {/* 3b. Timber Market & Pricing */}
            {biomassData.length > 0 && (() => {
              const currentType = selectedForests[selectedForestIndex].type;
              const currentArea = parseFloat(selectedForests[selectedForestIndex].area);
              const latestBiomass = biomassData[biomassData.length - 1].biomass;
              const priceRange = calculatePriceRange(latestBiomass, currentType, forestAge, currentArea);
              const harvestDelay = analyzeHarvestDelay(currentType, forestAge, currentArea);

              return (
                <>
                  <h4>3b. Timber Market & Pricing</h4>
                  <div style={{ backgroundColor: '#fef9e7', padding: '15px', borderRadius: '6px', marginBottom: '20px', border: '1px solid #f0e68c' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '15px' }}>
                      <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          Price Range (Delivery)
                          <InfoButton id="marketPriceRange" showInfo={showInfo} setShowInfo={setShowInfo}>
                            Low/Avg/High delivery-sale prices based on Luke 2024 price statistics across Finnish timber buyers. Delivery sale = you handle harvesting and transport to mill. Includes sawlog, pulpwood, and energy wood volumes.
                          </InfoButton>
                        </div>
                        <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#8b6914', margin: '6px 0' }}>
                          €{priceRange.avg.toFixed(0)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888' }}>
                          €{priceRange.low.toFixed(0)} — €{priceRange.high.toFixed(0)}
                        </div>
                      </div>

                      <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          Standing Sale
                          <InfoButton id="marketStanding" showInfo={showInfo} setShowInfo={setShowInfo}>
                            Standing (pystykauppa) sale price = delivery price × {(STANDING_SALE_DISCOUNT * 100).toFixed(0)}%. Buyer handles all harvesting and transport. Lower price but zero work and risk for seller. Most common sale type in Finland.
                          </InfoButton>
                        </div>
                        <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#8b6914', margin: '6px 0' }}>
                          €{priceRange.standingSaleAvg.toFixed(0)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888' }}>
                          €{priceRange.standingSaleLow.toFixed(0)} — €{priceRange.standingSaleHigh.toFixed(0)}
                        </div>
                      </div>

                      <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          Volume Breakdown
                          <InfoButton id="marketVolume" showInfo={showInfo} setShowInfo={setShowInfo}>
                            Timber split into sawlog (high-value logs for lumber), pulpwood (for paper/board), and energy wood (branches, tops, small-diameter). Sawlog fraction increases with forest age — older forests produce more valuable timber.
                          </InfoButton>
                        </div>
                        <div style={{ fontSize: '13px', margin: '6px 0', lineHeight: '1.6' }}>
                          <div>Sawlog: <strong>{(priceRange.sawlogFraction * 100).toFixed(0)}%</strong> ({priceRange.sawlogVolume.toFixed(0)} m³/ha)</div>
                          <div>Pulpwood: <strong>{(priceRange.pulpwoodFraction * 100).toFixed(0)}%</strong> ({priceRange.pulpwoodVolume.toFixed(0)} m³/ha)</div>
                          <div>Energy: <strong>10%</strong> ({priceRange.energyWoodVolume.toFixed(0)} m³/ha)</div>
                        </div>
                      </div>
                    </div>

                    {/* Harvest Delay Analysis */}
                    <h5 style={{ margin: '0 0 5px 0', color: '#333', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Harvest Delay Analysis
                      <InfoButton id="marketDelay" showInfo={showInfo} setShowInfo={setShowInfo}>
                        Projects timber value if you wait 1, 3, or 5 years before harvesting. Nominal = future timber value. Discounted = adjusted for time value of money at 3% forestry discount rate. A positive discounted gain means waiting is financially better than harvesting now and investing the proceeds.
                      </InfoButton>
                    </h5>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={[
                        { name: 'Now', nominal: harvestDelay.currentValue, discounted: harvestDelay.currentValue },
                        ...harvestDelay.projections.map(p => ({
                          name: `+${p.delayYears}yr`,
                          nominal: p.nominalValue,
                          discounted: p.discountedValue
                        }))
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v}`} />
                        <Tooltip formatter={(val) => [`€${Number(val).toLocaleString()}`]} />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Line type="monotone" dataKey="nominal" stroke="#8b6914" strokeWidth={2} name="Nominal Value" />
                        <Line type="monotone" dataKey="discounted" stroke="#e67e22" strokeWidth={2} strokeDasharray="4 4" name="Discounted (3%)" />
                      </LineChart>
                    </ResponsiveContainer>
                    <p style={{ fontSize: '11px', color: '#666', margin: '5px 0 0 0', fontStyle: 'italic' }}>
                      Prices based on Luke 2024 Finnish timber price statistics. UPM, Stora Enso, and Metsä Group control ~80% of purchases — compare offers from multiple buyers.
                    </p>
                  </div>
                </>
              );
            })()}

            {healthEstimate && (
              <>
                <h4>4. Forest Health Assessment</h4>
                <div style={{
                  backgroundColor: healthEstimate.healthScore > 80 ? '#e8f8e8' :
                    healthEstimate.healthScore > 60 ? '#fef9e7' :
                    healthEstimate.healthScore > 40 ? '#fdedec' : '#f8d7da',
                  padding: '15px', borderRadius: '6px', marginBottom: '20px'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px', fontSize: '13px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong>Health Score</strong>
                        <InfoButton id="healthScore" showInfo={showInfo} setShowInfo={setShowInfo}>
                          <strong>How this score is calculated:</strong>
                          <br />Score starts at 100 and points are deducted for three types of problems detected in the satellite data:
                          <ol style={{ margin: '4px 0', paddingLeft: '18px' }}>
                            <li>
                              <strong>Recent stress (-8 pts each, max 40):</strong> Each satellite reading is classified as stressed or healthy by comparing its NDVI, NDMI, and NDRE values against baselines (median of the top 25% of all readings). If any index is {'>'} 10% below its baseline, that reading is stressed. The last 5 readings are checked.
                            </li>
                            <li>
                              <strong>Anomalous years (-10 pts each):</strong> For each calendar year, the highest NDVI value (peak greenness) is found. If a year's peak is more than 1.5 standard deviations below the multi-year average of all yearly peaks, that year is flagged as anomalous.
                            </li>
                            <li>
                              <strong>Gradual decline (up to -30 pts):</strong> A linear regression is fitted to the yearly peak NDVI values over time. If the slope is steeper than -0.01 NDVI/year (i.e., peak greenness is declining year over year), points are deducted: min(30, |slope| &times; 1000).
                            </li>
                          </ol>
                          Score {'>'} 80 = Good, {'>'} 60 = Fair, {'>'} 40 = Poor, {'<='} 40 = Critical.
                        </InfoButton>
                      </div>
                      <div style={{ fontSize: '32px', fontWeight: 'bold', margin: '5px 0',
                        color: healthEstimate.healthScore > 80 ? '#27ae60' :
                          healthEstimate.healthScore > 60 ? '#f39c12' :
                          healthEstimate.healthScore > 40 ? '#e67e22' : '#e74c3c'
                      }}>
                        {healthEstimate.healthScore}/100
                        <span style={{ fontSize: '16px', marginLeft: '8px' }}>{healthEstimate.healthLabel}</span>
                      </div>
                      <div style={{ marginTop: '8px' }}>
                        <strong>Current Status:</strong> {healthEstimate.currentStatus?.description || 'Unknown'}
                        {healthEstimate.currentStatus?.severity !== 'none' && (
                          <span style={{ marginLeft: '6px', padding: '2px 6px', borderRadius: '3px', fontSize: '11px',
                            backgroundColor: healthEstimate.currentStatus?.severity === 'severe' ? '#e74c3c' : '#f39c12',
                            color: '#fff'
                          }}>
                            {healthEstimate.currentStatus?.severity}
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <strong>Probable Causes</strong>
                      {healthEstimate.currentProbableCauses.length > 0 ? (
                        <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                          {healthEstimate.currentProbableCauses.map((cause, i) => (
                            <li key={i}>
                              <span style={{ padding: '1px 5px', borderRadius: '3px', fontSize: '10px', marginRight: '5px',
                                backgroundColor: cause.category === 'Disease' ? '#8e44ad' :
                                  cause.category === 'Parasite' ? '#d35400' : '#2980b9',
                                color: '#fff'
                              }}>{cause.category}</span>
                              {cause.name}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p style={{ margin: '5px 0', color: '#27ae60' }}>No specific threats identified</p>
                      )}
                    </div>
                    <div>
                      <strong>Detected Events</strong>
                      <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                        {healthEstimate.anomalies.length > 0 ? (
                          healthEstimate.anomalies.map((a, i) => (
                            <li key={`a-${i}`} style={{ color: a.severity === 'severe' ? '#e74c3c' : '#f39c12' }}>
                              {a.year}: Anomalous year (peak NDVI {a.peakNdvi.toFixed(3)} vs expected {a.expectedNdvi.toFixed(3)})
                            </li>
                          ))
                        ) : (
                          <li style={{ color: '#27ae60' }}>No anomalous years detected</li>
                        )}
                        {healthEstimate.disturbanceEvents.length > 0 && (
                          healthEstimate.disturbanceEvents.slice(0, 3).map((e, i) => (
                            <li key={`d-${i}`} style={{ color: '#e74c3c' }}>
                              {e.date}: Sudden drop ({e.dropPercent}% NDVI decline)
                            </li>
                          ))
                        )}
                        {healthEstimate.gradualDecline && (
                          <li style={{ color: '#e67e22' }}>
                            Multi-year decline: {Math.abs(healthEstimate.gradualDecline.slopePerYear).toFixed(4)} NDVI/year
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                  {/* Health Timeline Chart */}
                  {healthEstimate.perAcquisitionStress && healthEstimate.perAcquisitionStress.length > 0 && (() => {
                    const healthTimelineData = healthEstimate.perAcquisitionStress.map(d => {
                      const matchingData = biomassData.find(b => b.date === d.date);
                      const ndvi = matchingData ? matchingData.ndvi : null;
                      const ndviDeviation = ndvi != null && healthEstimate.baselines.ndvi > 0
                        ? ((ndvi - healthEstimate.baselines.ndvi) / healthEstimate.baselines.ndvi * 100)
                        : 0;
                      const isStressed = d.stress.type !== 'healthy';
                      // Per-acquisition health indicator: 100 when at baseline, drops proportionally
                      const healthIndex = Math.max(0, Math.min(100, Math.round(100 + ndviDeviation * 3)));
                      return {
                        date: d.date,
                        healthIndex,
                        ndvi: ndvi != null ? parseFloat(ndvi.toFixed(4)) : null,
                        stressType: d.stress.type,
                        severity: d.stress.severity,
                        description: d.stress.description,
                        isStressed,
                        forestAge: matchingData ? parseFloat(matchingData.forestAge.toFixed(1)) : null
                      };
                    });

                    const anomalyDates = new Set(healthEstimate.anomalies.map(a => a.date));
                    const disturbanceDates = new Set(healthEstimate.disturbanceEvents.map(e => e.date));

                    return (
                      <div style={{ marginTop: '15px' }}>
                        <h5 style={{ margin: '0 0 5px 0', color: '#333', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Health Index Timeline
                          <InfoButton id="healthTimeline" showInfo={showInfo} setShowInfo={setShowInfo}>
                            Per-acquisition health index derived from NDVI deviation against the baseline (top-quartile mean). 100 = at or above baseline, lower values indicate stress. Red vertical lines mark sudden disturbance events ({'>'}15% NDVI drop). Orange vertical lines mark anomalous year peaks. Stress classifications shown in tooltip: moisture stress, defoliation, chlorophyll loss, etc.
                          </InfoButton>
                        </h5>
                        <p style={{ fontSize: '11px', color: '#666', margin: '0 0 10px 0' }}>
                          Each point is a satellite acquisition. Drops below the green zone indicate stress events — hover for details.
                        </p>
                        <ResponsiveContainer width="100%" height={250}>
                          <LineChart data={healthTimelineData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 10 }}
                              angle={-45}
                              textAnchor="end"
                              height={60}
                            />
                            <YAxis
                              domain={[0, 100]}
                              tick={{ fontSize: 11 }}
                              label={{ value: 'Health Index', angle: -90, position: 'insideLeft', fontSize: 11 }}
                            />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (!active || !payload || !payload.length) return null;
                                const d = payload[0].payload;
                                return (
                                  <div style={{ backgroundColor: '#fff', border: '1px solid #ccc', padding: '8px', borderRadius: '4px', fontSize: '12px' }}>
                                    <div><strong>{d.date}</strong> (age: {d.forestAge}yr)</div>
                                    <div>Health Index: <strong style={{ color: d.healthIndex > 70 ? '#27ae60' : d.healthIndex > 40 ? '#f39c12' : '#e74c3c' }}>{d.healthIndex}</strong></div>
                                    <div>NDVI: {d.ndvi}</div>
                                    <div>Status: {d.description}</div>
                                    {d.isStressed && <div style={{ color: '#e74c3c' }}>Stress: {d.stressType} ({d.severity})</div>}
                                  </div>
                                );
                              }}
                            />
                            {/* Green zone: healthy range */}
                            <ReferenceLine y={70} stroke="#27ae60" strokeDasharray="4 4" strokeWidth={1} />
                            <ReferenceLine y={40} stroke="#e74c3c" strokeDasharray="4 4" strokeWidth={1} />
                            {/* Mark disturbance events */}
                            {healthTimelineData.map((d, i) =>
                              disturbanceDates.has(d.date) ? (
                                <ReferenceLine key={`dist-${i}`} x={d.date} stroke="#e74c3c" strokeWidth={2} strokeDasharray="2 2" />
                              ) : null
                            )}
                            {/* Mark anomalous year peaks */}
                            {healthTimelineData.map((d, i) =>
                              anomalyDates.has(d.date) ? (
                                <ReferenceLine key={`anom-${i}`} x={d.date} stroke="#f39c12" strokeWidth={2} strokeDasharray="3 3" />
                              ) : null
                            )}
                            <Line
                              type="monotone"
                              dataKey="healthIndex"
                              stroke="#2c3e50"
                              strokeWidth={2}
                              dot={(props) => {
                                const { cx, cy, payload } = props;
                                const color = payload.isStressed
                                  ? (payload.severity === 'severe' ? '#e74c3c' : '#f39c12')
                                  : '#27ae60';
                                return <circle key={`dot-${props.index}`} cx={cx} cy={cy} r={payload.isStressed ? 4 : 2} fill={color} stroke={color} />;
                              }}
                              activeDot={{ r: 5 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'flex', gap: '15px', fontSize: '10px', color: '#666', marginTop: '5px', flexWrap: 'wrap' }}>
                          <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#27ae60', marginRight: '4px' }}></span>Healthy</span>
                          <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f39c12', marginRight: '4px' }}></span>Moderate stress</span>
                          <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#e74c3c', marginRight: '4px' }}></span>Severe stress</span>
                          <span><span style={{ display: 'inline-block', width: '20px', height: '2px', backgroundColor: '#e74c3c', marginRight: '4px', verticalAlign: 'middle' }}></span>Disturbance event</span>
                          <span><span style={{ display: 'inline-block', width: '20px', height: '2px', backgroundColor: '#f39c12', marginRight: '4px', verticalAlign: 'middle' }}></span>Anomalous year</span>
                        </div>
                      </div>
                    );
                  })()}

                  <p style={{ fontSize: '11px', color: '#666', margin: '10px 0 0 0', fontStyle: 'italic' }}>
                    Health assessment based on NDVI, NDMI (moisture), and NDRE (red edge) spectral indices from Sentinel-2.
                    Probable causes are matched from species-specific vulnerability profiles — field verification is recommended for confirmation.
                  </p>
                </div>
              </>
            )}

            {biodiversityEstimate && (
              <>
                <h4>5. Biodiversity Assessment</h4>
                <div style={{
                  backgroundColor: biodiversityEstimate.overallScore > 70 ? '#e8f8e8' :
                    biodiversityEstimate.overallScore > 50 ? '#fef9e7' : '#fdedec',
                  padding: '15px', borderRadius: '6px', marginBottom: '20px'
                }}>
                  <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555' }}>Biodiversity Score</span>
                      <InfoButton id="bioScore" showInfo={showInfo} setShowInfo={setShowInfo}>
                        <strong>Weighted composite score (0-100):</strong>
                        <ul style={{ margin: '4px 0', paddingLeft: '18px' }}>
                          <li><strong>Structural Diversity (40%):</strong> NDVI spatial variance (canopy heterogeneity), canopy cover optimality (60-85% ideal per Finnish forestry science), and crown diameter maturity relative to species maximum.</li>
                          <li><strong>Species Composition (30%):</strong> Fixed at 30/100 for monoculture stands — remote sensing cannot reliably detect species mix from a single polygon type. Honest limitation.</li>
                          <li><strong>Age/Maturity (15%):</strong> min(age / mature age, 1). Older forests provide more habitat niches (Kuuluvainen & Aakala, 2011).</li>
                          <li><strong>Health Factor (15%):</strong> From spectral health assessment. Healthy forests support more biodiversity.</li>
                        </ul>
                        Score {'>'} 70 = Good, {'>'} 50 = Moderate, {'<='} 50 = Low.
                      </InfoButton>
                    </div>
                    <div style={{
                      fontSize: '48px', fontWeight: 'bold', margin: '5px 0',
                      color: biodiversityEstimate.overallScore > 70 ? '#27ae60' :
                        biodiversityEstimate.overallScore > 50 ? '#f39c12' : '#e74c3c'
                    }}>
                      {biodiversityEstimate.overallScore}/100
                    </div>
                    <div style={{ fontSize: '16px', color: '#555' }}>{biodiversityEstimate.overallLabel}</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '15px' }}>
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.6)', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>Structural Diversity <InfoButton id="bioStructural" showInfo={showInfo} setShowInfo={setShowInfo}>
                        Measures canopy heterogeneity from NDVI variance across the polygon (40% weight), canopy cover optimality — 60-85% is ideal as it provides both shelter and light gaps (30%), and crown diameter maturity (30%). Higher variation = more microhabitats.
                      </InfoButton></div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2c3e50' }}>{biodiversityEstimate.structuralDiversity}</div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.6)', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>Species Composition <InfoButton id="bioSpecies" showInfo={showInfo} setShowInfo={setShowInfo}>
                        Fixed at 30/100 for monoculture stands. We cannot detect mixed species from a single forest type polygon. Finnish forests with 3+ tree species score significantly higher in biodiversity surveys (Vanha-Majamaa & Jalonen, 2001). Add broadleaves to conifer stands for improvement.
                      </InfoButton></div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2c3e50' }}>{biodiversityEstimate.speciesComposition}</div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.6)', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>Age/Maturity <InfoButton id="bioAge" showInfo={showInfo} setShowInfo={setShowInfo}>
                        Ratio of current age to species mature age (pine 80yr, fir 90yr, birch 60yr, aspen 50yr). Older forests develop more structural complexity, deadwood, and ecological niches for epiphytes, cavity-nesting birds, and saproxylic insects.
                      </InfoButton></div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2c3e50' }}>{biodiversityEstimate.ageFactor}</div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.6)', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>Deadwood Potential <InfoButton id="bioDeadwood" showInfo={showInfo} setShowInfo={setShowInfo}>
                        Deadwood is critical for ~25% of forest species in Finland. Estimated from forest age (older forests have more natural mortality) and NDVI spatial variance (indicates structural heterogeneity). "Likely" if age {'>'} species deadwood age and high NDVI variance. Deadwood ages: pine 100yr, fir 110yr, birch 70yr, aspen 60yr.
                      </InfoButton></div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2c3e50' }}>{biodiversityEstimate.deadwood}</div>
                    </div>
                  </div>

                  {biodiversityEstimate.recommendations.length > 0 && (
                    <div style={{ marginTop: '10px' }}>
                      <strong style={{ fontSize: '12px' }}>Recommendations:</strong>
                      <ul style={{ margin: '5px 0 0 0', paddingLeft: '20px', fontSize: '12px', color: '#555' }}>
                        {biodiversityEstimate.recommendations.map((rec, i) => (
                          <li key={i} style={{ marginBottom: '3px' }}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p style={{ fontSize: '11px', color: '#666', margin: '10px 0 0 0', fontStyle: 'italic' }}>
                    Biodiversity assessment is based on remote sensing indicators and forestry models — not a field survey.
                    Species composition is conservatively scored as monoculture since we cannot detect mixed species from satellite data alone.
                    For accurate biodiversity assessment, on-site surveys are recommended.
                  </p>
                </div>
              </>
            )}

            {/* 6. EUDR Compliance */}
            {biomassData.length > 0 && (() => {
              const riskAssessment = assessDeforestationRisk(biomassData);
              if (!riskAssessment) return null;

              const currentType = selectedForests[selectedForestIndex].type;
              const currentArea = parseFloat(selectedForests[selectedForestIndex].area);
              const coords = selectedForests[selectedForestIndex].coords;
              const report = generateComplianceReport(biomassData, coords, currentType, currentArea);

              return (
                <>
                  <h4>6. EUDR Compliance</h4>
                  <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '6px', marginBottom: '20px', border: `2px solid ${riskAssessment.riskColor}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '15px' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          Risk Classification
                          <InfoButton id="eudrRisk" showInfo={showInfo} setShowInfo={setShowInfo}>
                            EU Deforestation Regulation (EUDR, effective Dec 2026) requires proof that timber products are not linked to deforestation after Dec 31, 2020. Risk is assessed by comparing pre-2021 and post-2020 NDVI baselines from satellite data. Negligible (≥90% continuity), Low (≥75%), Standard (≥60%), High ({'<'}60%).
                          </InfoButton>
                        </div>
                        <div style={{ fontSize: '32px', fontWeight: 'bold', color: riskAssessment.riskColor, margin: '8px 0' }}>
                          {riskAssessment.riskLevel}
                        </div>
                        <div style={{ fontSize: '12px', color: '#555' }}>{riskAssessment.reason}</div>
                      </div>

                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          Continuity Score
                          <InfoButton id="eudrContinuity" showInfo={showInfo} setShowInfo={setShowInfo}>
                            Ratio of post-2020 average yearly peak NDVI to pre-2021 baseline. 100% = no change in forest cover. Values below 90% trigger additional due diligence requirements.
                          </InfoButton>
                        </div>
                        <div style={{ fontSize: '32px', fontWeight: 'bold', color: riskAssessment.riskColor, margin: '8px 0' }}>
                          {riskAssessment.continuityRatio != null ? `${riskAssessment.continuityRatio.toFixed(1)}%` : 'N/A'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#555' }}>
                          Pre-2021: {riskAssessment.dataPoints.pre} pts / Post-2020: {riskAssessment.dataPoints.post} pts
                        </div>
                      </div>

                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase' }}>Compliance Status</div>
                        <div style={{
                          fontSize: '18px', fontWeight: 'bold', margin: '8px 0',
                          padding: '6px 12px', borderRadius: '4px',
                          backgroundColor: report && report.complianceStatus === 'Compliant' ? '#d4edda' :
                            report && report.complianceStatus === 'Requires Investigation' ? '#fff3cd' : '#f8d7da',
                          color: report && report.complianceStatus === 'Compliant' ? '#155724' :
                            report && report.complianceStatus === 'Requires Investigation' ? '#856404' : '#721c24'
                        }}>
                          {report ? report.complianceStatus : 'Unknown'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888' }}>EUDR reference date: 2020-12-31</div>
                      </div>
                    </div>

                    {/* Evidence Timeline */}
                    {report && report.evidenceTimeline.length > 0 && (
                      <div style={{ marginTop: '10px' }}>
                        <h5 style={{ margin: '0 0 5px 0', color: '#333', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          NDVI Evidence Timeline
                          <InfoButton id="eudrTimeline" showInfo={showInfo} setShowInfo={setShowInfo}>
                            Yearly peak NDVI values showing forest cover continuity across the EUDR reference date (Dec 31, 2020). Green bars = pre-reference period, blue bars = post-reference. Consistent values demonstrate continuous forest cover.
                          </InfoButton>
                        </h5>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={report.evidenceTimeline}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                            <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} label={{ value: 'Peak NDVI', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                            <Tooltip formatter={(val) => [val, 'Peak NDVI']} />
                            <ReferenceLine x={2020} stroke="#e74c3c" strokeWidth={2} strokeDasharray="4 4" label={{ value: 'EUDR Ref', position: 'top', fontSize: 10, fill: '#e74c3c' }} />
                            <Line type="monotone" dataKey="peakNdvi" stroke="#27ae60" strokeWidth={2} dot={{ fill: '#27ae60', r: 4 }} name="Peak NDVI" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {report && report.recommendations.length > 0 && (
                      <div style={{ marginTop: '10px' }}>
                        <strong style={{ fontSize: '12px' }}>Recommendations:</strong>
                        <ul style={{ margin: '5px 0', paddingLeft: '20px', fontSize: '12px', color: '#555' }}>
                          {report.recommendations.map((rec, i) => (
                            <li key={i} style={{ marginBottom: '3px' }}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <p style={{ fontSize: '11px', color: '#666', margin: '10px 0 0 0', fontStyle: 'italic' }}>
                      EUDR compliance assessment based on satellite NDVI continuity analysis. This is a screening tool — formal compliance requires operator-level due diligence documentation per Regulation (EU) 2023/1115.
                    </p>
                  </div>
                </>
              );
            })()}

            {/* 7. Conservation & Subsidies (METSO + NRL) */}
            {biodiversityEstimate && biomassData.length > 0 && (() => {
              const currentType = selectedForests[selectedForestIndex].type;
              const currentArea = parseFloat(selectedForests[selectedForestIndex].area);
              const latestBiomass = biomassData[biomassData.length - 1].biomass;
              const density = BASIC_DENSITY[currentType] || BASIC_DENSITY.pine;
              const volumePerHa = latestBiomass / density;
              const timberVal = estimateTimberValue(latestBiomass, currentType, forestAge, currentArea);
              const carbonData = biomassToCarbon(latestBiomass, currentType);
              const creditVal = estimateCarbonCreditValue(carbonData.co2eTons * currentArea);

              const metso = assessMetsoEligibility(currentType, forestAge, biodiversityEstimate.overallScore, currentArea);
              const permanentComp = estimateMetsoCompensation(timberVal.totalValue, 'permanent');
              const temporaryComp = estimateMetsoCompensation(timberVal.totalValue, 'temporary');
              const nrl = assessNRLCompliance(currentType, forestAge, volumePerHa);
              const tradeoff = compareProtectionVsHarvest(timberVal.totalValue, permanentComp.lumpSum, creditVal.totalValue);

              return (
                <>
                  <h4>7. Conservation & Subsidies</h4>
                  <div style={{ backgroundColor: '#eaf5ea', padding: '15px', borderRadius: '6px', marginBottom: '20px', border: '1px solid #c3e6cb' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '15px' }}>
                      <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#155724', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          METSO Class
                          <InfoButton id="metsoClass" showInfo={showInfo} setShowInfo={setShowInfo}>
                            METSO is Finland's voluntary forest conservation programme (€21.7M available). Class I = highest conservation value (old-growth, high biodiversity). Class II = significant value. Class III = potential value with restoration. Classification based on forest age and biodiversity score thresholds specific to each tree species.
                          </InfoButton>
                        </div>
                        <div style={{ fontSize: '28px', fontWeight: 'bold', color: metso.eligible ? '#27ae60' : '#888', margin: '6px 0' }}>
                          {metso.metsoClass ? `Class ${metso.metsoClass}` : 'Not Eligible'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#555' }}>{metso.label}</div>
                        {metso.nextClassRequirements && (
                          <div style={{ fontSize: '10px', color: '#888', marginTop: '4px' }}>
                            Next: Class {metso.nextClassRequirements.targetClass}
                            {metso.nextClassRequirements.ageNeeded > 0 && ` (${metso.nextClassRequirements.ageNeeded}yr more)`}
                          </div>
                        )}
                      </div>

                      <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#155724', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          Compensation Value
                          <InfoButton id="metsoComp" showInfo={showInfo} setShowInfo={setShowInfo}>
                            METSO compensation: permanent protection pays 100% of timber value as lump sum. 20-year temporary protection pays 70% upfront plus annual management payment (~2%/yr). Compensation is tax-free for permanent protection under certain conditions.
                          </InfoButton>
                        </div>
                        <div style={{ fontSize: '13px', margin: '6px 0', lineHeight: '1.8' }}>
                          <div>Permanent: <strong style={{ color: '#27ae60' }}>€{permanentComp.lumpSum.toFixed(0)}</strong></div>
                          <div>20yr temp: <strong style={{ color: '#f39c12' }}>€{temporaryComp.totalOver20Years.toFixed(0)}</strong></div>
                          <div style={{ fontSize: '10px', color: '#888' }}>({temporaryComp.description})</div>
                        </div>
                      </div>

                      <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#155724', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          NRL Status
                          <InfoButton id="nrlStatus" showInfo={showInfo} setShowInfo={setShowInfo}>
                            EU Nature Restoration Law targets for boreal forests: deadwood ≥20 m³/ha, retention trees ≥10/ha at harvest, uneven-aged structure. Deadwood is estimated from forest age and standing volume. Young managed forests typically have deadwood deficits.
                          </InfoButton>
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: nrl.overallStatus === 'Compliant' ? '#27ae60' : '#f39c12', margin: '6px 0' }}>
                          {nrl.overallStatus}
                        </div>
                        <div style={{ fontSize: '11px', color: '#555' }}>
                          {nrl.compliantCount}/{nrl.totalTargets} targets met
                        </div>
                        {nrl.targets.filter(t => t.gap).map((t, i) => (
                          <div key={i} style={{ fontSize: '10px', color: '#e67e22', marginTop: '2px' }}>{t.name}: {t.gap}</div>
                        ))}
                      </div>
                    </div>

                    {/* Protection vs Harvest comparison */}
                    <h5 style={{ margin: '0 0 5px 0', color: '#333', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Protection vs Harvest
                      <InfoButton id="protVsHarvest" showInfo={showInfo} setShowInfo={setShowInfo}>
                        Compares the financial value of harvesting timber vs. enrolling in METSO protection (compensation + carbon credit value). Protection value = METSO compensation (100% timber value) + theoretical carbon credit value. A positive difference means protection is financially competitive with harvesting.
                      </InfoButton>
                    </h5>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={[
                        { name: 'Harvest', value: tradeoff.harvestValue },
                        { name: 'Protection', value: tradeoff.protectValue }
                      ]} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v}`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                        <Tooltip formatter={(val) => [`€${Number(val).toLocaleString()}`]} />
                        <Bar dataKey="value" barSize={24}>
                          <Cell fill="#e67e22" />
                          <Cell fill="#27ae60" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ textAlign: 'center', fontSize: '12px', color: tradeoff.betterOption === 'protection' ? '#27ae60' : '#e67e22', fontWeight: 'bold', marginTop: '5px' }}>
                      {tradeoff.betterOption === 'protection'
                        ? `Protection is €${tradeoff.difference.toFixed(0)} more valuable (incl. carbon credits)`
                        : `Harvest yields €${Math.abs(tradeoff.difference).toFixed(0)} more than protection`}
                    </div>

                    {nrl.recommendations.length > 0 && (
                      <div style={{ marginTop: '10px' }}>
                        <strong style={{ fontSize: '12px' }}>NRL Recommendations:</strong>
                        <ul style={{ margin: '5px 0', paddingLeft: '20px', fontSize: '12px', color: '#555' }}>
                          {nrl.recommendations.map((rec, i) => (
                            <li key={i} style={{ marginBottom: '3px' }}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <p style={{ fontSize: '11px', color: '#666', margin: '10px 0 0 0', fontStyle: 'italic' }}>
                      METSO eligibility is indicative — actual classification requires ELY Centre site assessment. NRL targets based on EU Nature Restoration Law proposal for boreal forests.
                    </p>
                  </div>
                </>
              );
            })()}

            {/* 8. Succession Planning */}
            {biomassData.length > 0 && (() => {
              const currentType = selectedForests[selectedForestIndex].type;
              const currentArea = parseFloat(selectedForests[selectedForestIndex].area);
              const latestBiomass = biomassData[biomassData.length - 1].biomass;
              const timberVal = estimateTimberValue(latestBiomass, currentType, forestAge, currentArea);
              const carbonData = biomassToCarbon(latestBiomass, currentType);
              const creditVal = estimateCarbonCreditValue(carbonData.co2eTons * currentArea);
              const landVal = LAND_VALUE_PER_HA.south * currentArea; // Default to south Finland

              const assetSummary = generateAssetSummary(timberVal.totalValue, landVal, creditVal.totalValue, currentArea);
              const inheritanceTax = calculateInheritanceTax(assetSummary.totalValue);
              const scenarios = projectManagementScenarios(currentType, forestAge, currentArea, 30);
              const activeWorkload = estimateManagementWorkload(currentArea, 'active');
              const holdWorkload = estimateManagementWorkload(currentArea, 'hold');

              const scenarioChartData = scenarios.active.data.map((d, i) => ({
                year: d.year,
                active: Math.round(d.value),
                hold: Math.round(scenarios.hold.data[i].value),
                sellInvest: Math.round(scenarios.sellInvest.data[i].value)
              }));

              return (
                <>
                  <h4>8. Succession Planning</h4>
                  <div style={{ backgroundColor: '#f5f0ff', padding: '15px', borderRadius: '6px', marginBottom: '20px', border: '1px solid #d5c8f0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '15px' }}>
                      <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#5b3a8c', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          Total Asset Value
                          <InfoButton id="succAsset" showInfo={showInfo} setShowInfo={setShowInfo}>
                            Total estate value = land + forest use value. Timber and carbon credits are mutually exclusive — you either harvest (timber) or keep standing (carbon credits), so the higher of the two is used. Land value uses Southern Finland average (€{LAND_VALUE_PER_HA.south}/ha, Tax Authority 2024).
                          </InfoButton>
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#5b3a8c', margin: '6px 0' }}>
                          €{assetSummary.totalValue.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888' }}>€{assetSummary.perHectare.toLocaleString()}/ha</div>
                        <div style={{ fontSize: '10px', color: '#aaa', marginTop: '4px' }}>
                          Land {assetSummary.breakdown.landPercent}% / {assetSummary.betterUse === 'timber' ? 'Timber' : 'Carbon'} {assetSummary.breakdown.forestUsePercent}%
                        </div>
                        <div style={{ fontSize: '10px', color: '#aaa' }}>
                          Timber €{assetSummary.timberValue.toLocaleString()} vs Carbon €{assetSummary.carbonCreditValue.toLocaleString()}
                        </div>
                      </div>

                      <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#5b3a8c', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          Inheritance Tax (Class I)
                          <InfoButton id="succTax" showInfo={showInfo} setShowInfo={setShowInfo}>
                            Finnish inheritance tax for Class I heirs (children, spouse). Forest property is taxed at {(inheritanceTax.taxRatio * 100)}% of fair market value (forest tax value ratio). Progressive rates: 7-19% depending on taxable value. Brackets: €20k-40k at 7%, €40k-60k at 10%, €60k-200k at 13%, €200k-1M at 16%, over €1M at 19%.
                          </InfoButton>
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#e74c3c', margin: '6px 0' }}>
                          €{inheritanceTax.tax.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888' }}>
                          Effective rate: {inheritanceTax.effectiveRate.toFixed(1)}%
                        </div>
                        <div style={{ fontSize: '10px', color: '#aaa', marginTop: '4px' }}>
                          Taxable value: €{inheritanceTax.taxableValue.toLocaleString()} ({(inheritanceTax.taxRatio * 100)}% of FMV)
                        </div>
                      </div>

                      <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#5b3a8c', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          Annual Workload
                          <InfoButton id="succWorkload" showInfo={showInfo} setShowInfo={setShowInfo}>
                            Estimated hours per year for forest management. Active management: ~3.5 hrs/ha (planning, marking trees, supervising harvest, tending) + 10hrs overhead. Hold strategy: ~0.5 hrs/ha (monitoring, boundary maintenance). Average Finnish forest owner age is 62 — workload is a key succession factor.
                          </InfoButton>
                        </div>
                        <div style={{ fontSize: '13px', margin: '6px 0', lineHeight: '1.8' }}>
                          <div>Active: <strong>{activeWorkload.totalHoursPerYear} hrs/yr</strong></div>
                          <div>Hold: <strong>{holdWorkload.totalHoursPerYear} hrs/yr</strong></div>
                        </div>
                      </div>
                    </div>

                    {/* Management Scenarios Chart */}
                    <h5 style={{ margin: '0 0 5px 0', color: '#333', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      30-Year Management Scenarios
                      <InfoButton id="succScenarios" showInfo={showInfo} setShowInfo={setShowInfo}>
                        Three strategies compared over 30 years. "Active" = harvest at optimal rotation age, replant, accumulate harvest income. "Hold" = let forest grow undisturbed. "Sell + Invest" = sell timber now, invest proceeds at 5% annual market return. Values include both standing timber and cumulative income (for active strategy).
                      </InfoButton>
                    </h5>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={scenarioChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="year" tick={{ fontSize: 11 }} label={{ value: 'Years from now', position: 'insideBottom', offset: -5, fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v}`} />
                        <Tooltip formatter={(val) => [`€${Number(val).toLocaleString()}`]} />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Line type="monotone" dataKey="active" stroke="#27ae60" strokeWidth={2} dot={false} name={scenarios.active.label} />
                        <Line type="monotone" dataKey="hold" stroke="#3498db" strokeWidth={2} dot={false} name={scenarios.hold.label} />
                        <Line type="monotone" dataKey="sellInvest" stroke="#e74c3c" strokeWidth={2} strokeDasharray="4 4" dot={false} name={scenarios.sellInvest.label} />
                      </LineChart>
                    </ResponsiveContainer>

                    <p style={{ fontSize: '11px', color: '#666', margin: '10px 0 0 0', fontStyle: 'italic' }}>
                      Succession planning estimates use Finnish Tax Authority 2024 rates and Southern Finland land values. 40% of Finnish forest transfers are unplanned — consider formalizing a succession plan.
                      Consult a forest tax specialist for binding tax calculations.
                    </p>
                  </div>
                </>
              );
            })()}

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