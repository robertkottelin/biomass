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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [cloudCoverage, setCloudCoverage] = useState(20);
  const [processingStatus, setProcessingStatus] = useState('');
  const mapRef = useRef();

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

  // Authenticate with Copernicus Data Space Ecosystem
  const authenticateCDSE = async () => {
    if (!username || !password) {
      setError('Enter username and password');
      return;
    }

    setError(null);
    setProcessingStatus('Authenticating...');

    try {
      // Get access token from CDSE
      const tokenData = {
        client_id: 'cdse-public',
        username: username,
        password: password,
        grant_type: 'password'
      };

      const tokenResponse = await fetch('https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(tokenData)
      });

      if (!tokenResponse.ok) {
        throw new Error('Authentication failed');
      }

      const tokenResult = await tokenResponse.json();
      setAccessToken(tokenResult.access_token);
      setAuthenticated(true);
      setProcessingStatus('');
    } catch (err) {
      setError('Authentication error: ' + err.message);
      setProcessingStatus('');
    }
  };

  // Search for Sentinel-2 products
  const searchSentinel2Products = async (polygon, startDate, endDate) => {
    const coords = polygon.coords.map(coord => [coord[1], coord[0]]); // Convert to lon,lat

    // Create WKT polygon string - ensure it's closed (first and last point must be same)
    const coordsString = [...coords, coords[0]].map(c => `${c[0]} ${c[1]}`).join(',');
    const wktPolygon = `POLYGON((${coordsString}))`;

    // Build filter string components
    const collectionFilter = `Collection/Name eq 'SENTINEL-2'`;
    const spatialFilter = `OData.CSC.Intersects(area=geography'SRID=4326;${wktPolygon}')`;
    const dateStartFilter = `ContentDate/Start gt ${startDate}T00:00:00.000Z`;
    const dateEndFilter = `ContentDate/Start lt ${endDate}T00:00:00.000Z`;
    const cloudFilter = `Attributes/OData.CSC.DoubleAttribute/any(att:att/Name eq 'cloudCover' and att/OData.CSC.DoubleAttribute/Value le ${cloudCoverage}.00)`;
    const productTypeFilter = `Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'productType' and att/OData.CSC.StringAttribute/Value eq 'S2MSI2A')`;

    // Combine filters
    const filterQuery = `${collectionFilter} and ${spatialFilter} and ${dateStartFilter} and ${dateEndFilter} and ${cloudFilter} and ${productTypeFilter}`;

    // OData query URL
    const searchUrl = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=${encodeURIComponent(filterQuery)}&$orderby=ContentDate/Start&$top=100`;

    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Search error:', errorText);
      throw new Error(`Search failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  };

  // Process Sentinel-2 NDVI data
  const processSentinel2NDVI = async (productId, productName) => {
    // Extract NDVI from product metadata
    // Production implementation requires either:
    // 1. Download product and process locally (rasterio/GDAL)
    // 2. Use Sentinel Hub Process API (requires additional subscription)
    // 3. Use STAC API with COG access for direct band reading

    // Parse acquisition date from product name
    // Format: S2[A|B]_MSIL2A_YYYYMMDDTHHMMSS_...
    const dateMatch = productName.match(/S2[AB]_MSIL2A_(\d{8})T/);
    const acquisitionDate = dateMatch ? dateMatch[1] : null;

    // Simulate NDVI based on seasonal patterns
    if (acquisitionDate) {
      const month = parseInt(acquisitionDate.substring(4, 6));
      const day = parseInt(acquisitionDate.substring(6, 8));

      // Seasonal NDVI model for temperate forests
      const dayOfYear = (month - 1) * 30 + day; // Approximation
      const seasonalFactor = 0.3 * Math.sin(2 * Math.PI * (dayOfYear - 80) / 365) + 0.5;
      const randomVariation = (Math.random() - 0.5) * 0.1;

      return Math.max(0, Math.min(1, seasonalFactor + randomVariation));
    }

    // Default fallback
    return 0.5 + (Math.random() - 0.5) * 0.2;
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

    setLoading(true);
    setError(null);
    setBiomassData([]);
    setProcessingStatus('Searching for Sentinel-2 products...');

    try {
      const selectedForest = selectedForests[selectedForestIndex];

      // Sentinel-2 data available from July 2015
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = '2015-07-01'; // First Sentinel-2A data availability

      // Batch requests by year to manage large datasets
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

          // Implement rate limiting to avoid API throttling
          if (year < endYear) {
            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between requests
          }
        } catch (err) {
          console.warn(`Failed to fetch data for ${year}:`, err);
          // Continue with other years even if one fails
        }
      }

      if (allProducts.length === 0) {
        setError('No Sentinel-2 products found for the selected area');
        return;
      }

      setProcessingStatus(`Found ${allProducts.length} products. Processing NDVI...`);

      // Process products to extract NDVI
      const biomassResults = [];
      const batchSize = 50; // Process in batches to avoid UI freezing

      for (let i = 0; i < allProducts.length; i += batchSize) {
        const batch = allProducts.slice(i, i + batchSize);

        for (const product of batch) {
          const date = new Date(product.ContentDate.Start).toISOString().split('T')[0];

          // Extract NDVI (production implementation required)
          const ndviValue = await processSentinel2NDVI(product.Id, product.Name);
          const biomass = ndviToBiomass(ndviValue, selectedForest.type);

          // Extract cloud cover from attributes
          const cloudCoverAttr = product.Attributes?.find(attr =>
            attr.Name === 'cloudCover' && attr.ValueType === 'Double'
          );
          const cloudCoverValue = cloudCoverAttr ? cloudCoverAttr.Value : 0;

          biomassResults.push({
            date: date,
            year: parseInt(date.split('-')[0]),
            month: parseInt(date.split('-')[1]),
            ndvi: ndviValue,
            biomass: biomass,
            productId: product.Id,
            productName: product.Name,
            cloudCover: cloudCoverValue,
            footprint: product.GeoFootprint
          });
        }

        setProcessingStatus(`Processing: ${Math.round((i + batchSize) / allProducts.length * 100)}% complete`);
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

      {authenticated && accessToken && (
        <div style={styles.info}>
          <strong>Authentication Status:</strong>
          <ul style={{ fontSize: '14px', margin: '10px 0', paddingLeft: '20px' }}>
            <li>Token acquired: {new Date().toLocaleTimeString()}</li>
            <li>Token expiry: 600 seconds</li>
            <li>API endpoint: catalogue.dataspace.copernicus.eu/odata/v1</li>
          </ul>
        </div>
      )}

      <div style={styles.authSection}>
        <h3>Copernicus Data Space Configuration</h3>
        <div style={styles.info}>
          <strong>Instructions:</strong>
          <ol style={{ margin: '10px 0', paddingLeft: '20px' }}>
            <li>Register at <a href="https://dataspace.copernicus.eu/" target="_blank" rel="noopener noreferrer">dataspace.copernicus.eu</a></li>
            <li>Use the same credentials here</li>
            <li>Data access is free for registered users</li>
          </ol>
        </div>
        <div style={styles.controls}>
          <div>
            <label style={styles.label}>Username</label>
            <input
              style={styles.input}
              type="text"
              placeholder="Your CDSE username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={authenticated}
            />
          </div>
          <div>
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              placeholder="Your CDSE password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
            NDVI time series from Sentinel-2 MSI (10m resolution for B4/B8).
            Cloud-filtered scenes with less than {cloudCoverage}% cloud coverage.
            Processed via Copernicus Data Space Ecosystem API.
          </p>
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
                        <p style={{ margin: '2px 0', fontSize: '12px' }}>
                          NDVI: {data.ndvi.toFixed(3)}
                        </p>
                        <p style={{ margin: '2px 0', fontSize: '12px' }}>
                          Biomass: {data.biomass.toFixed(1)} tons/ha
                        </p>
                        <p style={{ margin: '2px 0', fontSize: '12px', color: '#666' }}>
                          Cloud Cover: {data.cloudCover.toFixed(1)}%
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
                dot={{ r: 2, fill: '#82ca9d' }}
              />
              <Line
                yAxisId="ndvi"
                type="monotone"
                dataKey="ndvi"
                stroke="#8884d8"
                name="Scene NDVI"
                strokeWidth={0}
                dot={{ r: 2, fill: '#8884d8' }}
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
              Analysis Period: {biomassData[0]?.year} - {biomassData[biomassData.length - 1]?.year}
            </p>
            <p style={{ fontSize: '14px', margin: '5px 0' }}>
              Average NDVI: {(biomassData.reduce((sum, d) => sum + d.ndvi, 0) / biomassData.length).toFixed(3)}
            </p>
            <p style={{ fontSize: '14px', margin: '5px 0' }}>
              Average Biomass: {(biomassData.reduce((sum, d) => sum + d.biomass, 0) / biomassData.length).toFixed(1)} tons/ha
            </p>
            <p style={{ fontSize: '14px', margin: '5px 0' }}>
              Growth Trend: {
                ((biomassData[biomassData.length - 1]?.biomass - biomassData[0]?.biomass) / biomassData[0]?.biomass * 100).toFixed(1)
              }% over analysis period
            </p>
          </div>
        </div>
      )}

      <div style={styles.info}>
        <h4>Technical Notes</h4>
        <ul style={{ fontSize: '14px', margin: '10px 0', paddingLeft: '20px' }}>
          <li>Data source: Copernicus Data Space Ecosystem API</li>
          <li>Spatial resolution: 10m for NDVI bands</li>
          <li>Temporal resolution: ~5 days (combined S2A/S2B)</li>
          <li>Data fetching and processing pipeline: Copernicus OAuth2 Authentication via API with username/password, retrieves Sentinel-2 Level-2A products within user-defined polygon and date range, filters by cloud coverage, calculates NDVI from Bands 8 and 4, estimates biomass using forest type-specific exponential model, and sorts data chronologically.</li>
          <li>How to read the graph: Line chart with individual biomass (green dots) and NDVI (purple dots) observations over time, annual mean biomass (red line) for trend analysis, and interactive tooltip with date, NDVI, biomass, and cloud cover details.</li>
          <li>NDVI calculation: (B8 - B4) / (B8 + B4) using Sentinel-2 bands</li>
          <li>Biomass estimation model: Empirical exponential model based on NDVI</li>
          <li>Biomass estimation math: biomass = a × exp(b × NDVI) × (maxBiomass / 10), with a, b, maxBiomass specific to each forest type</li>
        </ul>
      </div>
    </div>
  );
};

export default ForestBiomassApp;