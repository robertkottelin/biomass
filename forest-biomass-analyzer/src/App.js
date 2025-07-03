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
  const [cloudCoverage, setCloudCoverage] = useState(30);
  const [processingStatus, setProcessingStatus] = useState('');
  const mapRef = useRef();
  
  const authRef = useRef({
    accessToken: '',
    tokenExpiry: null,
    isAuthenticating: false,
    lastAuthTime: 0
  });

  useEffect(() => {
    loadGeometryUtil();
  }, []);

  // Biomass estimation from RGB (simplified empirical formula)
  const rgbToBiomass = (red, green, blue, forestType) => {
    const greenness = green - (red + blue) / 2;
    const params = {
      pine: 300,
      fir: 350,
      birch: 200,
      aspen: 180
    };
    const maxBiomass = params[forestType] || 300;
    return Math.max(0, Math.min(maxBiomass, greenness * 500));
  };

  const getAccessToken = () => authRef.current.accessToken;

  const isTokenValid = () => {
    const now = Date.now();
    return authRef.current.accessToken && 
           authRef.current.tokenExpiry && 
           now < authRef.current.tokenExpiry;
  };

  const authenticateCDSE = async () => {
    if (authRef.current.isAuthenticating) {
      console.log('Authentication already in progress');
      return false;
    }
    
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
      
      authRef.current.accessToken = tokenResult.access_token;
      authRef.current.tokenExpiry = Date.now() + ((tokenResult.expires_in - 60) * 1000);
      
      setAuthenticated(true);
      setProcessingStatus('');
      console.log(`Token acquired. Expires in: ${tokenResult.expires_in}s`);
      return true;
    } catch (err) {
      setError(`Authentication failed: ${err.message}`);
      setProcessingStatus('');
      return false;
    } finally {
      authRef.current.isAuthenticating = false;
    }
  };

  const reauthenticate = async () => {
    console.log('Re-authenticating...');
    return await authenticateCDSE();
  };

  const ensureValidToken = async () => {
    if (!isTokenValid()) {
      return await reauthenticate();
    }
    return true;
  };

  const searchSentinel2Products = async (polygon, startDate, endDate) => {
    if (!await ensureValidToken()) {
      throw new Error('Failed to obtain valid token');
    }
    
    const coords = polygon.coords.map(coord => [coord[1], coord[0]]);
    const coordsString = [...coords, coords[0]].map(c => `${c[0]} ${c[1]}`).join(',');
    const wktPolygon = `POLYGON((${coordsString}))`;

    const filterQuery = `Collection/Name eq 'SENTINEL-2' and OData.CSC.Intersects(area=geography'SRID=4326;${wktPolygon}') and ContentDate/Start gt ${ WktPolygon}') and ContentDate/Start gt ${startDate}T00:00:00.000Z and ContentDate/Start lt ${endDate}T00:00:00.000Z and Attributes/OData.CSC.DoubleAttribute/any(att:att/Name eq 'cloudCover' and att/OData.CSC.DoubleAttribute/Value le ${cloudCoverage}.00) and Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'productType' and att/OData.CSC.StringAttribute/Value eq 'S2MSI2A')`;
    const searchUrl = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=${encodeURIComponent(filterQuery)}&$orderby=ContentDate/Start&$top=100`;

    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${getAccessToken()}`
      }
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const data = await response.json();
    return data.value || [];
  };

  const processSentinel2RGB = async (product, polygon, retries = 0) => {
    if (!await ensureValidToken()) {
      console.error('Authentication failed');
      return null;
    }

    const acquisitionDate = new Date(product.ContentDate.Start);
    const dateStr = acquisitionDate.toISOString().split('T')[0];
    const month = acquisitionDate.getMonth() + 1;

    if (month < 6 || month > 8) {
      return null;
    }

    const evalscript = `
      //VERSION=3
      function setup() {
        return {
          input: ["B02", "B03", "B04", "SCL"],
          output: [
            { id: "red", bands: 1, sampleType: "FLOAT32" },
            { id: "green", bands: 1, sampleType: "FLOAT32" },
            { id: "blue", bands: 1, sampleType: "FLOAT32" },
            { id: "dataMask", bands: 1, sampleType: "UINT8" }
          ]
        };
      }

      function evaluatePixel(samples) {
        if (samples.dataMask === 0 || samples.SCL === 0 || samples.SCL === 1 || samples.SCL === 9) {
          return { red: 0, green: 0, blue: 0, dataMask: 0 };
        }
        return {
          red: samples.B04,
          green: samples.B03,
          blue: samples.B02,
          data  dataMask: 1
        };
      }
    `;

    const coordinates = polygon.coords.map(coord => [coord[1], coord[0]]);
    const statsRequest = {
      input: {
        bounds: {
          geometry: {
            type: "Polygon",
            coordinates: [[...coordinates, coordinates[0]]]
          },
          properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" }
        },
        data: [{
          type: "sentinel-2-l2a",
          dataFilter: {
            timeRange: {
              from: acquisitionDate.toISOString(),
              to: new Date(acquisitionDate.getTime() + 24 * 60 * 60 * 1000).toISOString()
            },
            maxCloudCoverage: cloudCoverage / 100
          }
        }]
      },
      aggregation: {
        timeRange: {
          from: acquisitionDate.toISOString(),
          to: new Date(acquisitionDate.getTime() + 24 * 60 * 60 * 1000).toISOString()
        },
        aggregationInterval: { of: "P1D" },
        evalscript: evalscript,
        resx: 100,
        resy: 100
      }
    };

    try {
      const response = await fetch('https://sh.dataspace.copernicus.eu/api/v1/statistics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAccessToken()}`
        },
        body: JSON.stringify(statsRequest)
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter && retries < 3) {
          const waitTime = parseInt(retryAfter, 10) * 1000;
          console.log(`Rate limited. Waiting ${waitTime}ms before retrying.`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return processSentinel2RGB(product, polygon, retries + 1);
        } else {
          console.error('Rate limited, and no Retry-After header or max retries reached.');
          return null;
        }
      }

      if (response.status === 401) {
        console.log('Token expired, attempting to re-authenticate.');
        if (!await reauthenticate()) {
          console.error('Failed to refresh token');
          return null;
        }
        return processSentinel2RGB(product, polygon, retries);
      }

      if (!response.ok) {
        console.error(`Stats API error: ${response.status}`);
        return null;
      }

      const statsData = await response.json();
      if (statsData.data && statsData.data.length > 0) {
        const interval = statsData.data[0];
        const redStats = interval.outputs.red.bands.B0.stats;
        const greenStats = interval.outputs.green.bands.B0.stats;
        const blueStats = interval.outputs.blue.bands.B0.stats;

        if (redStats.sampleCount > redStats.noDataCount) {
          return {
            red: redStats.mean,
            green: greenStats.mean,
            blue: blueStats.mean,
            date: dateStr
          };
        }
      }
      return null;
    } catch (error) {
      console.error('Processing error:', error);
      return null;
    }
  };

  const fetchSatelliteData = async () => {
    if (selectedForests.length === 0) {
      setError('Draw at least one forest polygon');
      return;
    }

    if (!authenticated) {
      setError('Authenticate with Copernicus Data Space first');
      return;
    }

    if (!isTokenValid()) {
      await reauthenticate();
    }

    setLoading(true);
    setError(null);
    setBiomassData([]);
    setProcessingStatus('Fetching summer month data...');

    try {
      const selectedForest = selectedForests[selectedForestIndex];
      const startYear = 2023;
      const endYear = new Date().getFullYear();
      const allProducts = [];

      for (let year = startYear; year <= endYear; year++) {
        const summerStart = `${year}-06-01`;
        const summerEnd = `${year}-08-31`;
        const products = await searchSentinel2Products(selectedForest, summerStart, summerEnd);
        allProducts.push(...products);
      }

      if (allProducts.length === 0) {
        setError('No summer month data found');
        return;
      }

      setProcessingStatus(`Processing ${allProducts.length} products...`);
      const biomassResults = [];

      for (let index = 0; index < allProducts.length; index++) {
        const product = allProducts[index];
        setProcessingStatus(`Processing product ${index + 1} of ${allProducts.length}...`);
        const rgbResult = await processSentinel2RGB(product, selectedForest);
        if (rgbResult) {
          const biomass = rgbToBiomass(rgbResult.red, rgbResult.green, rgbResult.blue, selectedForest.type);
          biomassResults.push({
            date: rgbResult.date,
            biomass: biomass,
            red: rgbResult.red,
            green: rgbResult.green,
            blue: rgbResult.blue
          });
        }
        // Add a 5-second delay between requests
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      setBiomassData(biomassResults.sort((a, b) => new Date(a.date) - new Date(b.date)));
      setProcessingStatus('');
    } catch (err) {
      setError(`Data fetch error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreated = useCallback((e) => {
    const layer = e.layer;
    const coords = layer.getLatLngs()[0];
    let area = window.L && window.L.GeometryUtil ? L.GeometryUtil.geodesicArea(coords) / 10000 : 0;
    const newForest = {
      id: Date.now(),
      coords: coords.map(c => [c.lat, c.lng]),
      area: area.toFixed(2),
      type: forestType
    };
    setSelectedForests(prev => [...prev, newForest]);
  }, [forestType]);

  const handleDeleted = useCallback(() => {
    setSelectedForests(forests => forests.slice(0, -1));
    setSelectedForestIndex(Math.max(0, selectedForests.length - 2));
  }, [selectedForests.length]);

  const styles = {
    container: { maxWidth: '1200px', margin: '0 auto', padding: '20px', fontFamily: 'Arial, sans-serif' },
    header: { textAlign: 'center', marginBottom: '20px', color: '#2c3e50' },
    controls: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' },
    input: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', width: '100%' },
    select: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', width: '100%', backgroundColor: 'white' },
    label: { display: 'block', marginBottom: '5px', fontWeight: '500', color: '#555' },
    button: { padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', fontSize: '16px', cursor: 'pointer', marginTop: '20px' },
    buttonDisabled: { backgroundColor: '#ccc', cursor: 'not-allowed' },
    authSection: { backgroundColor: '#fff', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e9ecef' },
    mapContainer: { height: '600px', marginBottom: '20px', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
    chartContainer: { backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '20px' },
    forestInfo: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px', marginBottom: '20px' },
    infoCard: { backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #e9ecef' },
    error: { backgroundColor: '#f8d7da', color: '#721c24', padding: '12px 20px', borderRadius: '4px', marginBottom: '20px', border: '1px solid #f5c6cb' },
    loading: { textAlign: 'center', padding: '40px', fontSize: '18px', color: '#666' },
    success: { backgroundColor: '#d4edda', color: '#155724', padding: '12px 20px', borderRadius: '4px', marginBottom: '20px', border: '1px solid #c3e6cb' }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Forest Biomass Analysis (Summer Months)</h1>

      {error && (
        <div style={styles.error}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {authenticated && (
        <div style={styles.success}>
          <strong>Authenticated</strong> - Token expires: {authRef.current.tokenExpiry ? new Date(authRef.current.tokenExpiry).toLocaleTimeString() : 'N/A'}
        </div>
      )}

      <div style={styles.authSection}>
        <h3>Copernicus Data Space Authentication</h3>
        <div style={styles.controls}>
          <div>
            <label style={styles.label}>Client ID</label>
            <input style={styles.input} type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={authenticated} />
          </div>
          <div>
            <label style={styles.label}>Client Secret</label>
            <input style={styles.input} type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} disabled={authenticated} />
          </div>
          <div>
            <label style={styles.label}>Max Cloud Coverage (%)</label>
            <input style={styles.input} type="number" min="0" max="100" value={cloudCoverage} onChange={(e) => setCloudCoverage(parseInt(e.target.value))} />
          </div>
        </div>
        <button style={{ ...styles.button, ...(authenticated ? styles.buttonDisabled : {}) }} onClick={authenticateCDSE} disabled={authenticated}>
          {authenticated ? 'Authenticated' : 'Authenticate'}
        </button>
      </div>

      <div style={styles.controls}>
        <div>
          <label style={styles.label}>Forest Type</label>
          <select style={styles.select} value={forestType} onChange={(e) => setForestType(e.target.value)}>
            <option value="pine">Pine</option>
            <option value="fir">Fir</option>
            <option value="birch">Birch</option>
            <option value="aspen">Aspen</option>
          </select>
        </div>
      </div>

      <div style={styles.mapContainer}>
        <MapContainer center={[61.086011, 24.065087]} zoom={12} style={{ height: '100%', width: '100%' }} ref={mapRef}>
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution='© Esri' />
          <FeatureGroup>
            <DrawControl onCreated={handleCreated} onDeleted={handleDeleted} />
            {selectedForests.map((forest, idx) => (
              <Polygon
                key={forest.id}
                positions={forest.coords}
                pathOptions={{ color: idx === selectedForestIndex ? '#ff7800' : '#51a351', weight: 3, opacity: 0.8, fillOpacity: 0.3 }}
                eventHandlers={{ click: () => setSelectedForestIndex(idx) }}
              />
            ))}
          </FeatureGroup>
        </MapContainer>
      </div>

      <button
        style={{ ...styles.button, ...(loading || selectedForests.length === 0 || !authenticated ? styles.buttonDisabled : {}) }}
        onClick={fetchSatelliteData}
        disabled={loading || selectedForests.length === 0 || !authenticated}
      >
        {loading ? 'Processing...' : 'Analyze Summer Months (2023-Present)'}
      </button>

      {selectedForests.length > 0 && (
        <div style={styles.forestInfo}>
          {selectedForests.map((forest, idx) => (
            <div key={forest.id} style={{ ...styles.infoCard, border: idx === selectedForestIndex ? '2px solid #ff7800' : '1px solid #e9ecef' }} onClick={() => setSelectedForestIndex(idx)}>
              <h3>Forest #{idx + 1}</h3>
              <p><strong>Type:</strong> {forest.type}</p>
              <p><strong>Area:</strong> {forest.area} hectares</p>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div style={styles.loading}>
          <p>{processingStatus}</p>
        </div>
      )}

      {biomassData.length > 0 && (
        <div style={styles.chartContainer}>
          <h2>Summer Biomass (June-August)</h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={biomassData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={70} />
              <YAxis label={{ value: 'Biomass (tons/ha)', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="biomass" stroke="#82ca9d" name="Biomass" dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ marginTop: '20px' }}>
            <p><strong>Total Observations:</strong> {biomassData.length}</p>
            <p><strong>Average Biomass:</strong> {(biomassData.reduce((sum, d) => sum + d.biomass, 0) / biomassData.length).toFixed(1)} tons/ha</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ForestBiomassApp;