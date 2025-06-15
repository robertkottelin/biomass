import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, FeatureGroup, Polygon, useMap } from 'react-leaflet';
import { Line } from 'recharts';
import { LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
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

    // Load Leaflet Draw CSS dynamically
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css';
    document.head.appendChild(link);

    // Load Leaflet Draw JS dynamically
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js';
    script.onload = () => {
      // Initialize draw control after script loads
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

      // Handle created features
      map.on(L.Draw.Event.CREATED, (e) => {
        const layer = e.layer;
        drawnItems.addLayer(layer);
        if (onCreated) {
          onCreated({ layer });
        }
      });

      // Handle deleted features
      map.on(L.Draw.Event.DELETED, (e) => {
        if (onDeleted) {
          onDeleted(e);
        }
      });
    };

    document.head.appendChild(script);

    // Cleanup
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
  const [startDate, setStartDate] = useState('1980-01-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [biomassData, setBiomassData] = useState([]);
  const [selectedForestIndex, setSelectedForestIndex] = useState(0);
  const [geometryUtilLoaded, setGeometryUtilLoaded] = useState(false);
  const mapRef = useRef();

  // Load GeometryUtil on mount
  useEffect(() => {
    loadGeometryUtil().then(() => setGeometryUtilLoaded(true));
  }, []);

  // Forest growth parameters (tons/hectare/year)
  const forestParams = {
    pine: { maxBiomass: 350, growthRate: 0.08, harvestAge: 80 },
    fir: { maxBiomass: 400, growthRate: 0.075, harvestAge: 90 },
    birch: { maxBiomass: 250, growthRate: 0.12, harvestAge: 60 },
    aspen: { maxBiomass: 200, growthRate: 0.15, harvestAge: 50 }
  };

  // Simulate NDVI based on biomass
  const biomassToNDVI = (biomass, maxBiomass) => {
    return Math.min(0.85, 0.2 + (biomass / maxBiomass) * 0.65);
  };

  // Calculate biomass using logistic growth model
  const calculateBiomass = (age, forestType) => {
    const params = forestParams[forestType];
    const K = params.maxBiomass;
    const r = params.growthRate;
    return K / (1 + Math.exp(-r * (age - params.harvestAge / 2)));
  };

  // Generate historical data
  const generateBiomassData = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const data = [];
    
    for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
      const age = year - start.getFullYear();
      const biomass = calculateBiomass(age, forestType);
      const ndvi = biomassToNDVI(biomass, forestParams[forestType].maxBiomass);
      
      // Add seasonal variation
      for (let month = 0; month < 12; month += 3) {
        const seasonalFactor = 1 + 0.2 * Math.sin((month / 12) * 2 * Math.PI);
        data.push({
          date: `${year}-${String(month + 1).padStart(2, '0')}`,
          year: year,
          biomass: biomass * seasonalFactor,
          ndvi: ndvi * seasonalFactor,
          age: age
        });
      }
    }
    
    setBiomassData(data);
  };

  useEffect(() => {
    if (selectedForests.length > 0) {
      generateBiomassData();
    }
  }, [selectedForests, forestType, startDate, endDate]);

  const handleCreated = (e) => {
    const layer = e.layer;
    const coords = layer.getLatLngs()[0];
    
    // Fallback area calculation if GeometryUtil not loaded
    let area;
    if (window.L && window.L.GeometryUtil && window.L.GeometryUtil.geodesicArea) {
      area = L.GeometryUtil.geodesicArea(coords) / 10000; // Convert to hectares
    } else {
      // Simple approximation using Haversine formula
      const R = 6371000; // Earth radius in meters
      let totalArea = 0;
      
      for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i + 1];
        const p3 = coords[i + 2] || coords[0];
        
        // Triangle area approximation
        const a = Math.sqrt(Math.pow(p2.lat - p1.lat, 2) + Math.pow(p2.lng - p1.lng, 2)) * 111000;
        const b = Math.sqrt(Math.pow(p3.lat - p2.lat, 2) + Math.pow(p3.lng - p2.lng, 2)) * 111000;
        const c = Math.sqrt(Math.pow(p1.lat - p3.lat, 2) + Math.pow(p1.lng - p3.lng, 2)) * 111000;
        const s = (a + b + c) / 2;
        totalArea += Math.sqrt(s * (s - a) * (s - b) * (s - c));
      }
      area = totalArea / 10000; // Convert to hectares
    }
    
    const newForest = {
      id: Date.now(),
      coords: coords.map(c => [c.lat, c.lng]),
      area: area.toFixed(2),
      type: forestType,
      plantingYear: new Date(startDate).getFullYear()
    };
    
    console.log('Forest created:', newForest); // Debug logging
    setSelectedForests(prev => [...prev, newForest]);
  };

  const handleDeleted = (e) => {
    // Simple implementation - remove last forest
    setSelectedForests(forests => forests.slice(0, -1));
    if (selectedForestIndex >= selectedForests.length - 1) {
      setSelectedForestIndex(Math.max(0, selectedForests.length - 2));
    }
  };

  const getHarvestRecommendation = () => {
    if (biomassData.length === 0) return null;
    
    const lastData = biomassData[biomassData.length - 1];
    const params = forestParams[forestType];
    const optimalHarvestAge = params.harvestAge;
    const currentAge = lastData.age;
    
    if (currentAge >= optimalHarvestAge) {
      return { status: 'ready', message: 'Forest is ready for harvest' };
    } else {
      const yearsToHarvest = optimalHarvestAge - currentAge;
      const harvestYear = new Date().getFullYear() + yearsToHarvest;
      return { 
        status: 'growing', 
        message: `Recommended harvest in ${yearsToHarvest} years (${harvestYear})` 
      };
    }
  };

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
    mapContainer: {
      height: '700px',
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
    harvestReady: {
      backgroundColor: '#d4edda',
      color: '#155724',
      padding: '10px 15px',
      borderRadius: '4px',
      marginTop: '10px'
    },
    harvestGrowing: {
      backgroundColor: '#fff3cd',
      color: '#856404',
      padding: '10px 15px',
      borderRadius: '4px',
      marginTop: '10px'
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Forest Biomass Analysis System</h1>
      
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
        
        <div>
          <label style={styles.label}>Planting Date</label>
          <input 
            style={styles.input}
            type="date" 
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        
        <div>
          <label style={styles.label}>Analysis End Date</label>
          <input 
            style={styles.input}
            type="date" 
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div style={styles.mapContainer}>
        <MapContainer
          center={[62.0, 25.0]} // Finland coordinates
          zoom={6}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution='&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
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

      {selectedForests.length > 0 && (
        <>
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
                <p><strong>Planted:</strong> {forest.plantingYear}</p>
              </div>
            ))}
          </div>

          <div style={styles.chartContainer}>
            <h2>Biomass Growth Analysis</h2>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={biomassData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="year" 
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(year) => year}
                />
                <YAxis yAxisId="biomass" orientation="left" />
                <YAxis yAxisId="ndvi" orientation="right" />
                <Tooltip />
                <Legend />
                <Line 
                  yAxisId="biomass"
                  type="monotone" 
                  dataKey="biomass" 
                  stroke="#82ca9d" 
                  name="Biomass (tons/ha)"
                  strokeWidth={2}
                />
                <Line 
                  yAxisId="ndvi"
                  type="monotone" 
                  dataKey="ndvi" 
                  stroke="#8884d8" 
                  name="NDVI"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
            
            {getHarvestRecommendation() && (
              <div style={
                getHarvestRecommendation().status === 'ready' 
                  ? styles.harvestReady 
                  : styles.harvestGrowing
              }>
                <strong>Harvest Recommendation:</strong> {getHarvestRecommendation().message}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ForestBiomassApp;