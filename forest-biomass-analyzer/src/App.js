import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MapContainer, TileLayer, FeatureGroup, Polygon, useMap, Tooltip as LeafletTooltip } from 'react-leaflet';
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
import { estimateForestAge } from './ageEstimation';
import { useAuth } from './AuthContext';
import { useCheckout } from './useCheckout';
import LandingPage from './LandingPage';
import Login from './Login';
import UpgradeBanner from './UpgradeBanner';
import api from './api';
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
        border: '1.5px solid #6b7280', color: '#6b7280', fontSize: '12px',
        fontWeight: 'bold', fontStyle: 'italic', fontFamily: 'Georgia, serif',
        cursor: 'pointer', userSelect: 'none'
      }}
      title="How is this calculated?"
    >i</span>
    {showInfo[id] && (
      <div data-pdf-exclude style={{
        marginTop: '8px', fontSize: '11px', color: '#555', lineHeight: '1.6',
        backgroundColor: '#f3f4f6', padding: '10px', borderRadius: '4px',
        position: 'relative'
      }}>
        <span
          onClick={() => setShowInfo(prev => ({ ...prev, [id]: false }))}
          style={{ position: 'absolute', top: '4px', right: '8px', cursor: 'pointer', fontSize: '14px', color: '#6b7280' }}
        >&times;</span>
        {children}
      </div>
    )}
  </span>
);

const forestTypeNames = { pine: 'Pine', fir: 'Spruce', birch: 'Birch', aspen: 'Aspen' };

const colors = {
  darkGreen: '#1a472a',
  medGreen: '#2d6a4f',
  lightGreen: '#40916c',
  paleGreen: '#b7e4c7',
  offWhite: '#f5f7f5',
  white: '#ffffff',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray500: '#6b7280',
  gray700: '#374151',
  gray900: '#111827',
};

const dashFontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const ForestBiomassApp = () => {
  const { user, logout, refreshUser } = useAuth();
  const { startCheckout, loading: checkoutLoading } = useCheckout();
  const isDemo = !user || user.plan === 'free';
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState('');
  const [selectedForests, setSelectedForests] = useState([]);
  const [forestType, setForestType] = useState('pine');
  const [forestAge, setForestAge] = useState(20);
  const [biomassData, setBiomassData] = useState([]);
  const [selectedForestIndex, setSelectedForestIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processingStatus, setProcessingStatus] = useState('');
  const mapRef = useRef();
  const [showInstructions, setShowInstructions] = useState(false);
  const [showDocumentation, setShowDocumentation] = useState(false);
  const [treeEstimate, setTreeEstimate] = useState(null);
  const [healthEstimate, setHealthEstimate] = useState(null);
  const [biodiversityEstimate, setBiodiversityEstimate] = useState(null);
  const [showInfo, setShowInfo] = useState({});
  const [estimateAgeMode, setEstimateAgeMode] = useState(false);
  const [ageEstimate, setAgeEstimate] = useState(null);
  const [savedForests, setSavedForests] = useState([]);
  const [showSavedForests, setShowSavedForests] = useState(false);
  const [savingForest, setSavingForest] = useState(false);
  const [loadedForestId, setLoadedForestId] = useState(null);
  const abortControllerRef = useRef(null);

  // Fetch saved forests for Pro/Business users
  const fetchSavedForests = useCallback(async () => {
    if (isDemo) return;
    try {
      const data = await api.get('/api/forests');
      setSavedForests(data.forests);
    } catch (err) {
      console.error('Failed to fetch saved forests:', err);
    }
  }, [isDemo]);

  useEffect(() => {
    fetchSavedForests().then(() => {
      // Auto-fly handled in separate effect watching savedForests
    });
  }, [fetchSavedForests]);

  // Auto-fly to user's saved forests on initial load
  const hasFlewToForests = React.useRef(false);
  useEffect(() => {
    if (hasFlewToForests.current || !savedForests.length || !mapRef.current) return;
    hasFlewToForests.current = true;
    try {
      const allCoords = [];
      savedForests.forEach(f => {
        if (f.polygon_geojson) {
          const geojson = typeof f.polygon_geojson === 'string' ? JSON.parse(f.polygon_geojson) : f.polygon_geojson;
          if (geojson.coordinates && geojson.coordinates[0]) {
            geojson.coordinates[0].forEach(coord => {
              // GeoJSON is [lng, lat], Leaflet needs [lat, lng]
              allCoords.push([coord[1], coord[0]]);
            });
          }
        }
      });
      if (allCoords.length > 0) {
        const bounds = L.latLngBounds(allCoords);
        setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.flyToBounds(bounds, { padding: [50, 50], maxZoom: 14 });
          }
        }, 300);
      }
    } catch (err) {
      console.error('Failed to fly to saved forests:', err);
    }
  }, [savedForests]);

  // Handle post-checkout success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('status') === 'success') {
      setCheckoutSuccess(true);
      refreshUser();
      window.history.replaceState({}, '', '/app');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openBillingPortal = async () => {
    setBillingLoading(true);
    try {
      const data = await api.post('/api/stripe/create-portal-session', {});
      window.location.href = data.url;
    } catch (err) {
      alert('Failed to open billing portal: ' + err.message);
      setBillingLoading(false);
    }
  };

  // Save the current forest (with or without analysis)
  const saveCurrentForest = async () => {
    if (!selectedForests.length) return;
    const forest = selectedForests[selectedForestIndex];
    const defaultName = `${forestTypeNames[forestType] || forestType} Forest – ${forest.area}ha`;
    const name = window.prompt('Name this forest:', defaultName);
    if (!name) return;

    setSavingForest(true);
    try {
      // Convert Leaflet [lat,lng] → GeoJSON [lng,lat] and close ring
      const coords = forest.coords.map(c => [c[1], c[0]]);
      if (coords.length > 0 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
        coords.push(coords[0]);
      }
      const polygon_geojson = { type: 'Polygon', coordinates: [coords] };

      const result = await api.post('/api/forests', {
        name,
        polygon_geojson,
        forest_type: forestType,
        forest_age: forestAge,
        area_hectares: parseFloat(forest.area),
      });

      // Save analysis data if available
      if (biomassData.length > 0) {
        await api.post(`/api/forests/${result.forest.id}/analyses`, {
          biomass_data_json: biomassData,
        });
      }

      // Update the current forest's name in state
      setSelectedForests(prev => {
        const updated = [...prev];
        updated[selectedForestIndex] = { ...updated[selectedForestIndex], name };
        return updated;
      });
      setLoadedForestId(result.forest.id);

      await fetchSavedForests();
      setShowSavedForests(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingForest(false);
    }
  };

  // Load a saved forest and its analysis
  const loadSavedForest = async (forestId) => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get(`/api/forests/${forestId}`);
      const forest = data.forest;
      const geojson = typeof forest.polygon_geojson === 'string' ? JSON.parse(forest.polygon_geojson) : forest.polygon_geojson;
      const coords = geojson.coordinates[0].map(c => [c[1], c[0]]);

      setSelectedForests([{
        id: Date.now(),
        coords,
        area: (forest.area_hectares || 0).toFixed(2),
        type: forest.forest_type,
        name: forest.name,
      }]);
      setSelectedForestIndex(0);
      setForestType(forest.forest_type || 'pine');
      setForestAge(forest.forest_age || 20);
      setLoadedForestId(forestId);

      if (data.analysis && data.analysis.biomass_data) {
        const finalResults = data.analysis.biomass_data;
        setBiomassData(finalResults);

        const latestNdviValues = finalResults.slice(-5).map(d => d.ndvi);
        const area = forest.area_hectares || 0;
        const type = forest.forest_type || 'pine';
        const age = forest.forest_age || 20;

        const treeEst = estimateTreeCount(latestNdviValues, type, age, area);
        setTreeEstimate(treeEst);

        const healthResult = analyzeForestHealth(finalResults, type, age);
        setHealthEstimate(healthResult);

        const bioEst = estimateBiodiversity(finalResults, treeEst, healthResult, type, age, area);
        setBiodiversityEstimate(bioEst);
      } else {
        setBiomassData([]);
        setTreeEstimate(null);
        setHealthEstimate(null);
        setBiodiversityEstimate(null);
      }

      setAgeEstimate(null);
      setEstimateAgeMode(false);

      // Fly map to loaded polygon
      if (mapRef.current) {
        const bounds = L.latLngBounds(coords);
        mapRef.current.flyToBounds(bounds, { padding: [50, 50] });
      }
    } catch (err) {
      setError(`Failed to load forest: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Delete a saved forest
  const deleteSavedForest = async (forestId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this saved forest?')) return;
    try {
      await api.del(`/api/forests/${forestId}`);
      setSavedForests(prev => prev.filter(f => f.id !== forestId));
      if (loadedForestId === forestId) {
        setLoadedForestId(null);
      }
    } catch (err) {
      setError(`Failed to delete forest: ${err.message}`);
    }
  };

  // Load GeometryUtil and GeoTIFF on mount
  useEffect(() => {
    Promise.all([loadGeometryUtil(), loadGeoTIFF()]).then(() => {
      // Libraries loaded
    });
  }, []);

  // Fetch NDVI data using Process API - FIXED VERSION with GeoTIFF.js
  const fetchNDVIData = async (polygon, dateFrom, dateTo, { signal } = {}) => {
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
      const response = await api.postRaw('/api/sentinel/process', JSON.stringify(processRequest), {
        'Content-Type': 'application/json',
        'Accept': 'image/tiff'
      }, { signal });

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
  const fetchAvailableDates = async (bbox, dateFrom, dateTo, { signal } = {}) => {
    const catalogRequest = {
      bbox: bbox,
      datetime: `${dateFrom}T00:00:00Z/${dateTo}T23:59:59Z`,
      collections: ["sentinel-2-l2a"],
      limit: 100,
      filter: "eo:cloud_cover < 30"
    };

    try {
      const data = await api.post('/api/sentinel/catalog', catalogRequest, { signal });

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
      if (error.name === 'AbortError' || (error.message && error.message.includes('limit'))) {
        throw error;
      }
      return [];
    }
  };

  // Load demo data for free tier users
  const loadDemoData = async () => {
    setLoading(true);
    setError(null);
    setProcessingStatus('Loading demo data...');
    try {
      const data = await api.get('/api/sample-data/forest');
      const demo = data;

      // Set forest from demo data
      setSelectedForests([{
        id: Date.now(),
        coords: demo.forest.polygon.coordinates[0].map(c => [c[1], c[0]]),
        area: demo.forest.area_hectares.toFixed(2),
        type: demo.forest.type
      }]);
      setSelectedForestIndex(0);
      setForestType(demo.forest.type);
      setForestAge(demo.forest.age);

      // Process demo biomass data
      let results = demo.biomassData;

      // Age estimation from NDVI trend (if enabled)
      if (estimateAgeMode) {
        const ageResult = estimateForestAge(results, demo.forest.type);
        if (ageResult) {
          setAgeEstimate(ageResult);
          setForestAge(ageResult.estimatedAge);
          const correctedAgeStart = ageResult.estimatedAge - 10;
          for (const r of results) {
            r.biomass = estimateBiomass(r.ndvi, demo.forest.type, r.yearsFromStart, correctedAgeStart);
            r.forestAge = correctedAgeStart + r.yearsFromStart;
          }
        } else {
          setAgeEstimate(null);
          setEstimateAgeMode(false);
        }
      }

      let withRolling = calculateRollingAverage(results, 'biomass', 7);
      withRolling = calculateRollingAverage(withRolling, 'ndvi', 7);
      withRolling = calculateRollingAverage(withRolling, 'ndmi', 7);
      const finalResults = calculateRollingAverage(withRolling, 'ndre', 7);
      setBiomassData(finalResults);

      // Run analysis modules on demo data
      const latestResult = finalResults[finalResults.length - 1];
      const latestNdviValues = finalResults.slice(-5).map(d => d.ndvi);

      const treeEst = estimateTreeCount(latestNdviValues, demo.forest.type, latestResult.forestAge, demo.forest.area_hectares);
      setTreeEstimate(treeEst);

      const healthResult = analyzeForestHealth(finalResults, demo.forest.type, demo.forest.age);
      setHealthEstimate(healthResult);

      const bioEst = estimateBiodiversity(finalResults, treeEst, healthResult, demo.forest.type, demo.forest.age, demo.forest.area_hectares);
      setBiodiversityEstimate(bioEst);
      setProcessingStatus('');
    } catch (err) {
      setError(`Failed to load demo data: ${err.message}`);
    } finally {
      setLoading(false);
      setProcessingStatus('');
    }
  };

  // Process satellite data using Process API with daily acquisitions
  const fetchSatelliteData = async () => {
    if (selectedForests.length === 0) {
      setError('Draw at least one forest polygon');
      return;
    }

    if (isDemo) {
      setError('Upgrade to Pro to analyze your own forests with real satellite data.');
      return;
    }

    if (selectedForestIndex >= selectedForests.length) {
      setError('Invalid forest selection');
      return;
    }

    // Abort any previous processing
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

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
      const ageAtAnalysisStart = (estimateAgeMode ? 40 : forestAge) - 10;

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

        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        setProcessingStatus(`Fetching available dates for ${year} summer...`);

        // Get available acquisition dates from Catalog API
        const availableDates = await fetchAvailableDates(bbox, dateFrom, dateTo, { signal });

        // Process each available date
        for (let i = 0; i < availableDates.length; i++) {
          const acquisitionDate = availableDates[i];
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          setProcessingStatus(`Processing ${acquisitionDate} (${i + 1}/${availableDates.length} for ${year})...`);

          try {
            // Fetch NDVI data for specific date with tight time window
            const dateTime = new Date(acquisitionDate);
            const nextDay = new Date(dateTime);
            nextDay.setDate(nextDay.getDate() + 1);

            const ndviStats = await fetchNDVIData(
              selectedForest,
              acquisitionDate,
              nextDay.toISOString().split('T')[0],
              { signal }
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
            if (dateError.name === 'AbortError' || (dateError.message && dateError.message.includes('limit'))) {
              throw dateError;
            }
            // Continue with next date on other errors
          }

          // Rate limiting - 500ms between requests
          await new Promise((resolve, reject) => {
            const tid = setTimeout(resolve, 500);
            signal.addEventListener('abort', () => { clearTimeout(tid); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
          });
        }

        // Longer delay between years
        await new Promise((resolve, reject) => {
          const tid = setTimeout(resolve, 2000);
          signal.addEventListener('abort', () => { clearTimeout(tid); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
        });
      }

      if (results.length === 0) {
        setError('No valid satellite data found. Please try a different location or check your API access.');
        return;
      }

      // Sort by date
      results.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Age estimation from NDVI trend (Pro & Business only)
      if (estimateAgeMode) {
        const ageResult = estimateForestAge(results, selectedForest.type);
        if (ageResult) {
          setAgeEstimate(ageResult);
          setForestAge(ageResult.estimatedAge);
          // Recompute biomass with corrected age
          const correctedAgeStart = ageResult.estimatedAge - 10;
          for (const r of results) {
            r.biomass = estimateBiomass(r.ndvi, selectedForest.type, r.yearsFromStart, correctedAgeStart);
            r.forestAge = correctedAgeStart + r.yearsFromStart;
          }
        } else {
          setAgeEstimate(null);
          setEstimateAgeMode(false);
        }
      }

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
      if (err.name === 'AbortError') {
        setProcessingStatus('');
        return;
      }
      setError(`Processing error: ${err.message}`);
    } finally {
      setLoading(false);
      setProcessingStatus('');
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  };

  const cancelProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
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
      setAgeEstimate(null);
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

  const exportToPdf = async () => {
    setExportingPdf(true);
    try {
      const { generatePdfReport } = await import('./pdfExport');
      await generatePdfReport({
        title: 'Forest Analysis Report',
        forestType: selectedForests[selectedForestIndex]?.type || forestType,
        forestAge,
        areaHectares: parseFloat(selectedForests[selectedForestIndex]?.area || 0),
        generatedDate: new Date().toISOString().slice(0, 10),
        onProgress: (msg, pct) => setPdfProgress(`${msg} (${Math.round(pct)}%)`)
      });
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExportingPdf(false);
      setPdfProgress('');
    }
  };

  const styles = {
    container: {
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '88px 24px 24px',
      fontFamily: dashFontFamily,
      backgroundColor: colors.offWhite,
      minHeight: '100vh'
    },
    header: {
      fontSize: '24px',
      fontWeight: 700,
      color: colors.darkGreen,
      marginBottom: '20px'
    },
    controls: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '15px',
      marginBottom: '20px',
      padding: '20px',
      backgroundColor: colors.white,
      borderRadius: '12px',
      border: `1px solid ${colors.gray200}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
    },
    input: {
      padding: '8px 12px',
      border: `1px solid ${colors.gray200}`,
      borderRadius: '8px',
      fontSize: '14px',
      width: '100%',
      boxSizing: 'border-box',
      color: colors.gray900
    },
    select: {
      padding: '8px 12px',
      border: `1px solid ${colors.gray200}`,
      borderRadius: '8px',
      fontSize: '14px',
      width: '100%',
      boxSizing: 'border-box',
      backgroundColor: colors.white,
      color: colors.gray900
    },
    label: {
      display: 'block',
      marginBottom: '5px',
      fontWeight: 600,
      fontSize: '13px',
      color: colors.gray700,
      textTransform: 'uppercase',
      letterSpacing: '0.025em'
    },
    button: {
      padding: '10px 20px',
      backgroundColor: colors.darkGreen,
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      fontSize: '15px',
      fontWeight: 600,
      cursor: 'pointer',
      marginTop: '20px'
    },
    buttonDisabled: {
      backgroundColor: colors.gray200,
      color: colors.gray500,
      cursor: 'not-allowed'
    },
    authSection: {
      backgroundColor: colors.white,
      padding: '20px',
      borderRadius: '12px',
      marginBottom: '20px',
      border: `1px solid ${colors.gray200}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
    },
    mapContainer: {
      height: '600px',
      marginBottom: '20px',
      borderRadius: '12px',
      overflow: 'hidden',
      border: `1px solid ${colors.gray200}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
    },
    chartContainer: {
      backgroundColor: colors.white,
      padding: '24px',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      marginBottom: '20px'
    },
    forestInfo: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
      gap: '15px',
      marginBottom: '20px'
    },
    infoCard: {
      backgroundColor: colors.white,
      padding: '15px',
      borderRadius: '12px',
      border: `1px solid ${colors.gray200}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
    },
    error: {
      backgroundColor: '#fef2f2',
      color: '#991b1b',
      padding: '12px 20px',
      borderRadius: '8px',
      marginBottom: '20px',
      border: '1px solid #fecaca'
    },
    warning: {
      backgroundColor: '#fffbeb',
      color: '#92400e',
      padding: '12px 20px',
      borderRadius: '8px',
      marginBottom: '20px',
      border: '1px solid #fde68a'
    },
    loading: {
      textAlign: 'center',
      padding: '40px',
      fontSize: '18px',
      color: colors.gray500
    },
    info: {
      backgroundColor: '#ecfdf5',
      color: colors.darkGreen,
      padding: '12px 20px',
      borderRadius: '8px',
      marginBottom: '20px',
      border: `1px solid ${colors.paleGreen}`
    },
    techDetails: {
      marginTop: '20px',
      padding: '15px',
      backgroundColor: colors.white,
      borderRadius: '12px',
      fontSize: '14px'
    },
    exportButton: {
      padding: '10px 20px',
      backgroundColor: colors.medGreen,
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      fontSize: '15px',
      fontWeight: 600,
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
      backgroundColor: '#fffbeb',
      padding: '10px',
      borderRadius: '8px',
      fontSize: '14px',
      color: '#92400e',
      marginTop: '10px'
    },
    codeBlock: {
      backgroundColor: colors.gray100,
      padding: '10px',
      borderRadius: '8px',
      fontSize: '12px',
      overflow: 'auto',
      fontFamily: 'monospace',
      border: `1px solid ${colors.gray200}`
    },
    dashNav: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.darkGreen,
      zIndex: 1000,
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
    },
    dashNavInner: {
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: '64px'
    },
    dashBrand: {
      fontSize: '20px',
      fontWeight: 700,
      color: colors.white,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      textDecoration: 'none'
    },
    dashNavRight: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px'
    },
    dashNavLink: {
      color: colors.paleGreen,
      fontSize: '14px',
      textDecoration: 'none',
      cursor: 'pointer',
      background: 'none',
      border: 'none',
      fontFamily: dashFontFamily
    },
    dashNavLogout: {
      color: colors.white,
      fontSize: '13px',
      fontWeight: 600,
      cursor: 'pointer',
      background: 'rgba(255,255,255,0.12)',
      border: 'none',
      borderRadius: '6px',
      padding: '6px 14px',
      fontFamily: dashFontFamily
    },
    moduleCard: {
      backgroundColor: colors.white,
      padding: '15px',
      borderRadius: '12px',
      marginBottom: '20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
    },
    moduleHeading: {
      fontSize: '16px',
      fontWeight: 700,
      color: colors.darkGreen,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      margin: '0 0 12px 0'
    },
    statCard: {
      backgroundColor: colors.gray100,
      padding: '12px',
      borderRadius: '10px',
      border: `1px solid ${colors.gray200}`,
      textAlign: 'center'
    },
    statLabel: {
      fontSize: '11px',
      color: colors.gray500,
      fontWeight: 600,
      textTransform: 'uppercase',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px'
    },
    statValue: {
      fontSize: '24px',
      fontWeight: 700,
      color: colors.darkGreen,
      margin: '6px 0'
    },
    moduleFootnote: {
      fontSize: '11px',
      color: colors.gray500,
      margin: '10px 0 0 0',
      fontStyle: 'italic'
    }
  };

  return (
    <>
      <nav style={styles.dashNav}>
        <div style={styles.dashNavInner}>
          <a href="/" style={styles.dashBrand}>{'\uD83C\uDF32'} ForestData</a>
          <div style={styles.dashNavRight}>
            <a href="/" style={styles.dashNavLink}>Home</a>
            {user && <>
              <span style={{ color: colors.paleGreen, fontSize: '13px' }}>{user.email}</span>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '3px 8px',
                borderRadius: '4px',
                letterSpacing: '0.5px',
                background: user.plan === 'business' ? 'rgba(251,191,36,0.2)' : user.plan === 'pro' ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.12)',
                color: user.plan === 'business' ? '#fbbf24' : user.plan === 'pro' ? '#60a5fa' : 'rgba(255,255,255,0.7)',
              }}>
                {user.plan === 'business' ? 'Business' : user.plan === 'pro' ? 'Pro' : 'Free'}
              </span>
              {user.plan !== 'business' && (
                <button
                  onClick={() => {
                    if (user.plan === 'pro') {
                      startCheckout('business');
                    } else {
                      window.location.href = '/#pricing';
                    }
                  }}
                  disabled={checkoutLoading}
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: '5px',
                    background: '#fbbf24',
                    color: colors.darkGreen,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: dashFontFamily,
                  }}>
                  {checkoutLoading ? 'Loading...' : user.plan === 'pro' ? 'Upgrade to Business' : 'Upgrade'}
                </button>
              )}
              {user.hasStripeCustomer && (
                <button
                  onClick={openBillingPortal}
                  disabled={billingLoading}
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: '5px',
                    background: 'rgba(255,255,255,0.15)',
                    color: 'rgba(255,255,255,0.9)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    cursor: 'pointer',
                    fontFamily: dashFontFamily,
                  }}>
                  {billingLoading ? 'Loading...' : 'Manage Billing'}
                </button>
              )}
              <button style={styles.dashNavLogout} onClick={logout}>Logout</button>
            </>}
          </div>
        </div>
      </nav>
      <div style={styles.container}>
      <h1 style={styles.header}>Forest Analysis Dashboard</h1>

      {checkoutSuccess && (
        <div style={{
          background: '#dcfce7',
          color: '#166534',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          fontSize: '14px',
          fontFamily: dashFontFamily,
          borderBottom: '1px solid #bbf7d0',
        }}>
          <span>Subscription activated! Your plan has been upgraded.</span>
          <button
            onClick={() => setCheckoutSuccess(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#166534',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
            type="button"
          >
            {'\u00D7'}
          </button>
        </div>
      )}
      {isDemo && <UpgradeBanner plan={user ? user.plan : null} />}

      {/* User Instructions Panel */}
      <div style={styles.authSection}>
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
              color: colors.lightGreen
            }}
            onClick={() => setShowInstructions(!showInstructions)}
          >
            {showInstructions ? '▼' : '▶'}
          </button>
        </div>
        
        {showInstructions && (
          <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
            <h4 style={{ marginTop: '15px', marginBottom: '10px', color: colors.medGreen }}>1. Getting Started</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>Free users:</strong> Click "Load Demo Analysis" to explore all analysis modules with a sample Finnish pine forest — no account required</li>
              <li><strong>Pro & Business users:</strong> Log in to access real Sentinel-2 satellite data, draw your own forest polygons, and save your forests</li>
            </ul>

            <h4 style={{ marginTop: '15px', marginBottom: '10px', color: colors.medGreen }}>2. Drawing Forest Polygons</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li>Click the polygon tool (pentagon icon) in the map's top-left control panel</li>
              <li>Click on the map to place vertices of your forest boundary</li>
              <li>Complete the polygon by clicking the first vertex again</li>
              <li>Draw multiple forests to compare — click each to select for analysis</li>
              <li>Use the trash icon to delete all polygons and start over</li>
              <li><strong>Important:</strong> Draw polygons over actual forested areas visible in satellite imagery for accurate results</li>
            </ul>

            <h4 style={{ marginTop: '15px', marginBottom: '10px', color: colors.medGreen }}>3. Forest Parameters</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>Forest Type:</strong> Select species (Pine, Spruce, Birch, Aspen) — affects growth curves and maximum biomass</li>
              <li><strong>Forest Age:</strong> Current age of the forest as of today. The app automatically calculates the age at the start of the 10-year analysis period</li>
              <li><strong>Age Estimation:</strong> Enable "Estimate age from NDVI" to let the app estimate forest age from the satellite data trend</li>
              <li><strong>Default Parameters Source:</strong> Growth models calibrated with data from <strong>Luke (Finnish Natural Resources Institute)</strong>:
                <ul style={{ marginTop: '5px' }}>
                  <li>Pine: Max 450 t/ha, growth rate 0.08/year, NDVI saturation 0.85</li>
                  <li>Spruce: Max 500 t/ha, growth rate 0.07/year, NDVI saturation 0.88</li>
                  <li>Birch: Max 300 t/ha, growth rate 0.12/year, NDVI saturation 0.82</li>
                  <li>Aspen: Max 250 t/ha, growth rate 0.15/year, NDVI saturation 0.80</li>
                </ul>
              </li>
            </ul>

            <h4 style={{ marginTop: '15px', marginBottom: '10px', color: colors.medGreen }}>4. Running Analysis</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li>Draw a polygon and click "Analyze with Sentinel-2 Process API" (Pro/Business) or "Load Demo Analysis" (Free)</li>
              <li>Processing retrieves all cloud-free Sentinel-2 acquisitions from summer months (June–August) for the past 10 years</li>
              <li>Each acquisition is processed individually (~500ms per image) — expect 3–10 minutes for full analysis</li>
              <li>Progress updates show current processing stage</li>
              <li><strong>Cancel:</strong> Click "Cancel" at any time to stop processing and keep any data already retrieved</li>
            </ul>

            <h4 style={{ marginTop: '15px', marginBottom: '10px', color: colors.medGreen }}>5. Saving & Loading Forests (Pro & Business)</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li>Draw a forest polygon and click "Save Forest" to save it (analysis is optional)</li>
              <li>Saved forests appear in the "My Saved Forests" panel and as blue dashed outlines on the map</li>
              <li>Click a saved forest card or its map outline to reload the forest and all its analysis data</li>
              <li>Pro users can save up to 10 forests; Business users have unlimited forests</li>
              <li>Delete a saved forest by clicking the &times; button on its card</li>
            </ul>

            <h4 style={{ marginTop: '15px', marginBottom: '10px', color: colors.medGreen }}>6. Interpreting Results</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>NDVI (Normalized Difference Vegetation Index):</strong>
                <ul>
                  <li>0.6–0.9: Healthy, dense forest vegetation</li>
                  <li>0.3–0.6: Moderate vegetation/young forest</li>
                  <li>0.1–0.3: Sparse vegetation/stressed forest</li>
                  <li>&lt;0.1: Non-vegetated/water/bare soil</li>
                </ul>
              </li>
              <li><strong>Biomass Estimates:</strong>
                <ul>
                  <li>Calculated using logistic growth model coupled with NDVI measurements</li>
                  <li>Units: tons/hectare (dry biomass)</li>
                  <li>Typical mature forest: 200–500 t/ha depending on species</li>
                  <li>Annual growth: 5–20 t/ha/year for healthy forests</li>
                </ul>
              </li>
              <li><strong>Chart Interpretation:</strong>
                <ul>
                  <li>Individual points: Daily satellite acquisitions (weather permitting)</li>
                  <li>Thick lines: 7-day rolling averages (smooths atmospheric noise)</li>
                  <li>Seasonal variations: Normal — highest NDVI/biomass in mid-summer</li>
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

            <h4 style={{ marginTop: '15px', marginBottom: '10px', color: colors.medGreen }}>7. Exporting Data</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>CSV Export:</strong> Available to all users — download the full time series for analysis in Excel, R, or Python</li>
              <li><strong>PDF Export:</strong> Business plan only — generate a comprehensive forest analysis report</li>
            </ul>

            <h4 style={{ marginTop: '15px', marginBottom: '10px', color: colors.medGreen }}>8. Troubleshooting</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>Low NDVI values:</strong> Verify polygon is over forested area, not water/urban/agricultural land</li>
              <li><strong>No data found:</strong> Area may have persistent cloud cover — try a different location</li>
              <li><strong>Rate limit errors:</strong> Pro users have 100 Sentinel requests/day, Business users have 500/day. Limit resets at midnight</li>
              <li><strong>Forest limit reached:</strong> Pro users can save up to 10 forests. Upgrade to Business for unlimited forests</li>
              <li><strong>Login issues:</strong> Clear your browser cookies and try again, or register a new account</li>
            </ul>
          </div>
        )}
      </div>

      {/* Technical Documentation Panel */}
      <div style={styles.authSection}>
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
              color: colors.lightGreen
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

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: colors.medGreen }}>1. Sentinel-2 Satellite & Spectral Bands</h3>
            
            <h4>What is Sentinel-2?</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li>European Space Agency (ESA) satellite constellation (2 satellites: Sentinel-2A and 2B)</li>
              <li><strong>Revisit time</strong>: 5 days at equator, 2-3 days at mid-latitudes</li>
              <li><strong>Spatial resolution</strong>: 10m for key bands (B02, B03, B04, B08)</li>
              <li><strong>Swath width</strong>: 290 km</li>
            </ul>

            <h4>Key Spectral Bands Used:</h4>
            <pre style={styles.codeBlock}>
{`B04 (Red):  665 nm - 10m resolution — chlorophyll absorption
B05 (Red Edge): 705 nm - 20m resolution — chlorophyll density
B08 (NIR):  842 nm - 10m resolution — canopy structure
B11 (SWIR): 1610 nm - 20m resolution — canopy water content
SCL (Scene Classification Layer): Cloud/snow/water mask - 20m resolution`}
            </pre>

            <h4>Why These Bands?</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>Red (B04)</strong>: Absorbed by chlorophyll — forms NDVI with NIR</li>
              <li><strong>Red Edge (B05)</strong>: Sensitive to chlorophyll density — forms NDRE with NIR</li>
              <li><strong>NIR (B08)</strong>: Strongly reflected by healthy vegetation's cellular structure</li>
              <li><strong>SWIR (B11)</strong>: Sensitive to canopy water content — forms NDMI with NIR</li>
            </ul>

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: colors.medGreen }}>2. NDVI (Normalized Difference Vegetation Index)</h3>
            
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

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: colors.medGreen }}>3. Data Acquisition Pipeline</h3>

            <h4>Authentication:</h4>
            <p>Sentinel Hub credentials are managed server-side. The backend authenticates with the Copernicus Data Space using OAuth2 client credentials and caches the access token. Users authenticate with ForestData via email/password login (JWT stored in httpOnly cookies).</p>

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

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: colors.medGreen }}>4. Cloud Masking with Scene Classification Layer (SCL)</h3>

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

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: colors.medGreen }}>5. Biomass Estimation Model</h3>

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
Spruce: Max 500 t/ha, growth rate 0.07/year, NDVI saturation 0.88
Birch: Max 300 t/ha, growth rate 0.12/year, NDVI saturation 0.82
Aspen: Max 250 t/ha, growth rate 0.15/year, NDVI saturation 0.80`}
            </pre>

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: colors.medGreen }}>6. Time Series Processing</h3>

            <h4>Data Collection Strategy:</h4>
            <ul style={{ marginLeft: '20px' }}>
              <li><strong>Temporal range</strong>: Last 10 years of summer data</li>
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

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: colors.medGreen }}>7. GeoTIFF Processing</h3>

            <p>The app receives NDVI data as 32-bit floating-point GeoTIFF:</p>

            <pre style={styles.codeBlock}>
{`// GeoTIFF structure:
- Format: 3-band FLOAT32 (NDVI, NDMI, NDRE)
- Compression: DEFLATE/LZW
- Values: -1.0 to 1.0 per band
- NoData: NaN (masked pixels)

// Processing with GeoTIFF.js:
const tiff = await GeoTIFF.fromArrayBuffer(response);
const rasters = await image.readRasters();
const ndviArray = rasters[0];   // Float32Array
const ndmiArray = rasters[1];   // Moisture index
const ndreArray = rasters[2];   // Red edge index`}
            </pre>

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: colors.medGreen }}>8. Key Technical Features</h3>

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

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: colors.medGreen }}>9. Common Customer Questions & Answers</h3>

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

            <h3 style={{ marginTop: '20px', marginBottom: '10px', color: colors.medGreen }}>10. Data Validation & Error Handling</h3>

            <p>The system includes multiple validation layers:</p>
            <ul style={{ marginLeft: '20px' }}>
              <li>Coordinate boundary checking</li>
              <li>NDVI range validation (-1 to 1)</li>
              <li>Cloud coverage thresholds</li>
              <li>Minimum valid pixel requirements</li>
              <li>Rate limit monitoring (per-user daily quotas)</li>
            </ul>

            <p style={{ marginTop: '20px', padding: '10px', backgroundColor: '#ecfdf5', borderRadius: '4px' }}>
              This comprehensive system provides scientifically-grounded forest monitoring using ESA Sentinel-2 satellite data with regular updates every few days during growing season.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div style={error.includes('Warning') ? styles.warning : styles.error}>
          <strong>{error.includes('Warning') ? 'Warning:' : 'Error:'}</strong> {error}
        </div>
      )}

      <div style={styles.controls}>
        <div>
          <label style={styles.label}>Forest Type</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {[
              { value: 'pine', name: 'Pine',
                icon: <svg viewBox="0 0 40 48" width="32" height="38" style={{display:'block',margin:'0 auto'}}>
                  {/* Trunk — tall, straight, reddish-brown */}
                  <rect x="18" y="18" width="4" height="28" rx="1" fill="#8B5E3C"/>
                  <line x1="19" y1="20" x2="19" y2="46" stroke="#6B4226" strokeWidth="0.5" opacity="0.4"/>
                  {/* Crown — sparse, rounded, high on trunk (characteristic pine shape) */}
                  <ellipse cx="20" cy="10" rx="11" ry="9" fill="#2d6a4f"/>
                  <ellipse cx="20" cy="10" rx="11" ry="9" fill="none" stroke="#1a472a" strokeWidth="0.6"/>
                  {/* Needle texture — short radiating strokes */}
                  <g stroke="#40916c" strokeWidth="0.7" opacity="0.7">
                    <line x1="14" y1="7" x2="11" y2="5"/><line x1="16" y1="5" x2="14" y2="3"/>
                    <line x1="20" y1="3" x2="20" y2="1"/><line x1="24" y1="5" x2="26" y2="3"/>
                    <line x1="26" y1="7" x2="29" y2="5"/><line x1="28" y1="11" x2="31" y2="10"/>
                    <line x1="12" y1="11" x2="9" y2="10"/><line x1="13" y1="14" x2="10" y2="14"/>
                    <line x1="27" y1="14" x2="30" y2="14"/>
                  </g>
                  {/* Subtle inner shadow for depth */}
                  <ellipse cx="18" cy="11" rx="5" ry="4" fill="#1a472a" opacity="0.15"/>
                </svg>
              },
              { value: 'fir', name: 'Spruce',
                icon: <svg viewBox="0 0 40 48" width="32" height="38" style={{display:'block',margin:'0 auto'}}>
                  {/* Trunk */}
                  <rect x="18.5" y="36" width="3" height="10" rx="0.8" fill="#6B4226"/>
                  {/* Classic conical spruce — layered triangles */}
                  <polygon points="20,2 12,16 28,16" fill="#2d6a4f"/>
                  <polygon points="20,10 10,24 30,24" fill="#40916c"/>
                  <polygon points="20,18 8,34 32,34" fill="#2d6a4f"/>
                  {/* Branch edges — short horizontal lines for dense look */}
                  <g stroke="#1a472a" strokeWidth="0.5" opacity="0.5">
                    <line x1="14" y1="14" x2="12" y2="15"/><line x1="26" y1="14" x2="28" y2="15"/>
                    <line x1="12" y1="22" x2="10" y2="23"/><line x1="28" y1="22" x2="30" y2="23"/>
                    <line x1="10" y1="30" x2="8" y2="31"/><line x1="30" y1="30" x2="32" y2="31"/>
                    <line x1="16" y1="26" x2="14" y2="27"/><line x1="24" y1="26" x2="26" y2="27"/>
                  </g>
                  {/* Inner shadow layers */}
                  <polygon points="20,4 16,12 24,12" fill="#1a472a" opacity="0.12"/>
                  <polygon points="20,12 14,20 26,20" fill="#1a472a" opacity="0.1"/>
                </svg>
              },
              { value: 'birch', name: 'Birch',
                icon: <svg viewBox="0 0 40 48" width="32" height="38" style={{display:'block',margin:'0 auto'}}>
                  {/* Trunk — white/light with dark horizontal marks */}
                  <rect x="17.5" y="16" width="5" height="30" rx="1.5" fill="#f0ece4"/>
                  <rect x="17.5" y="16" width="5" height="30" rx="1.5" fill="none" stroke="#aaa" strokeWidth="0.5"/>
                  {/* Birch bark marks */}
                  {[20,24,28,33,38,42].map((y,i) => (
                    <line key={i} x1="18" y1={y} x2="22" y2={y} stroke="#888" strokeWidth={0.6 + (i%2)*0.3} opacity="0.5"/>
                  ))}
                  {/* Crown — light, airy, rounded */}
                  <ellipse cx="20" cy="13" rx="13" ry="11" fill="#6abf69" opacity="0.25"/>
                  <ellipse cx="16" cy="10" rx="7" ry="6" fill="#52b788"/>
                  <ellipse cx="25" cy="11" rx="6" ry="5.5" fill="#40916c"/>
                  <ellipse cx="20" cy="7" rx="6" ry="5" fill="#6abf69"/>
                  <ellipse cx="13" cy="14" rx="5" ry="4" fill="#52b788" opacity="0.8"/>
                  <ellipse cx="27" cy="15" rx="4.5" ry="3.5" fill="#40916c" opacity="0.7"/>
                  {/* Leaf texture — tiny dots */}
                  <g fill="#2d6a4f" opacity="0.3">
                    <circle cx="15" cy="8" r="0.8"/><circle cx="22" cy="6" r="0.8"/>
                    <circle cx="25" cy="9" r="0.7"/><circle cx="18" cy="12" r="0.8"/>
                    <circle cx="12" cy="13" r="0.7"/><circle cx="27" cy="13" r="0.7"/>
                  </g>
                  {/* Hanging branch hints */}
                  <path d="M14,16 Q10,20 8,19" fill="none" stroke="#52b788" strokeWidth="0.6" opacity="0.6"/>
                  <path d="M26,16 Q30,20 32,19" fill="none" stroke="#40916c" strokeWidth="0.6" opacity="0.6"/>
                </svg>
              },
              { value: 'aspen', name: 'Aspen',
                icon: <svg viewBox="0 0 40 48" width="32" height="38" style={{display:'block',margin:'0 auto'}}>
                  {/* Trunk — smooth, greenish-grey */}
                  <rect x="18" y="20" width="4" height="26" rx="1" fill="#b8c5a8"/>
                  <rect x="18" y="20" width="4" height="26" rx="1" fill="none" stroke="#8a9a78" strokeWidth="0.4"/>
                  {/* Crown — tall columnar shape, characteristic of aspen */}
                  <ellipse cx="20" cy="14" rx="10" ry="13" fill="#7cb342" opacity="0.3"/>
                  <ellipse cx="18" cy="11" rx="6" ry="7" fill="#8bc34a"/>
                  <ellipse cx="23" cy="12" rx="5.5" ry="6.5" fill="#7cb342"/>
                  <ellipse cx="20" cy="6" rx="5" ry="5" fill="#9ccc65"/>
                  <ellipse cx="15" cy="16" rx="4.5" ry="4" fill="#7cb342" opacity="0.8"/>
                  <ellipse cx="25" cy="17" rx="4" ry="3.5" fill="#8bc34a" opacity="0.7"/>
                  {/* Trembling leaf hints — small circles with tiny stems */}
                  <g opacity="0.5">
                    <circle cx="13" cy="13" r="1.5" fill="#aed581" stroke="#689f38" strokeWidth="0.3"/>
                    <circle cx="27" cy="10" r="1.3" fill="#c5e1a5" stroke="#689f38" strokeWidth="0.3"/>
                    <circle cx="22" cy="4" r="1.2" fill="#aed581" stroke="#689f38" strokeWidth="0.3"/>
                    <circle cx="16" cy="7" r="1" fill="#c5e1a5" stroke="#689f38" strokeWidth="0.3"/>
                    <circle cx="25" cy="16" r="1.2" fill="#aed581" stroke="#689f38" strokeWidth="0.3"/>
                    <circle cx="12" cy="18" r="1" fill="#c5e1a5" stroke="#689f38" strokeWidth="0.3"/>
                  </g>
                </svg>
              },
            ].map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => handleForestTypeChange(t.value)}
                style={{
                  padding: '8px 6px',
                  border: forestType === t.value ? `2px solid ${colors.medGreen}` : `1px solid ${colors.gray200}`,
                  borderRadius: '8px',
                  backgroundColor: forestType === t.value ? '#ecfdf5' : colors.white,
                  cursor: 'pointer',
                  textAlign: 'center',
                  fontSize: '13px',
                  lineHeight: '1.3',
                }}
              >
                {t.icon}
                <strong>{t.name}</strong>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={styles.label}>Current Forest Age (years)</label>
          <input
            style={{ ...styles.input, ...(estimateAgeMode ? { opacity: 0.5 } : {}) }}
            type="number"
            min="11"
            max="100"
            value={estimateAgeMode && ageEstimate ? ageEstimate.estimatedAge : forestAge}
            onChange={(e) => setForestAge(parseInt(e.target.value) || 20)}
            disabled={estimateAgeMode}
            placeholder={estimateAgeMode ? '--' : undefined}
            title="Enter the current age of the forest (e.g., if planted in 2000, enter 25 for year 2025)"
          />
          <p style={{ fontSize: '12px', color: '#666', margin: '5px 0 0 0' }}>
            Enter age as of {new Date().getFullYear()}. Analysis covers the last 10 years. (Min: 11 years)
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '13px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={estimateAgeMode}
              onChange={(e) => {
                setEstimateAgeMode(e.target.checked);
                if (!e.target.checked) {
                  setAgeEstimate(null);
                }
              }}
            />
            Estimate age from satellite data
          </label>
          {estimateAgeMode && !ageEstimate && (
            <p style={{ fontSize: '12px', color: '#888', margin: '4px 0 0 0', fontStyle: 'italic' }}>
              Age will be estimated after analysis
            </p>
          )}
          {ageEstimate && (
            <div style={{ marginTop: '8px', padding: '10px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '13px' }}>
              <strong>Estimated age: {ageEstimate.estimatedAge} years</strong>{' '}
              (range: {ageEstimate.range[0]}–{ageEstimate.range[1]}, {ageEstimate.confidence} confidence)
              <br />
              <span style={{ color: '#666', fontSize: '12px' }}>
                Based on {ageEstimate.yearlyPeaks.length}-year NDVI trend (slope: {ageEstimate.observedSlope.toFixed(4)}/yr)
              </span>
            </div>
          )}
        </div>
      </div>

      {user && !isDemo && (
        <div data-pdf-exclude style={{
          backgroundColor: colors.white,
          borderRadius: '12px',
          border: `1px solid ${colors.gray200}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          marginBottom: '20px',
          overflow: 'hidden',
        }}>
          <div
            onClick={() => setShowSavedForests(!showSavedForests)}
            style={{
              padding: '15px 20px',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: 600,
              fontSize: '14px',
              color: colors.darkGreen,
            }}
          >
            <span>My Saved Forests ({savedForests.length})</span>
            <span style={{ fontSize: '12px', color: colors.gray500 }}>{showSavedForests ? '▲ Collapse' : '▼ Expand'}</span>
          </div>
          {showSavedForests && (
            <div style={{ padding: '0 20px 20px' }}>
              {savedForests.length === 0 ? (
                <p style={{ color: colors.gray500, fontSize: '13px', margin: 0 }}>
                  No saved forests yet. Analyze a forest and click Save to save it.
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  {savedForests.map(sf => (
                    <div
                      key={sf.id}
                      onClick={() => loadSavedForest(sf.id)}
                      style={{
                        ...styles.infoCard,
                        cursor: 'pointer',
                        border: loadedForestId === sf.id ? `2px solid #3b82f6` : `1px solid ${colors.gray200}`,
                        position: 'relative',
                      }}
                    >
                      <button
                        onClick={(e) => deleteSavedForest(sf.id, e)}
                        style={{
                          position: 'absolute', top: '8px', right: '8px',
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: '16px', color: colors.gray500, padding: '2px 6px',
                        }}
                        title="Delete forest"
                      >&times;</button>
                      <h4 style={{ margin: '0 0 6px', fontSize: '14px', color: colors.darkGreen, paddingRight: '20px' }}>{sf.name}</h4>
                      <p style={{ margin: '2px 0', fontSize: '12px', color: colors.gray500 }}>
                        {forestTypeNames[sf.forest_type] || sf.forest_type} · {sf.area_hectares ? `${Number(sf.area_hectares).toFixed(1)}ha` : 'N/A'}
                      </p>
                      <p style={{ margin: '2px 0', fontSize: '11px', color: colors.gray500 }}>
                        Saved {new Date(sf.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {user && isDemo && (
        <div data-pdf-exclude style={{
          padding: '12px 20px',
          backgroundColor: colors.gray100,
          borderRadius: '12px',
          border: `1px solid ${colors.gray200}`,
          marginBottom: '20px',
          fontSize: '13px',
          color: colors.gray500,
        }}>
          Save & load forests — <a href="/app" onClick={(e) => { e.preventDefault(); }} style={{ color: colors.medGreen, fontWeight: 600 }}>Upgrade to Pro</a>
        </div>
      )}

      <div data-pdf-section="Map" style={styles.mapContainer}>
        <MapContainer
          center={[62, 15]}
          zoom={4}
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
          {savedForests.map(sf => {
            if (sf.id === loadedForestId) return null;
            try {
              const geo = typeof sf.polygon_geojson === 'string' ? JSON.parse(sf.polygon_geojson) : sf.polygon_geojson;
              const positions = geo.coordinates[0].map(c => [c[1], c[0]]);
              return (
                <Polygon
                  key={`saved-${sf.id}`}
                  positions={positions}
                  pathOptions={{
                    color: '#3b82f6',
                    weight: 2,
                    opacity: 0.7,
                    fillOpacity: 0.1,
                    dashArray: '8 4',
                  }}
                  eventHandlers={{ click: () => loadSavedForest(sf.id) }}
                >
                  <LeafletTooltip>{sf.name}</LeafletTooltip>
                </Polygon>
              );
            } catch { return null; }
          })}
        </MapContainer>
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button
          style={{
            ...styles.button,
            ...(loading || selectedForests.length === 0 ? styles.buttonDisabled : {})
          }}
          onClick={isDemo ? loadDemoData : fetchSatelliteData}
          disabled={loading || (selectedForests.length === 0 && !isDemo)}
        >
          {loading ? 'Processing Satellite Data...' : isDemo ? 'Load Demo Analysis' : 'Analyze with Sentinel-2 Process API'}
        </button>
        {loading && !isDemo && (
          <button
            style={{
              ...styles.button,
              backgroundColor: '#dc2626',
            }}
            onClick={cancelProcessing}
          >
            Cancel
          </button>
        )}
        {!isDemo && selectedForests.length > 0 && (
          <button
            style={{
              ...styles.button,
              backgroundColor: colors.medGreen,
              ...(savingForest ? styles.buttonDisabled : {}),
            }}
            onClick={saveCurrentForest}
            disabled={savingForest}
          >
            {savingForest ? 'Saving...' : 'Save Forest'}
          </button>
        )}
      </div>

      {!loading && biomassData.length > 0 && (
        <p style={{ fontSize: '12px', marginTop: '10px', padding: '10px', backgroundColor: colors.white, borderRadius: '12px', border: `1px solid ${colors.gray200}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <strong>Processing Summary:</strong> Analyzed {biomassData.length} Sentinel-2 acquisitions over {((new Date(biomassData[biomassData.length - 1].date) - new Date(biomassData[0].date)) / 31536000000).toFixed(1)} years
          with {(biomassData.reduce((sum, d) => sum + parseFloat(d.coverage), 0) / biomassData.length).toFixed(1)}% average cloud-free coverage.
          Biomass increased from {(biomassData[0].biomassRollingAvg ?? biomassData[0].biomass).toFixed(1)} to {(biomassData[biomassData.length - 1].biomassRollingAvg ?? biomassData[biomassData.length - 1].biomass).toFixed(1)} tons/ha,
          representing {(((biomassData[biomassData.length - 1].biomassRollingAvg ?? biomassData[biomassData.length - 1].biomass) - (biomassData[0].biomassRollingAvg ?? biomassData[0].biomass)) / (biomassData[0].biomassRollingAvg ?? biomassData[0].biomass) * 100).toFixed(1)}% growth.
        </p>
      )}

      {selectedForests.length > 0 && (
        <div data-pdf-section="Forest Info" style={styles.forestInfo}>
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
              <h3>{forest.name || `Forest #${idx + 1}`}</h3>
              <p><strong>Type:</strong> {forest.type}</p>
              <p><strong>Area:</strong> {forest.area} hectares</p>
              <p><strong>Current Age:</strong> {estimateAgeMode ? (ageEstimate ? `${ageEstimate.estimatedAge} years (estimated)` : 'Pending estimation...') : `${forestAge} years`}</p>
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
        <div data-pdf-section="Chart" style={styles.chartContainer}>
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
            {user && user.plan === 'business' ? (
              <button
                style={{ ...styles.exportButton, backgroundColor: colors.darkGreen }}
                onClick={exportToPdf}
                title="Export full report as PDF"
              >
                Export PDF
              </button>
            ) : (
              <button
                style={{ ...styles.exportButton, backgroundColor: '#9ca3af', cursor: 'not-allowed' }}
                disabled
                title="PDF export requires Business plan"
              >
                Export PDF
              </button>
            )}
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
              <div data-pdf-section="Analysis Metrics">
                <h4 style={styles.moduleHeading}>1. Current Analysis Metrics</h4>
                <div style={styles.moduleCard}>
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
                        Biomass (tons/ha) is estimated from each NDVI reading using a logistic growth curve calibrated per species. Parameters: pine max 450 t/ha at growth rate 0.08, spruce 500 t/ha at 0.07, birch 300 t/ha at 0.12, aspen 250 t/ha at 0.15. Current and initial values are the last and first observations. Annual growth rate = (current − initial) / years elapsed.
                      </InfoButton></div>
                      <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                        <li>Current Biomass: {(biomassData[biomassData.length - 1].biomassRollingAvg ?? biomassData[biomassData.length - 1].biomass).toFixed(2)} tons/ha</li>
                        <li>Initial Biomass: {(biomassData[0].biomassRollingAvg ?? biomassData[0].biomass).toFixed(2)} tons/ha</li>
                        <li>Total Accumulation: {((biomassData[biomassData.length - 1].biomassRollingAvg ?? biomassData[biomassData.length - 1].biomass) - (biomassData[0].biomassRollingAvg ?? biomassData[0].biomass)).toFixed(2)} tons/ha</li>
                        <li>Annual Growth Rate: {(((biomassData[biomassData.length - 1].biomassRollingAvg ?? biomassData[biomassData.length - 1].biomass) - (biomassData[0].biomassRollingAvg ?? biomassData[0].biomass)) / ((new Date(biomassData[biomassData.length - 1].date) - new Date(biomassData[0].date)) / 31536000000)).toFixed(2)} tons/ha/year</li>
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
              </div>
            )}

            {treeEstimate && (
              <div data-pdf-section="Tree Count">
                <h4 style={styles.moduleHeading}>2. Estimated Tree Count</h4>
                <div style={{ ...styles.moduleCard, borderLeft: `4px solid ${colors.lightGreen}` }}>
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
                        Canopy cover = fraction of area under tree crowns derived from NDVI pixel thresholds. Crown diameter is modeled per species (pine 2–8m, spruce 1.5–6m, birch 3–10m, aspen 2.5–9m) using a saturating exponential of forest age. Packing factor accounts for gaps between crowns (not all canopy area contains trees).
                      </InfoButton></div>
                      <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                        <li>Canopy Cover: {treeEstimate.canopyCover}%</li>
                        <li>Mean Crown Diameter: {treeEstimate.meanCrownDiameter} m</li>
                        <li>Crown Area: {treeEstimate.crownArea} m²</li>
                        <li>Packing Factor: {treeEstimate.packingFactor}</li>
                      </ul>
                    </div>
                  </div>
                  <p style={styles.moduleFootnote}>
                    Estimated using forestry allometric models (crown diameter × canopy cover). Sentinel-2 at 10m resolution
                    cannot resolve individual trees — this is a statistical estimate based on species, age, and NDVI-derived canopy cover (±30% uncertainty).
                  </p>
                </div>
              </div>
            )}

            {biomassData.length > 0 && (
              <div data-pdf-section="Timber Value">
                <h4>3. Timber Value & Harvest Analysis</h4>
                <CarbonDashboard
                  biomassData={biomassData}
                  forestType={selectedForests[selectedForestIndex].type}
                  forestAge={forestAge}
                  areaHectares={parseFloat(selectedForests[selectedForestIndex].area)}
                  showInfo={showInfo}
                  setShowInfo={setShowInfo}
                />
              </div>
            )}

            {/* 3b. Timber Market & Pricing */}
            {biomassData.length > 0 && (() => {
              const currentType = selectedForests[selectedForestIndex].type;
              const currentArea = parseFloat(selectedForests[selectedForestIndex].area);
              const latestBiomass = biomassData[biomassData.length - 1].biomassRollingAvg ?? biomassData[biomassData.length - 1].biomass;
              const priceRange = calculatePriceRange(latestBiomass, currentType, forestAge, currentArea);
              const harvestDelay = analyzeHarvestDelay(currentType, forestAge, currentArea);

              return (
                <div data-pdf-section="Timber Market">
                  <h4 style={styles.moduleHeading}>3b. Timber Market & Pricing</h4>
                  <div style={{ ...styles.moduleCard, borderLeft: '4px solid #d97706' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '15px' }}>
                      <div style={styles.statCard}>
                        <div style={styles.statLabel}>
                          Price Range (Delivery)
                          <InfoButton id="marketPriceRange" showInfo={showInfo} setShowInfo={setShowInfo}>
                            Low/Avg/High delivery-sale prices based on Luke 2024 price statistics across Finnish timber buyers. Delivery sale = you handle harvesting and transport to mill. Includes sawlog, pulpwood, and energy wood volumes.
                          </InfoButton>
                        </div>
                        <div style={styles.statValue}>
                          €{priceRange.avg.toFixed(0)}
                        </div>
                        <div style={{ fontSize: '11px', color: colors.gray500 }}>
                          €{priceRange.low.toFixed(0)} — €{priceRange.high.toFixed(0)}
                        </div>
                      </div>

                      <div style={styles.statCard}>
                        <div style={styles.statLabel}>
                          Standing Sale
                          <InfoButton id="marketStanding" showInfo={showInfo} setShowInfo={setShowInfo}>
                            Standing (pystykauppa) sale price = delivery price × {(STANDING_SALE_DISCOUNT * 100).toFixed(0)}%. Buyer handles all harvesting and transport. Lower price but zero work and risk for seller. Most common sale type in Finland.
                          </InfoButton>
                        </div>
                        <div style={styles.statValue}>
                          €{priceRange.standingSaleAvg.toFixed(0)}
                        </div>
                        <div style={{ fontSize: '11px', color: colors.gray500 }}>
                          €{priceRange.standingSaleLow.toFixed(0)} — €{priceRange.standingSaleHigh.toFixed(0)}
                        </div>
                      </div>

                      <div style={styles.statCard}>
                        <div style={styles.statLabel}>
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
                    <p style={styles.moduleFootnote}>
                      Prices based on Luke 2024 Finnish timber price statistics. UPM, Stora Enso, and Metsä Group control ~80% of purchases — compare offers from multiple buyers.
                    </p>
                  </div>
                </div>
              );
            })()}

            {healthEstimate && (
              <div data-pdf-section="Forest Health">
                <h4 style={styles.moduleHeading}>4. Forest Health Assessment</h4>
                <div style={{
                  ...styles.moduleCard,
                  borderLeft: `4px solid ${healthEstimate.healthScore > 80 ? '#27ae60' :
                    healthEstimate.healthScore > 60 ? '#f39c12' :
                    healthEstimate.healthScore > 40 ? '#e67e22' : '#e74c3c'}`
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

                  <p style={styles.moduleFootnote}>
                    Health assessment based on NDVI, NDMI (moisture), and NDRE (red edge) spectral indices from Sentinel-2.
                    Probable causes are matched from species-specific vulnerability profiles — field verification is recommended for confirmation.
                  </p>
                </div>
              </div>
            )}

            {biodiversityEstimate && (
              <div data-pdf-section="Biodiversity">
                <h4 style={styles.moduleHeading}>5. Biodiversity Assessment</h4>
                <div style={{
                  ...styles.moduleCard,
                  borderLeft: `4px solid ${biodiversityEstimate.overallScore > 70 ? '#27ae60' :
                    biodiversityEstimate.overallScore > 50 ? '#f39c12' : '#e74c3c'}`
                }}>
                  <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555' }}>Biodiversity Score</span>
                      <InfoButton id="bioScore" showInfo={showInfo} setShowInfo={setShowInfo}>
                        <strong>Weighted composite score (0-100) from satellite-measurable indicators only:</strong>
                        <ul style={{ margin: '4px 0', paddingLeft: '18px' }}>
                          <li><strong>Structural Diversity (55%):</strong> NDVI spatial variance (canopy heterogeneity), canopy cover optimality (60-85% ideal per Finnish forestry science), and crown diameter maturity relative to species maximum.</li>
                          <li><strong>Age/Maturity (25%):</strong> min(age / mature age, 1). Older forests provide more habitat niches (Kuuluvainen & Aakala, 2011).</li>
                          <li><strong>Health Factor (20%):</strong> From spectral health assessment. Healthy forests support more biodiversity.</li>
                        </ul>
                        Species composition is excluded — satellite data cannot reliably distinguish tree species from a single polygon. A field survey would be needed.
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
                    <div style={styles.statCard}>
                      <div style={styles.statLabel}>Structural Diversity <InfoButton id="bioStructural" showInfo={showInfo} setShowInfo={setShowInfo}>
                        Measures canopy heterogeneity from NDVI variance across the polygon (40% weight), canopy cover optimality — 60-85% is ideal as it provides both shelter and light gaps (30%), and crown diameter maturity (30%). Higher variation = more microhabitats.
                      </InfoButton></div>
                      <div style={styles.statValue}>{biodiversityEstimate.structuralDiversity}</div>
                    </div>
                    <div style={styles.statCard}>
                      <div style={styles.statLabel}>Species Composition <InfoButton id="bioSpecies" showInfo={showInfo} setShowInfo={setShowInfo}>
                        Satellite data cannot reliably detect species mix from a single forest type polygon. Finnish forests with 3+ tree species score significantly higher in biodiversity surveys (Vanha-Majamaa & Jalonen, 2001). A field survey or multi-spectral species classification would be needed for a real score.
                      </InfoButton></div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold', color: colors.gray500 }}>N/A</div>
                      <div style={{ fontSize: '10px', color: colors.gray500 }}>Requires field survey</div>
                    </div>
                    <div style={styles.statCard}>
                      <div style={styles.statLabel}>Age/Maturity <InfoButton id="bioAge" showInfo={showInfo} setShowInfo={setShowInfo}>
                        Ratio of current age to species mature age (pine 80yr, spruce 90yr, birch 60yr, aspen 50yr). Older forests develop more structural complexity, deadwood, and ecological niches for epiphytes, cavity-nesting birds, and saproxylic insects.
                      </InfoButton></div>
                      <div style={styles.statValue}>{biodiversityEstimate.ageFactor}</div>
                    </div>
                    <div style={styles.statCard}>
                      <div style={styles.statLabel}>Deadwood Potential <InfoButton id="bioDeadwood" showInfo={showInfo} setShowInfo={setShowInfo}>
                        Deadwood is critical for ~25% of forest species in Finland. Estimated from forest age (older forests have more natural mortality) and NDVI spatial variance (indicates structural heterogeneity). "Likely" if age {'>'} species deadwood age and high NDVI variance. Deadwood ages: pine 100yr, spruce 110yr, birch 70yr, aspen 60yr.
                      </InfoButton></div>
                      <div style={styles.statValue}>{biodiversityEstimate.deadwood}</div>
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

                  <p style={styles.moduleFootnote}>
                    Biodiversity assessment is based on remote sensing indicators and forestry models — not a field survey.
                    Species composition is conservatively scored as monoculture since we cannot detect mixed species from satellite data alone.
                    For accurate biodiversity assessment, on-site surveys are recommended.
                  </p>
                </div>
              </div>
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
                <div data-pdf-section="EUDR Compliance">
                  <h4 style={styles.moduleHeading}>6. EUDR Compliance</h4>
                  <div style={{ ...styles.moduleCard, borderLeft: `4px solid ${riskAssessment.riskColor}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '15px' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          Risk Classification
                          <InfoButton id="eudrRisk" showInfo={showInfo} setShowInfo={setShowInfo}>
                            <div><strong>What is EUDR?</strong> The EU Deforestation Regulation (EU 2023/1115) takes effect Dec 30, 2025 (large operators) / Jun 30, 2026 (SMEs). It requires anyone placing timber, soy, palm oil, cattle, cocoa, coffee, or rubber products on the EU market to prove the commodities were not produced on land deforested after Dec 31, 2020.</div>
                            <div style={{ marginTop: '6px' }}><strong>What does this tool do?</strong> We compare pre-2021 and post-2020 peak NDVI from Sentinel-2 satellite imagery to estimate whether forest cover has been maintained. This gives you an early screening of deforestation risk — before investing in formal due diligence.</div>
                            <div style={{ marginTop: '6px' }}><strong>Risk levels:</strong> Negligible (≥90% NDVI continuity) = forest intact. Low (≥75%) = minor change, document it. Standard (≥60%) = investigate further. High ({'<'}60%) = significant loss detected.</div>
                            <div style={{ marginTop: '6px' }}><strong>What this is NOT:</strong> This screening does not replace the formal due diligence statement (DDS) that operators must submit through the EU Information System. You still need geo-located plot coordinates, supply chain documentation, and potentially third-party verification.</div>
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

                    <p style={styles.moduleFootnote}>
                      This is a satellite-based screening tool for early risk assessment — not a compliance certificate. Formal EUDR compliance requires a Due Diligence Statement (DDS) submitted through the EU Information System, including geo-located supply chain data and operator-level documentation per Regulation (EU) 2023/1115.
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* 7. Conservation & Subsidies (METSO + NRL) */}
            {biodiversityEstimate && biomassData.length > 0 && (() => {
              const currentType = selectedForests[selectedForestIndex].type;
              const currentArea = parseFloat(selectedForests[selectedForestIndex].area);
              const latestBiomass = biomassData[biomassData.length - 1].biomassRollingAvg ?? biomassData[biomassData.length - 1].biomass;
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
                <div data-pdf-section="Conservation">
                  <h4 style={styles.moduleHeading}>7. Conservation & Subsidies</h4>
                  <div style={{ ...styles.moduleCard, borderLeft: `4px solid ${colors.medGreen}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '15px' }}>
                      <div style={styles.statCard}>
                        <div style={styles.statLabel}>
                          METSO Class
                          <InfoButton id="metsoClass" showInfo={showInfo} setShowInfo={setShowInfo}>
                            METSO is Finland's voluntary forest conservation programme (€21.7M available). Class I = highest conservation value (old-growth, high biodiversity). Class II = significant value. Class III = potential value with restoration. Classification based on forest age and biodiversity score thresholds specific to each tree species.
                          </InfoButton>
                        </div>
                        <div style={{ ...styles.statValue, fontSize: '28px', color: metso.eligible ? '#27ae60' : colors.gray500 }}>
                          {metso.metsoClass ? `Class ${metso.metsoClass}` : 'Not Eligible'}
                        </div>
                        <div style={{ fontSize: '11px', color: colors.gray700 }}>{metso.label}</div>
                        {metso.nextClassRequirements && (
                          <div style={{ fontSize: '10px', color: colors.gray500, marginTop: '4px' }}>
                            Next: Class {metso.nextClassRequirements.targetClass}
                            {metso.nextClassRequirements.ageNeeded > 0 && ` (${metso.nextClassRequirements.ageNeeded}yr more)`}
                          </div>
                        )}
                      </div>

                      <div style={styles.statCard}>
                        <div style={styles.statLabel}>
                          Compensation Value
                          <InfoButton id="metsoComp" showInfo={showInfo} setShowInfo={setShowInfo}>
                            METSO compensation: permanent protection pays 100% of timber value as lump sum. 20-year temporary protection pays 70% upfront plus annual management payment (~2%/yr). Compensation is tax-free for permanent protection under certain conditions.
                          </InfoButton>
                        </div>
                        <div style={{ fontSize: '13px', margin: '6px 0', lineHeight: '1.8' }}>
                          <div>Permanent: <strong style={{ color: '#27ae60' }}>€{permanentComp.lumpSum.toFixed(0)}</strong></div>
                          <div>20yr temp: <strong style={{ color: '#f39c12' }}>€{temporaryComp.totalOver20Years.toFixed(0)}</strong></div>
                          <div style={{ fontSize: '10px', color: colors.gray500 }}>({temporaryComp.description})</div>
                        </div>
                      </div>

                      <div style={styles.statCard}>
                        <div style={styles.statLabel}>
                          NRL Status
                          <InfoButton id="nrlStatus" showInfo={showInfo} setShowInfo={setShowInfo}>
                            EU Nature Restoration Law targets for boreal forests: deadwood ≥20 m³/ha, retention trees ≥10/ha at harvest, uneven-aged structure. Deadwood is estimated from forest age and standing volume. Young managed forests typically have deadwood deficits.
                          </InfoButton>
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: nrl.overallStatus === 'Compliant' ? '#27ae60' : '#f39c12', margin: '6px 0' }}>
                          {nrl.overallStatus}
                        </div>
                        <div style={{ fontSize: '11px', color: colors.gray700 }}>
                          {nrl.compliantCount}/{nrl.totalTargets} targets met
                        </div>
                        {nrl.targets.filter(t => t.gap).map((t, i) => (
                          <div key={i} style={{ fontSize: '10px', color: '#d97706', marginTop: '2px' }}>{t.name}: {t.gap}</div>
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

                    <p style={styles.moduleFootnote}>
                      METSO eligibility is indicative — actual classification requires ELY Centre site assessment. NRL targets based on EU Nature Restoration Law proposal for boreal forests.
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* 8. Succession Planning */}
            {biomassData.length > 0 && (() => {
              const currentType = selectedForests[selectedForestIndex].type;
              const currentArea = parseFloat(selectedForests[selectedForestIndex].area);
              const latestBiomass = biomassData[biomassData.length - 1].biomassRollingAvg ?? biomassData[biomassData.length - 1].biomass;
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
                <div data-pdf-section="Succession Planning">
                  <h4 style={styles.moduleHeading}>8. Succession Planning</h4>
                  <div style={{ ...styles.moduleCard, borderLeft: '4px solid #7c3aed' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '15px' }}>
                      <div style={styles.statCard}>
                        <div style={styles.statLabel}>
                          Total Asset Value
                          <InfoButton id="succAsset" showInfo={showInfo} setShowInfo={setShowInfo}>
                            Total estate value = land + forest use value. Timber and carbon credits are mutually exclusive — you either harvest (timber) or keep standing (carbon credits), so the higher of the two is used. Land value uses Southern Finland average (€{LAND_VALUE_PER_HA.south}/ha, Tax Authority 2024).
                          </InfoButton>
                        </div>
                        <div style={styles.statValue}>
                          €{assetSummary.totalValue.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '11px', color: colors.gray500 }}>€{assetSummary.perHectare.toLocaleString()}/ha</div>
                        <div style={{ fontSize: '10px', color: colors.gray500, marginTop: '4px' }}>
                          Land {assetSummary.breakdown.landPercent}% / {assetSummary.betterUse === 'timber' ? 'Timber' : 'Carbon'} {assetSummary.breakdown.forestUsePercent}%
                        </div>
                        <div style={{ fontSize: '10px', color: colors.gray500 }}>
                          Timber €{assetSummary.timberValue.toLocaleString()} vs Carbon €{assetSummary.carbonCreditValue.toLocaleString()}
                        </div>
                      </div>

                      <div style={styles.statCard}>
                        <div style={styles.statLabel}>
                          Inheritance Tax (Class I)
                          <InfoButton id="succTax" showInfo={showInfo} setShowInfo={setShowInfo}>
                            <div>Finnish inheritance tax for Class I heirs (children, spouse).</div>
                            <div style={{ marginTop: '6px' }}>
                              <strong>Your calculation:</strong><br />
                              1. Fair market value: €{inheritanceTax.fairMarketValue.toLocaleString()}<br />
                              2. Forest tax ratio: {(inheritanceTax.taxRatio * 100)}% (Finnish Tax Authority values forest at {(inheritanceTax.taxRatio * 100)}% of FMV)<br />
                              3. Taxable value: €{inheritanceTax.fairMarketValue.toLocaleString()} × {inheritanceTax.taxRatio} = <strong>€{inheritanceTax.taxableValue.toLocaleString()}</strong><br />
                              4. Bracket: €{(inheritanceTax.bracketMin / 1000).toFixed(0)}k+ at {(inheritanceTax.bracketRate * 100)}% (base €{inheritanceTax.bracketBase.toLocaleString()})<br />
                              5. Tax: €{inheritanceTax.bracketBase.toLocaleString()} + (€{inheritanceTax.taxableValue.toLocaleString()} − €{inheritanceTax.bracketMin.toLocaleString()}) × {(inheritanceTax.bracketRate * 100)}% = <strong>€{inheritanceTax.tax.toLocaleString()}</strong>
                            </div>
                            <div style={{ marginTop: '6px' }}>
                              <strong>All brackets:</strong> €0-20k = 0%, €20k-40k = 7%, €40k-60k = 10%, €60k-200k = 13%, €200k-1M = 16%, over €1M = 19%.
                            </div>
                          </InfoButton>
                        </div>
                        <div style={{ ...styles.statValue, color: '#e74c3c' }}>
                          €{inheritanceTax.tax.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '11px', color: colors.gray500 }}>
                          {inheritanceTax.effectiveRate.toFixed(1)}% of fair market value
                        </div>
                        <div style={{ fontSize: '10px', color: colors.gray500, marginTop: '4px' }}>
                          Taxable: €{inheritanceTax.taxableValue.toLocaleString()} ({(inheritanceTax.taxRatio * 100)}% of €{inheritanceTax.fairMarketValue.toLocaleString()})
                        </div>
                      </div>

                      <div style={styles.statCard}>
                        <div style={styles.statLabel}>
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

                    <p style={styles.moduleFootnote}>
                      Succession planning estimates use Finnish Tax Authority 2024 rates and Southern Finland land values. 40% of Finnish forest transfers are unplanned — consider formalizing a succession plan.
                      Consult a forest tax specialist for binding tax calculations.
                    </p>
                  </div>
                </div>
              );
            })()}

          </div>
        </div>
      )}
      <div style={{ borderTop: `1px solid ${colors.gray200}`, marginTop: '24px', paddingTop: '16px', textAlign: 'center' }}>
        <p style={{ fontSize: '12px', color: colors.gray500 }}>
          <strong>Author:</strong> <a href="https://x.com/robertkottelin" target="_blank" rel="noopener noreferrer">@robertkottelin</a>
          {' | '}
          <strong>Source code:</strong> <a href="https://github.com/robertkottelin/biomass" target="_blank" rel="noopener noreferrer">Github</a>
        </p>
      </div>

    </div>
    {exportingPdf && (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 9999
      }}>
        <div style={{
          backgroundColor: '#fff', borderRadius: '12px', padding: '32px 48px',
          textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.2)'
        }}>
          <h3 style={{ margin: '0 0 12px 0', color: colors.darkGreen }}>Generating PDF Report...</h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>{pdfProgress}</p>
        </div>
      </div>
    )}
    </>
  );
};

const App = () => {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/app" element={<ForestBiomassApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;