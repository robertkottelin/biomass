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
  const [processingStatus, setProcessingStatus] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [tokenExpiry, setTokenExpiry] = useState(null);
  const mapRef = useRef();

  // Forest parameters for biomass estimation from vegetation index
  const forestParams = {
    pine: { baselineBiomass: 150, maxBiomass: 350 },
    fir: { baselineBiomass: 180, maxBiomass: 400 },
    birch: { baselineBiomass: 100, maxBiomass: 250 },
    aspen: { baselineBiomass: 80, maxBiomass: 200 }
  };

  // Load GeometryUtil on mount
  useEffect(() => {
    loadGeometryUtil();
  }, []);

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

      const tokenResponse = await fetch('https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: tokenData
      });

      if (!tokenResponse.ok) {
        throw new Error(`Authentication failed: ${tokenResponse.status}`);
      }

      const tokenResult = await tokenResponse.json();
      setAccessToken(tokenResult.access_token);
      setTokenExpiry(Date.now() + ((tokenResult.expires_in - 60) * 1000));
      setAuthenticated(true);
      setProcessingStatus('');
      
      return true;
    } catch (err) {
      setError(`Authentication failed: ${err.message}`);
      setProcessingStatus('');
      return false;
    }
  };

  // Calculate vegetation index from RGB pixel data
  const calculateVegetationIndex = (pixelData) => {
    let totalGreenness = 0;
    let validPixels = 0;
    
    // Process every 4th value (RGBA format)
    for (let i = 0; i < pixelData.length; i += 4) {
      const r = pixelData[i];
      const g = pixelData[i + 1];
      const b = pixelData[i + 2];
      const a = pixelData[i + 3];
      
      // Skip transparent or black pixels
      if (a < 128 || (r === 0 && g === 0 && b === 0)) continue;
      
      // Simple vegetation index: (G - R) / (G + R)
      // Higher values indicate more vegetation
      if (g + r > 0) {
        const vi = (g - r) / (g + r);
        totalGreenness += vi;
        validPixels++;
      }
    }
    
    return validPixels > 0 ? totalGreenness / validPixels : 0;
  };

  // Estimate biomass from vegetation index
  const estimateBiomass = (vegetationIndex, forestType) => {
    const params = forestParams[forestType];
    // Map vegetation index (-1 to 1) to biomass range
    const normalizedVI = (vegetationIndex + 1) / 2; // Convert to 0-1 range
    return params.baselineBiomass + (normalizedVI * (params.maxBiomass - params.baselineBiomass));
  };

  // Process satellite image for a specific date
  const processSatelliteImage = async (polygon, date) => {
    const coords = polygon.coords.map(coord => [coord[1], coord[0]]); // lon,lat
    
    // Sentinel Hub Process API evalscript for RGB visualization
    const evalscript = `
      //VERSION=3
      function setup() {
        return {
          input: ["B04", "B03", "B02", "dataMask"],
          output: { bands: 4 }
        };
      }
      
      function evaluatePixel(sample) {
        // True color RGB with simple enhancement
        return [
          sample.B04 * 2.5,  // Red
          sample.B03 * 2.5,  // Green
          sample.B02 * 2.5,  // Blue
          sample.dataMask    // Alpha
        ];
      }
    `;
    
    // Create bounds for the request
    const bounds = {
      type: "Polygon",
      coordinates: [[...coords, coords[0]]]
    };
    
    // Process API request
    const processRequest = {
      input: {
        bounds: {
          geometry: bounds,
          properties: {
            crs: "http://www.opengis.net/def/crs/EPSG/0/4326"
          }
        },
        data: [{
          type: "sentinel-2-l2a",
          dataFilter: {
            timeRange: {
              from: `${date}T00:00:00Z`,
              to: `${date}T23:59:59Z`
            },
            maxCloudCoverage: 30
          }
        }]
      },
      output: {
        width: 512,
        height: 512,
        responses: [{
          identifier: "default",
          format: {
            type: "image/png"
          }
        }]
      },
      evalscript: evalscript
    };
    
    try {
      const response = await fetch('https://sh.dataspace.copernicus.eu/api/v1/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(processRequest)
      });
      
      if (!response.ok) {
        console.error(`Failed to fetch image for ${date}: ${response.status}`);
        return null;
      }
      
      // Convert image to pixel data
      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);
      
      // Create canvas to extract pixel data
      const canvas = document.createElement('canvas');
      canvas.width = imageBitmap.width;
      canvas.height = imageBitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imageBitmap, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const vegetationIndex = calculateVegetationIndex(imageData.data);
      
      return {
        vegetationIndex,
        imageUrl: URL.createObjectURL(blob),
        width: imageBitmap.width,
        height: imageBitmap.height
      };
    } catch (error) {
      console.error(`Error processing image for ${date}:`, error);
      return null;
    }
  };

  // Fetch satellite data for summer months only
  const fetchSatelliteData = async () => {
    if (selectedForests.length === 0) {
      setError('Draw at least one forest polygon');
      return;
    }

    if (!authenticated) {
      setError('Authenticate first');
      return;
    }

    setLoading(true);
    setError(null);
    setBiomassData([]);
    setProcessingStatus('Processing satellite imagery...');

    try {
      const selectedForest = selectedForests[selectedForestIndex];
      const currentYear = new Date().getFullYear();
      const results = [];
      
      // Process last 3 years of summer data
      for (let year = currentYear - 2; year <= currentYear; year++) {
        // Summer months in Finland: May to August
        const summerMonths = [
          { month: 5, day: 15 },  // Mid-May
          { month: 6, day: 15 },  // Mid-June
          { month: 7, day: 15 },  // Mid-July
          { month: 8, day: 15 }   // Mid-August
        ];
        
        for (const { month, day } of summerMonths) {
          const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          
          setProcessingStatus(`Processing ${date}...`);
          
          const imageData = await processSatelliteImage(selectedForest, date);
          
          if (imageData) {
            const biomass = estimateBiomass(imageData.vegetationIndex, selectedForest.type);
            
            results.push({
              date,
              year,
              month,
              vegetationIndex: imageData.vegetationIndex,
              biomass,
              imageUrl: imageData.imageUrl
            });
          }
          
          // Rate limiting: 2 second delay between requests
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Sort by date
      results.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      setBiomassData(results);
      setProcessingStatus('');
    } catch (err) {
      setError(`Processing error: ${err.message}`);
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
      type: forestType
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
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Forest Biomass Analysis - Sentinel-2 Summer Data</h1>
      
      <div style={styles.info}>
        <strong>Technical Overview:</strong>
        <ul style={{ fontSize: '14px', margin: '10px 0', paddingLeft: '20px' }}>
          <li>Data Source: Sentinel-2 L2A true color imagery (RGB bands: B04, B03, B02)</li>
          <li>Processing: Vegetation index calculated as (G-R)/(G+R) from pixel values</li>
          <li>Temporal Coverage: Summer months only (May-August) to avoid snow cover</li>
          <li>Spatial Resolution: 512x512 pixels per polygon</li>
        </ul>
      </div>

      {error && (
        <div style={styles.error}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div style={styles.authSection}>
        <h3>Authentication</h3>
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
          <div>
            <label style={styles.label}>Manual Token (if CORS blocked)</label>
            <input
              style={styles.input}
              type="text"
              placeholder="Paste access token"
              onChange={(e) => {
                if (e.target.value) {
                  setAccessToken(e.target.value);
                  setTokenExpiry(Date.now() + (540 * 1000));
                  setAuthenticated(true);
                }
              }}
              disabled={authenticated}
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
          {authenticated ? 'Authenticated' : 'Authenticate'}
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
        {loading ? 'Processing...' : 'Analyze Summer Biomass'}
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
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div style={styles.loading}>
          <p>Processing satellite imagery...</p>
          <p style={{ fontSize: '14px', color: '#999' }}>{processingStatus}</p>
        </div>
      )}

      {biomassData.length > 0 && (
        <div style={styles.chartContainer}>
          <h2>Summer Biomass Trends</h2>
          
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
                yAxisId="vi" 
                orientation="right" 
                label={{ value: 'Vegetation Index', angle: 90, position: 'insideRight' }} 
                domain={[-1, 1]}
              />
              <Tooltip />
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
                yAxisId="vi"
                type="monotone"
                dataKey="vegetationIndex"
                stroke="#8884d8"
                name="Vegetation Index"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>

          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
            <h4>Technical Details</h4>
            <p style={{ fontSize: '14px', margin: '5px 0' }}>
              <strong>Algorithm:</strong> Vegetation Index = (Green - Red) / (Green + Red)
            </p>
            <p style={{ fontSize: '14px', margin: '5px 0' }}>
              <strong>Biomass Estimation:</strong> Linear mapping from VI to species-specific biomass range
            </p>
            <p style={{ fontSize: '14px', margin: '5px 0' }}>
              <strong>Data Points:</strong> {biomassData.length} summer observations
            </p>
            <p style={{ fontSize: '14px', margin: '5px 0' }}>
              <strong>Average Biomass:</strong> {(biomassData.reduce((sum, d) => sum + d.biomass, 0) / biomassData.length).toFixed(1)} tons/ha
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ForestBiomassApp;