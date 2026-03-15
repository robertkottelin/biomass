import React, { useState, useRef, useEffect, useCallback } from 'react';
import L from 'leaflet';
import api from './api';

const colors = {
  darkGreen: '#1a472a',
  medGreen: '#2d6a4f',
  lightGreen: '#40916c',
  paleGreen: '#b7e4c7',
  white: '#ffffff',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray500: '#6b7280',
};

const vizTypes = [
  { key: 'trueColor', label: 'True Color' },
  { key: 'ndviColored', label: 'NDVI Map' },
  { key: 'falseColor', label: 'False Color' },
  { key: 'ndmiMoisture', label: 'NDMI Moisture' },
];

const styles = {
  card: {
    background: colors.white,
    borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    padding: 16,
    marginBottom: 16,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: 600,
    color: colors.darkGreen,
    margin: 0,
  },
  toggleWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
  },
  checkbox: {
    accentColor: colors.medGreen,
    width: 18,
    height: 18,
    cursor: 'pointer',
  },
  toggleLabel: {
    fontSize: 13,
    color: colors.darkGreen,
    cursor: 'pointer',
    userSelect: 'none',
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: colors.gray500,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  select: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${colors.gray200}`,
    fontSize: 14,
    color: colors.darkGreen,
    background: colors.gray100,
    outline: 'none',
    cursor: 'pointer',
  },
  pillContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: (active) => ({
    padding: '6px 12px',
    borderRadius: 20,
    border: 'none',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    background: active ? colors.medGreen : colors.gray100,
    color: active ? colors.white : colors.darkGreen,
    transition: 'all 0.15s ease',
  }),
  sliderWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  slider: {
    flex: 1,
    accentColor: colors.medGreen,
    cursor: 'pointer',
  },
  sliderValue: {
    fontSize: 13,
    fontWeight: 600,
    color: colors.darkGreen,
    minWidth: 36,
    textAlign: 'right',
  },
  section: {
    marginBottom: 12,
  },
  button: (disabled) => ({
    width: '100%',
    padding: '10px 16px',
    borderRadius: 8,
    border: 'none',
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? colors.gray200 : colors.medGreen,
    color: disabled ? colors.gray500 : colors.white,
    transition: 'all 0.15s ease',
  }),
  error: {
    fontSize: 13,
    color: '#b91c1c',
    background: '#fef2f2',
    borderRadius: 8,
    padding: '8px 12px',
    marginTop: 8,
  },
  loading: {
    fontSize: 13,
    color: colors.medGreen,
    textAlign: 'center',
    padding: '8px 0',
  },
};

function coordsToBbox(coords) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [lat, lng] of coords) {
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return [west, south, east, north];
}

function coordsToGeoJSON(coords) {
  const ring = coords.map(([lat, lng]) => [lng, lat]);
  if (
    ring.length > 0 &&
    (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
  ) {
    ring.push([...ring[0]]);
  }
  return {
    type: 'Polygon',
    coordinates: [ring],
  };
}

function SatelliteImagery({ mapRef, dates: propDates, selectedForest, isDemo }) {
  const [showImagery, setShowImagery] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [vizType, setVizType] = useState('trueColor');
  const [opacity, setOpacity] = useState(80);
  const [imageryLoading, setImageryLoading] = useState(false);
  const [error, setError] = useState(null);
  const [overlayActive, setOverlayActive] = useState(false);
  const [catalogDates, setCatalogDates] = useState([]);
  const [datesLoading, setDatesLoading] = useState(false);
  const overlayRef = useRef(null);
  const blobUrlRef = useRef(null);
  const fetchedBboxRef = useRef(null);

  // Use prop dates if available, otherwise use catalog-fetched dates
  const availableDates = propDates && propDates.length > 0 ? propDates : catalogDates;

  // Fetch available dates from Catalog API when toggled on and no prop dates
  useEffect(() => {
    if (!showImagery) return;
    if (isDemo) return; // demo doesn't need catalog lookup
    if (propDates && propDates.length > 0) return; // already have dates from analysis
    if (!selectedForest || !selectedForest.coords || selectedForest.coords.length === 0) return;

    const bbox = coordsToBbox(selectedForest.coords);
    const bboxKey = bbox.join(',');

    // Don't re-fetch if bbox hasn't changed
    if (fetchedBboxRef.current === bboxKey) return;

    const fetchDates = async () => {
      setDatesLoading(true);
      setError(null);
      setCatalogDates([]);
      try {
        // Fetch last 2 years of cloud-free acquisition dates
        const now = new Date();
        const twoYearsAgo = new Date(now);
        twoYearsAgo.setFullYear(now.getFullYear() - 2);
        const dateFrom = twoYearsAgo.toISOString().split('T')[0];
        const dateTo = now.toISOString().split('T')[0];

        const data = await api.post('/api/sentinel/catalog', {
          bbox,
          datetime: `${dateFrom}T00:00:00Z/${dateTo}T23:59:59Z`,
          collections: ['sentinel-2-l2a'],
          limit: 100,
          filter: 'eo:cloud_cover < 30',
        });

        const dateSet = new Set();
        if (data.features) {
          data.features.forEach(feature => {
            if (feature.properties && feature.properties.datetime) {
              dateSet.add(new Date(feature.properties.datetime).toISOString().split('T')[0]);
            }
          });
        }
        const sorted = Array.from(dateSet).sort().reverse();
        setCatalogDates(sorted);
        if (sorted.length > 0) {
          setSelectedDate(sorted[0]);
        }
        fetchedBboxRef.current = bboxKey;
      } catch (err) {
        setError(`Failed to fetch available dates: ${err.message}`);
      } finally {
        setDatesLoading(false);
      }
    };

    fetchDates();
  }, [showImagery, selectedForest, isDemo, propDates]);

  // Sync selectedDate when availableDates changes
  useEffect(() => {
    if (availableDates.length > 0 && !availableDates.includes(selectedDate)) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates, selectedDate]);

  // Reset catalog dates when forest changes
  useEffect(() => {
    fetchedBboxRef.current = null;
    setCatalogDates([]);
  }, [selectedForest]);

  const removeOverlay = useCallback(() => {
    if (overlayRef.current && mapRef && mapRef.current) {
      try {
        mapRef.current.removeLayer(overlayRef.current);
      } catch (_) {
        // layer may already be removed
      }
      overlayRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setOverlayActive(false);
  }, [mapRef]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      removeOverlay();
    };
  }, [removeOverlay]);

  // Remove overlay when toggled off
  useEffect(() => {
    if (!showImagery) {
      removeOverlay();
    }
  }, [showImagery, removeOverlay]);

  // Update overlay opacity when slider changes
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setOpacity(opacity / 100);
    }
  }, [opacity]);

  const handleLoadImagery = async () => {
    if (!mapRef || !mapRef.current) {
      setError('Map not available.');
      return;
    }

    setImageryLoading(true);
    setError(null);
    removeOverlay();

    try {
      let response;

      if (isDemo) {
        response = await fetch('/api/forests/demo/imagery', {
          credentials: 'include',
        });
      } else {
        if (!selectedForest || !selectedForest.coords || selectedForest.coords.length === 0) {
          setError('No forest coordinates available.');
          setImageryLoading(false);
          return;
        }

        const geometry = coordsToGeoJSON(selectedForest.coords);
        const bbox = coordsToBbox(selectedForest.coords);

        response = await fetch('/api/sentinel/imagery', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            geometry,
            bbox,
            date: selectedDate,
            vizType,
          }),
        });
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Request failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      // Calculate bounds from coords
      let bounds;
      if (isDemo) {
        // Default demo bounds (Hämeenlinna pine forest)
        bounds = L.latLngBounds([60.99, 24.38], [61.01, 24.42]);
      } else {
        const [west, south, east, north] = coordsToBbox(selectedForest.coords);
        bounds = L.latLngBounds([south, west], [north, east]);
      }

      const overlay = L.imageOverlay(url, bounds, {
        opacity: opacity / 100,
        zIndex: 1000,
        interactive: false,
      });
      overlay.addTo(mapRef.current);
      overlay.bringToFront();
      overlayRef.current = overlay;
      setOverlayActive(true);
    } catch (err) {
      setError(err.message || 'Failed to load satellite imagery.');
    } finally {
      setImageryLoading(false);
    }
  };

  const canLoad = showImagery && (isDemo || (selectedForest && selectedForest.coords && selectedForest.coords.length > 0 && selectedDate));

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h4 style={styles.title}>Satellite Imagery</h4>
        <label style={styles.toggleWrapper}>
          <input
            type="checkbox"
            checked={showImagery}
            onChange={(e) => setShowImagery(e.target.checked)}
            style={styles.checkbox}
          />
          <span style={styles.toggleLabel}>Show Satellite Imagery</span>
        </label>
      </div>

      {showImagery && (
        <>
          <div style={styles.section}>
            <span style={styles.label}>Acquisition Date</span>
            {datesLoading ? (
              <div style={styles.loading}>Fetching available dates...</div>
            ) : (
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={styles.select}
                disabled={availableDates.length === 0}
              >
                {availableDates.length === 0 ? (
                  <option value="">
                    {isDemo ? 'Demo imagery' : 'No dates found — draw a polygon first'}
                  </option>
                ) : (
                  availableDates.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))
                )}
              </select>
            )}
          </div>

          <div style={styles.section}>
            <span style={styles.label}>Visualization Type</span>
            <div style={styles.pillContainer}>
              {vizTypes.map((vt) => (
                <button
                  key={vt.key}
                  onClick={() => setVizType(vt.key)}
                  style={styles.pill(vizType === vt.key)}
                >
                  {vt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.section}>
            <span style={styles.label}>Opacity</span>
            <div style={styles.sliderWrapper}>
              <input
                type="range"
                min={0}
                max={100}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                style={styles.slider}
              />
              <span style={styles.sliderValue}>{opacity}%</span>
            </div>
          </div>

          <button
            onClick={handleLoadImagery}
            disabled={!canLoad || imageryLoading}
            style={styles.button(!canLoad || imageryLoading)}
          >
            {imageryLoading ? 'Loading...' : 'Load Imagery'}
          </button>

          {imageryLoading && (
            <div style={styles.loading}>Fetching satellite imagery...</div>
          )}

          {overlayActive && (
            <div style={{ fontSize: 13, color: colors.medGreen, background: '#f0fdf4', borderRadius: 8, padding: '8px 12px', marginTop: 8 }}>
              Imagery overlay active on map. Adjust opacity above.
            </div>
          )}

          {error && (
            <div style={styles.error}>{error}</div>
          )}
        </>
      )}
    </div>
  );
}

export default SatelliteImagery;
