import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import {
  estimateTimberValue,
  projectForestValue,
  findOptimalHarvest,
  projectHarvestCycle,
  biomassToCarbon,
  projectCarbonStock,
  compareScenarios,
  estimateCarbonCreditValue,
  EU_ETS_PRICE_PER_TON
} from './carbonCalculation';
import {
  assessCertificationEligibility,
  estimateAdditionalityGap,
  calculateCertificationROI,
  calculateGroupViability,
  VOLUNTARY_CREDIT_PRICE
} from './carbonCertification';

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

  const carbonStock = useMemo(() => {
    if (!biomassData || biomassData.length === 0) return null;
    const latestBiomass = biomassData[biomassData.length - 1].biomass;
    return biomassToCarbon(latestBiomass, forestType);
  }, [biomassData, forestType]);

  const carbonProjection = useMemo(() => {
    if (!biomassData || biomassData.length === 0) return null;
    const latestBiomass = biomassData[biomassData.length - 1].biomass;
    const points = projectCarbonStock(latestBiomass, forestType, forestAge, areaHectares, 30);
    const annualSeqRate = points.length > 1 ? points[1].annualSequestration : 0;
    return { points, annualSeqRate };
  }, [biomassData, forestType, forestAge, areaHectares]);

  const creditValue = useMemo(() => {
    if (!carbonStock) return null;
    return estimateCarbonCreditValue(carbonStock.co2eTons * areaHectares);
  }, [carbonStock, areaHectares]);

  const scenarioData = useMemo(() => {
    if (!biomassData || biomassData.length === 0) return null;
    const latestBiomass = biomassData[biomassData.length - 1].biomass;
    return compareScenarios(latestBiomass, forestType, forestAge, areaHectares);
  }, [biomassData, forestType, forestAge, areaHectares]);

  const scenarioChartData = useMemo(() => {
    if (!scenarioData) return [];
    return scenarioData.continueGrowing.data.map((d, i) => ({
      year: d.year,
      continueGrowing: parseFloat(d.co2ePerHa.toFixed(1)),
      harvestReplant: parseFloat(scenarioData.harvestReplant.data[i].co2ePerHa.toFixed(1)),
      optimal: parseFloat(scenarioData.optimal.data[i].co2ePerHa.toFixed(1))
    }));
  }, [scenarioData]);

  // Carbon Certification calculations
  const certificationData = useMemo(() => {
    if (!scenarioData) return null;

    const eligibility = assessCertificationEligibility(forestType, forestAge, areaHectares, 70);
    const additionality = estimateAdditionalityGap(scenarioData);
    const groupViability = calculateGroupViability(areaHectares);

    let roi = null;
    if (additionality && additionality.additionalityPerYear > 0) {
      roi = calculateCertificationROI(additionality.additionalityPerYear, areaHectares);
    }

    return { eligibility, additionality, roi, groupViability };
  }, [scenarioData, forestType, forestAge, areaHectares]);

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

      {/* Carbon Stock Cards */}
      {carbonStock && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px', marginTop: '20px' }}>
          <div style={cardStyle}>
            <div style={{ ...cardLabelStyle, color: '#27ae60', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>Carbon Stock <InfoButton id="carbonStock" showInfo={showInfo} setShowInfo={setShowInfo}>
              Total CO2 equivalent stored per hectare, calculated using IPCC Tier 1 methodology. Above-ground = biomass × 0.5 (carbon fraction) × 3.67 (CO2/C ratio). Below-ground = above-ground × root:shoot ratio (pine/fir 0.29, birch/aspen 0.24). Soil carbon from Finnish averages (Luke): pine 70, fir 85, birch 55, aspen 50 t C/ha.
            </InfoButton></div>
            <div style={{ ...cardValueStyle, color: '#27ae60' }}>
              {carbonStock.co2eTons.toFixed(1)} t CO2e/ha
            </div>
            <div style={cardSubStyle}>Above: {carbonStock.breakdown.aboveGround.toFixed(0)} / Below: {carbonStock.breakdown.belowGround.toFixed(0)} / Soil: {carbonStock.breakdown.soil.toFixed(0)}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ ...cardLabelStyle, color: '#27ae60', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>Annual Sequestration <InfoButton id="annualSeq" showInfo={showInfo} setShowInfo={setShowInfo}>
              Net CO2 absorbed per hectare per year, derived from the projected carbon stock curve. This is the difference in total CO2e stock between consecutive years. Young, fast-growing forests sequester more; old forests near maximum biomass sequester less.
            </InfoButton></div>
            <div style={{ ...cardValueStyle, color: '#27ae60' }}>
              {carbonProjection ? carbonProjection.annualSeqRate.toFixed(1) : '—'} t CO2e/ha/yr
            </div>
            <div style={cardSubStyle}>Total: {carbonProjection ? (carbonProjection.annualSeqRate * areaHectares).toFixed(1) : '—'} t CO2e/yr</div>
          </div>
          <div style={cardStyle}>
            <div style={{ ...cardLabelStyle, color: '#27ae60', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>Carbon Credit Value <InfoButton id="carbonCredit" showInfo={showInfo} setShowInfo={setShowInfo}>
              Estimated market value of the total CO2e stored across the entire forest area. Calculated as total CO2e tons × EU ETS price (€{EU_ETS_PRICE_PER_TON}/t, 2024 average). This is a theoretical value — actual carbon credit monetization requires certification (e.g., Verra VCS, Gold Standard) and additionality proof.
            </InfoButton></div>
            <div style={{ ...cardValueStyle, color: '#27ae60' }}>
              {creditValue ? `€${creditValue.totalValue.toFixed(0)}` : '—'}
            </div>
            <div style={cardSubStyle}>at €{EU_ETS_PRICE_PER_TON}/t CO2 (EU ETS)</div>
            <div style={cardSubStyle}>€{carbonStock ? (carbonStock.co2eTons * EU_ETS_PRICE_PER_TON).toFixed(0) : '0'}/ha</div>
          </div>
        </div>
      )}

      {/* Carbon Sequestration Scenarios Chart */}
      {scenarioData && scenarioChartData.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h5 style={{ margin: '0 0 5px 0', color: '#333', display: 'flex', alignItems: 'center', gap: '6px' }}>Carbon Sequestration Scenarios (t CO2e/ha) <InfoButton id="carbonScenarios" showInfo={showInfo} setShowInfo={setShowInfo}>
            Three 30-year management scenarios compared by carbon stock per hectare. "Continue Growing" = no harvest, forest grows towards maximum biomass. "Harvest + Replant" = clearcut now, replant at age 0. "Optimal" = harvest when annual sequestration drops below 0.5 t CO2e/ha/yr, then replant. Carbon stock includes above-ground, below-ground, and soil pools.
          </InfoButton></h5>
          <p style={{ fontSize: '11px', color: '#666', margin: '0 0 10px 0' }}>
            30-year carbon stock projection under different management strategies.
            Continue: <strong>{scenarioData.continueGrowing.cumulativeSequestration.toFixed(1)} t CO2e</strong> cumulative |
            Harvest+Replant: <strong>{scenarioData.harvestReplant.cumulativeSequestration.toFixed(1)} t CO2e</strong> |
            Optimal: <strong>{scenarioData.optimal.cumulativeSequestration.toFixed(1)} t CO2e</strong>
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={scenarioChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="year"
                label={{ value: 'Years from now', position: 'insideBottom', offset: -5, fontSize: 11 }}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v.toFixed(0)}`}
                label={{ value: 't CO2e/ha', angle: -90, position: 'insideLeft', fontSize: 11 }}
              />
              <Tooltip formatter={(val) => [`${Number(val).toFixed(1)} t CO2e/ha`]} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="continueGrowing" stroke="#27ae60" strokeWidth={2} dot={false} name="Continue Growing" />
              <Line type="monotone" dataKey="harvestReplant" stroke="#e74c3c" strokeWidth={2} dot={false} name="Harvest + Replant" />
              <Line type="monotone" dataKey="optimal" stroke="#3498db" strokeWidth={2} dot={false} name="Optimal" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Carbon Certification Pathway */}
      {certificationData && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f0faf0', borderRadius: '8px', border: '1px solid #c3e6cb' }}>
          <h5 style={{ margin: '0 0 10px 0', color: '#155724', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Carbon Credit Certification Pathway
            <InfoButton id="certPathway" showInfo={showInfo} setShowInfo={setShowInfo}>
              Converts the theoretical carbon credit value above into actionable certification steps. Additionality = extra carbon sequestered by NOT harvesting vs. business-as-usual. Three schemes assessed: Verra VCS (international, 100ha min), Gold Standard (premium, 50ha min), Finnish National (small holdings, 5ha min). ROI uses voluntary market avg price of €{VOLUNTARY_CREDIT_PRICE.avg}/t CO2e.
            </InfoButton>
          </h5>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '15px' }}>
            {certificationData.additionality && (
              <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#155724', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  Additionality
                  <InfoButton id="certAdditionality" showInfo={showInfo} setShowInfo={setShowInfo}>
                    Annual extra CO2 sequestered by continuing to grow vs. harvesting now. This is what you can sell as carbon credits — the difference between your management choice and business-as-usual.
                  </InfoButton>
                </div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#27ae60', margin: '6px 0' }}>
                  {certificationData.additionality.additionalityPerYear.toFixed(2)} t/yr
                </div>
                <div style={{ fontSize: '11px', color: '#888' }}>
                  {(certificationData.additionality.additionalityPerYear * areaHectares).toFixed(1)} t CO2e/yr total
                </div>
              </div>
            )}

            {certificationData.roi && (
              <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#155724', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  ROI / Breakeven
                  <InfoButton id="certROI" showInfo={showInfo} setShowInfo={setShowInfo}>
                    20-year return on certification investment. Costs: initial audit €15,000, annual verification €5,000, registry €0.30/credit. Revenue at €{VOLUNTARY_CREDIT_PRICE.avg}/t CO2e voluntary market average.
                  </InfoButton>
                </div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: certificationData.roi.netValue >= 0 ? '#27ae60' : '#e74c3c', margin: '6px 0' }}>
                  {certificationData.roi.breakevenYear ? `Year ${certificationData.roi.breakevenYear}` : 'N/A'}
                </div>
                <div style={{ fontSize: '11px', color: '#888' }}>
                  Net 20yr: €{certificationData.roi.netValue.toFixed(0)}
                </div>
              </div>
            )}

            <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#155724', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                Group Size Needed
                <InfoButton id="certGroup" showInfo={showInfo} setShowInfo={setShowInfo}>
                  Group certification pools multiple forest owners to share audit costs. Minimum viable area is 200 ha. If your area is smaller, this shows how many owners of similar size are needed to form a group.
                </InfoButton>
              </div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#2c3e50', margin: '6px 0' }}>
                {certificationData.groupViability.viable ? '1 (Independent)' : `${certificationData.groupViability.membersNeeded} owners`}
              </div>
              <div style={{ fontSize: '11px', color: '#888' }}>
                {certificationData.groupViability.viable
                  ? `€${certificationData.groupViability.costPerHectare.toFixed(0)}/ha over 5yr`
                  : `Gap: ${certificationData.groupViability.areaGap.toFixed(0)} ha`}
              </div>
            </div>

            <div style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#155724', fontWeight: 'bold', textTransform: 'uppercase' }}>Eligible Schemes</div>
              <div style={{ fontSize: '12px', marginTop: '6px', textAlign: 'left' }}>
                {Object.values(certificationData.eligibility).map((scheme, i) => (
                  <div key={i} style={{ marginBottom: '3px' }}>
                    <span style={{
                      display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                      backgroundColor: scheme.eligible ? '#27ae60' : '#e74c3c', marginRight: '6px'
                    }} />
                    <span style={{ fontSize: '11px', color: scheme.eligible ? '#333' : '#999' }}>{scheme.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <p style={{ fontSize: '11px', color: '#666', margin: '10px 0 0 0', fontStyle: 'italic' }}>
        Timber prices are Finnish averages (Luke 2024). Values are estimates for scenario comparison — not for timber sales.
        Carbon credit values use EU ETS 2024 average price — actual credit pricing depends on certification scheme and market conditions.
      </p>
    </div>
  );
};

export default CarbonDashboard;
