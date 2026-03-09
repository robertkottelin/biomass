import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import {
  estimateTimberValue,
  projectForestValue,
  findOptimalHarvest,
  projectHarvestCycle
} from './carbonCalculation';

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

const CarbonDashboard = ({ biomassData, forestType, forestAge, areaHectares, showInfo, setShowInfo }) => {
  const timberValue = useMemo(() => {
    if (!biomassData || biomassData.length === 0) return null;
    const latestBiomass = biomassData[biomassData.length - 1].biomass;
    return estimateTimberValue(latestBiomass, forestType, forestAge, areaHectares);
  }, [biomassData, forestType, forestAge, areaHectares]);

  const forestValueData = useMemo(() => {
    if (!biomassData || biomassData.length === 0) return null;
    const values = projectForestValue(forestType, areaHectares, 100);
    const optimal = findOptimalHarvest(forestType, areaHectares);
    const cycle = projectHarvestCycle(forestType, areaHectares, 100);
    return { values, optimal, cycle };
  }, [biomassData, forestType, areaHectares]);

  const valueChartData = useMemo(() => {
    if (!forestValueData) return [];
    const { values, cycle } = forestValueData;
    return values.map((v, i) => ({
      age: v.age,
      noHarvest: Math.round(v.timberValue),
      harvestCycle: cycle.points[i] ? Math.round(cycle.points[i].cumulativeHarvestIncome + cycle.points[i].standingTimberValue) : 0,
      standingValueCycle: cycle.points[i] ? Math.round(cycle.points[i].standingTimberValue) : 0
    }));
  }, [forestValueData]);

  if (!timberValue || !biomassData || biomassData.length === 0) {
    return null;
  }

  const cardStyle = {
    backgroundColor: '#f8f9fa',
    padding: '15px',
    borderRadius: '8px',
    border: '1px solid #e0e0e0',
    textAlign: 'center'
  };

  const cardValueStyle = {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#8b6914',
    margin: '8px 0'
  };

  const cardLabelStyle = {
    fontSize: '12px',
    color: '#666',
    fontWeight: 'bold',
    textTransform: 'uppercase'
  };

  const cardSubStyle = {
    fontSize: '11px',
    color: '#888',
    marginTop: '4px'
  };

  return (
    <div>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div style={cardStyle}>
          <div style={{ ...cardLabelStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>Timber Value <InfoButton id="timberValue" showInfo={showInfo} setShowInfo={setShowInfo}>
            Biomass (tons/ha) is converted to volume using species wood density (pine 0.42, fir 0.38, birch 0.49, aspen 0.35 t/m³). Volume is split into sawlog and pulpwood by forest age: ≤30yr = 10% sawlog, ≥60yr = 70% sawlog, linear between. Prices are Finnish averages (Luke 2024): pine sawlog €72/m³, pulpwood €32/m³. Total = (sawlog vol × sawlog price + pulpwood vol × pulpwood price) × area.
          </InfoButton></div>
          <div style={cardValueStyle}>
            {timberValue ? `€${timberValue.totalValue.toFixed(0)}` : '—'}
          </div>
          <div style={cardSubStyle}>€{timberValue ? timberValue.perHaValue.toFixed(0) : '0'}/ha</div>
          <div style={cardSubStyle}>Sawlog {timberValue ? (timberValue.sawlogFraction * 100).toFixed(0) : 0}% / Pulp {timberValue ? (timberValue.pulpwoodFraction * 100).toFixed(0) : 0}%</div>
        </div>
        <div style={cardStyle}>
          <div style={{ ...cardLabelStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>Volume <InfoButton id="volume" showInfo={showInfo} setShowInfo={setShowInfo}>
            Standing volume (m³/ha) = estimated biomass (tons/ha) divided by species basic wood density (tons/m³). This is the merchantable stem volume if all above-ground biomass were harvested.
          </InfoButton></div>
          <div style={cardValueStyle}>
            {timberValue ? `${timberValue.volumePerHa.toFixed(0)}` : '—'}
          </div>
          <div style={cardSubStyle}>m³/ha</div>
          <div style={cardSubStyle}>Total: {timberValue ? (timberValue.volumePerHa * areaHectares).toFixed(0) : '0'} m³</div>
        </div>
        <div style={cardStyle}>
          <div style={{ ...cardLabelStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>Optimal Harvest <InfoButton id="optimalHarvest" showInfo={showInfo} setShowInfo={setShowInfo}>
            Optimal rotation age is calculated using the Faustmann formula (Land Expectation Value): LEV = (timber value at age T − regeneration cost) / (e<sup>r×T</sup> − 1), where r = 3% discount rate. LEV is maximized over ages above the species minimum harvest age (pine/fir 60yr, birch 50yr, aspen 35yr). Regeneration costs: pine €1500/ha, fir €1800/ha, birch €1200/ha, aspen €800/ha.
          </InfoButton></div>
          <div style={cardValueStyle}>
            {forestValueData ? `${forestValueData.optimal.optimalAge} yr` : '—'}
          </div>
          <div style={cardSubStyle}>€{forestValueData ? forestValueData.optimal.valueAtHarvest.toFixed(0) : '0'} at harvest</div>
          <div style={cardSubStyle}>Current age: {forestAge} yr</div>
        </div>
      </div>

      {/* Forest Value Over Time */}
      {forestValueData && (
        <div style={{ marginBottom: '20px' }}>
          <h5 style={{ margin: '0 0 5px 0', color: '#333', display: 'flex', alignItems: 'center', gap: '6px' }}>Timber Value Over Time (€) <InfoButton id="timberChart" showInfo={showInfo} setShowInfo={setShowInfo}>
            "No harvest" = standing timber value if the forest grows undisturbed to each age. "Harvest cycle (total wealth)" = cumulative income from repeated harvests at the optimal rotation age plus current standing value. "Harvest cycle (standing value)" = only the current standing timber between harvests (sawtooth pattern). Vertical lines mark current age and optimal harvest age.
          </InfoButton></h5>
          <p style={{ fontSize: '11px', color: '#666', margin: '0 0 10px 0' }}>
            Timber value from planting to 100 years.
            Current age: <strong>{forestAge}yr</strong>.
            Optimal harvest age: <strong>{forestValueData.optimal.optimalAge}yr</strong> (€{forestValueData.optimal.valueAtHarvest.toFixed(0)}).
            Harvest cycle: cut every <strong>{forestValueData.cycle.cycleLength}yr</strong>, replant.
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={valueChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="age"
                label={{ value: 'Forest age (years)', position: 'insideBottom', offset: -5, fontSize: 11 }}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => v >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v}`}
              />
              <Tooltip formatter={(val) => [`€${Number(val).toLocaleString()}`]} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="noHarvest" stroke="#8b6914" strokeWidth={2} dot={false} name="No harvest (standing timber)" />
              <Line type="monotone" dataKey="harvestCycle" stroke="#e67e22" strokeWidth={2} dot={false} name="Harvest cycle (total wealth)" />
              <Line type="monotone" dataKey="standingValueCycle" stroke="#e67e22" strokeWidth={1} dot={false} strokeDasharray="2 2" name="Harvest cycle (standing value)" />
              {forestAge > 0 && forestAge <= 100 && (
                <ReferenceLine x={forestAge} stroke="#3498db" strokeWidth={2} strokeDasharray="6 3" label={{ value: `Now (${forestAge}yr)`, position: 'top', fontSize: 10, fill: '#3498db' }} />
              )}
              <ReferenceLine x={forestValueData.optimal.optimalAge} stroke="#c0392b" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: `Optimal (${forestValueData.optimal.optimalAge}yr)`, position: 'insideTopRight', fontSize: 10, fill: '#c0392b' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <p style={{ fontSize: '11px', color: '#666', margin: '10px 0 0 0', fontStyle: 'italic' }}>
        Timber prices are Finnish averages (Luke 2024). Values are estimates for scenario comparison — not for timber sales.
      </p>
    </div>
  );
};

export default CarbonDashboard;
