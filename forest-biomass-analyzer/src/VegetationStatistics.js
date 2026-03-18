import React, { useState, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LineChart, Line
} from 'recharts';

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

const ndviBarColor = (lowEdge) => {
  if (lowEdge < 0.2) return '#ef4444';
  if (lowEdge < 0.4) return '#eab308';
  if (lowEdge < 0.6) return '#86efac';
  if (lowEdge < 0.8) return '#22c55e';
  return colors.darkGreen;
};

const vegClasses = [
  { label: 'Bare/Water', max: 0.2, color: '#ef4444' },
  { label: 'Sparse', max: 0.4, color: '#eab308' },
  { label: 'Moderate', max: 0.6, color: '#86efac' },
  { label: 'Dense', max: 0.8, color: '#22c55e' },
  { label: 'Very Dense', max: Infinity, color: colors.darkGreen },
];

const styles = {
  container: {
    padding: 24,
    backgroundColor: colors.offWhite,
    minHeight: 400,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: colors.gray900,
    margin: 0,
  },
  subtitle: {
    fontSize: 14,
    color: colors.gray500,
    margin: '4px 0 24px 0',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 20,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
    padding: 20,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: colors.gray700,
    margin: '0 0 16px 0',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
    color: colors.gray500,
    fontSize: 16,
  },
  select: {
    padding: '6px 10px',
    borderRadius: 6,
    border: `1px solid ${colors.gray200}`,
    fontSize: 13,
    color: colors.gray700,
    marginBottom: 12,
    outline: 'none',
  },
  legendRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: colors.gray700,
  },
  legendSwatch: (color) => ({
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: color,
    flexShrink: 0,
  }),
  stackedBarOuter: {
    display: 'flex',
    borderRadius: 6,
    overflow: 'hidden',
    height: 36,
    width: '100%',
  },
  percentLabel: {
    fontSize: 12,
    color: colors.gray500,
    marginTop: 4,
  },
};

function VegetationStatistics({ data, loading }) {
  const [selectedDateIdx, setSelectedDateIdx] = useState(0);

  const entries = useMemo(() => {
    if (!data || !data.data) return [];
    return data.data;
  }, [data]);

  const dates = useMemo(() =>
    entries.map((e) => e.interval.from.slice(0, 10)),
    [entries]
  );

  // --- Percentile band data ---
  const percentileData = useMemo(() =>
    entries.map((e) => {
      const b0 = e.outputs.ndvi.bands.B0;
      const p = b0.percentiles || (b0.stats && b0.stats.percentiles) || {};
      return {
        date: e.interval.from.slice(0, 10),
        p5: p['5.0'],
        p25: p['25.0'],
        p50: p['50.0'],
        p75: p['75.0'],
        p95: p['95.0'],
      };
    }),
    [entries]
  );

  // --- StDev trend data ---
  const stDevData = useMemo(() =>
    entries.map((e) => {
      const date = e.interval.from.slice(0, 10);
      const ndviSD = e.outputs.ndvi.bands.B0.stats.stDev;
      const ndmiSD = e.outputs.ndmi ? e.outputs.ndmi.bands.B0.stats.stDev : null;
      const ndreSD = e.outputs.ndre ? e.outputs.ndre.bands.B0.stats.stDev : null;
      return { date, NDVI: ndviSD, NDMI: ndmiSD, NDRE: ndreSD };
    }),
    [entries]
  );

  // --- Histogram data for selected date ---
  const histogramData = useMemo(() => {
    const bins = entries[selectedDateIdx]?.outputs?.ndvi?.bands?.B0?.histogram?.bins;
    if (!bins) return [];
    return bins.map((b) => ({
      range: `${b.lowEdge.toFixed(2)}`,
      count: b.count,
      lowEdge: b.lowEdge,
      highEdge: b.highEdge,
    }));
  }, [entries, selectedDateIdx]);

  // --- Vegetation class breakdown for selected date ---
  const vegBreakdown = useMemo(() => {
    const bins = entries[selectedDateIdx]?.outputs?.ndvi?.bands?.B0?.histogram?.bins;
    if (!bins) return [];
    const totals = vegClasses.map((vc) => ({ ...vc, count: 0 }));
    let total = 0;
    for (const bin of bins) {
      const mid = (bin.lowEdge + bin.highEdge) / 2;
      total += bin.count;
      for (const t of totals) {
        if (mid < t.max) { t.count += bin.count; break; }
      }
    }
    return totals.map((t) => ({
      ...t,
      pct: total > 0 ? (t.count / total) * 100 : 0,
    }));
  }, [entries, selectedDateIdx]);

  if (loading) {
    return (
      <div style={styles.loading}>
        Loading vegetation statistics...
      </div>
    );
  }

  if (!data || !entries.length) return null;

  const dateRange = `${dates[0]} to ${dates[dates.length - 1]}`;

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `vegetation_statistics_${dates[0]}_${dates[dates.length - 1]}.json`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={styles.title}>Vegetation Statistics Dashboard</h2>
          <p style={{ ...styles.subtitle, marginTop: 4 }}>{dateRange}</p>
        </div>
        <button
          onClick={handleDownload}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            background: '#6366f1',
            color: colors.white,
          }}
        >
          Download Statistics
        </button>
      </div>

      <div style={styles.grid}>
        {/* 1. Percentile Band Chart */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>NDVI Percentile Distribution Over Time</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={percentileData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.gray200} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: colors.gray500 }} />
              <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: colors.gray500 }} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: `1px solid ${colors.gray200}` }}
                formatter={(value, name) => [typeof value === 'number' ? value.toFixed(3) : value, name]}
              />
              {/* P5-P25 light band */}
              <Area
                type="monotone" dataKey="p5" stackId="bg" stroke="none"
                fill="transparent" activeDot={false} name="P5"
              />
              <Area
                type="monotone" dataKey="p25" stackId="lower" stroke="none"
                fill={colors.paleGreen} fillOpacity={0.3} activeDot={false} name="P25"
                baseValue="dataMin"
              />
              {/* P25-P75 main band */}
              <Area
                type="monotone" dataKey="p75" stroke="none"
                fill={colors.lightGreen} fillOpacity={0.4} name="P75"
                baseValue="dataMin"
              />
              <Area
                type="monotone" dataKey="p25" stroke="none"
                fill={colors.white} fillOpacity={1} name=""
                baseValue="dataMin"
                legendType="none"
              />
              {/* P75-P95 light band */}
              <Area
                type="monotone" dataKey="p95" stroke="none"
                fill={colors.paleGreen} fillOpacity={0.3} name="P95"
                baseValue="dataMin"
              />
              <Area
                type="monotone" dataKey="p75" stroke="none"
                fill={colors.white} fillOpacity={1} name=""
                baseValue="dataMin"
                legendType="none"
              />
              {/* P50 median line */}
              <Area
                type="monotone" dataKey="p50" stroke={colors.medGreen}
                strokeWidth={2} fill="none" name="P50 (Median)"
                dot={{ r: 3, fill: colors.medGreen }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* 2. Standard Deviation Trend */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Vegetation Index Variability</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={stDevData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.gray200} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: colors.gray500 }} />
              <YAxis tick={{ fontSize: 11, fill: colors.gray500 }} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: `1px solid ${colors.gray200}` }}
                formatter={(value, name) => [typeof value === 'number' ? value.toFixed(4) : value, `${name} StDev`]}
              />
              <Line
                type="monotone" dataKey="NDVI" stroke={colors.medGreen}
                strokeWidth={2} dot={{ r: 3 }} name="NDVI"
              />
              <Line
                type="monotone" dataKey="NDMI" stroke="#3b82f6"
                strokeWidth={2} dot={{ r: 3 }} name="NDMI"
              />
              <Line
                type="monotone" dataKey="NDRE" stroke="#f59e0b"
                strokeWidth={2} dot={{ r: 3 }} name="NDRE"
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 3. NDVI Histogram */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>NDVI Pixel Distribution</h3>
          <select
            style={styles.select}
            value={selectedDateIdx}
            onChange={(e) => setSelectedDateIdx(Number(e.target.value))}
          >
            {dates.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={histogramData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.gray200} />
              <XAxis dataKey="range" tick={{ fontSize: 10, fill: colors.gray500 }} />
              <YAxis tick={{ fontSize: 11, fill: colors.gray500 }} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: `1px solid ${colors.gray200}` }}
                formatter={(value) => [value.toLocaleString(), 'Pixels']}
                labelFormatter={(label) => `NDVI ${label}`}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {histogramData.map((entry, idx) => (
                  <Cell key={idx} fill={ndviBarColor(entry.lowEdge)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 4. Vegetation Class Breakdown */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Vegetation Density Classes</h3>
          <select
            style={{ ...styles.select, marginBottom: 16 }}
            value={selectedDateIdx}
            onChange={(e) => setSelectedDateIdx(Number(e.target.value))}
          >
            {dates.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
          <div style={styles.stackedBarOuter}>
            {vegBreakdown.map((vc) =>
              vc.pct > 0 ? (
                <div
                  key={vc.label}
                  style={{
                    width: `${vc.pct}%`,
                    backgroundColor: vc.color,
                    height: '100%',
                    transition: 'width 0.3s ease',
                  }}
                  title={`${vc.label}: ${vc.pct.toFixed(1)}%`}
                />
              ) : null
            )}
          </div>
          <div style={styles.legendRow}>
            {vegBreakdown.map((vc) => (
              <div key={vc.label} style={styles.legendItem}>
                <div style={styles.legendSwatch(vc.color)} />
                <span>{vc.label}: {vc.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <p style={styles.percentLabel}>
            Based on {entries[selectedDateIdx]
              ? entries[selectedDateIdx].outputs.ndvi.bands.B0.stats.sampleCount.toLocaleString()
              : 0} sampled pixels
          </p>
        </div>
      </div>
    </div>
  );
}

export default VegetationStatistics;
