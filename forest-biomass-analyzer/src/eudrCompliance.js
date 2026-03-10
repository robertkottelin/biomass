// EUDR (EU Deforestation Regulation) Compliance Report Generator
// Effective Dec 2026 — every timber seller needs proof of non-deforestation

/**
 * Assess deforestation risk by computing continuity ratio from pre/post 2020 NDVI baselines.
 * EUDR reference date is December 31, 2020.
 */
export function assessDeforestationRisk(biomassData) {
  if (!biomassData || biomassData.length === 0) return null;

  // Split data around the EUDR reference date (2020-12-31)
  const pre2020 = biomassData.filter(d => d.year <= 2020);
  const post2020 = biomassData.filter(d => d.year > 2020);

  // If no pre-2020 data, we can't assess continuity
  if (pre2020.length === 0) {
    return {
      continuityRatio: null,
      riskLevel: 'Unknown',
      riskColor: '#888',
      reason: 'No pre-2021 satellite data available for baseline comparison',
      pre2020Baseline: null,
      post2020Baseline: null,
      dataPoints: { pre: 0, post: post2020.length }
    };
  }

  // Extract yearly peak NDVI for pre and post periods
  const yearlyPeakNdvi = (data) => {
    const byYear = {};
    for (const d of data) {
      if (!byYear[d.year] || d.ndvi > byYear[d.year]) {
        byYear[d.year] = d.ndvi;
      }
    }
    const peaks = Object.values(byYear);
    return peaks.length > 0 ? peaks.reduce((a, b) => a + b, 0) / peaks.length : 0;
  };

  const pre2020Baseline = yearlyPeakNdvi(pre2020);

  // If no post-2020 data, we can't confirm forest continuity
  if (post2020.length === 0) {
    return {
      continuityRatio: null,
      riskLevel: 'Unknown',
      riskColor: '#888',
      reason: 'No post-2020 satellite data available — cannot confirm forest continuity after EUDR reference date',
      pre2020Baseline,
      post2020Baseline: null,
      dataPoints: { pre: pre2020.length, post: 0 }
    };
  }

  const post2020Baseline = yearlyPeakNdvi(post2020);

  // Continuity ratio: post-2020 NDVI relative to pre-2020
  const continuityRatio = pre2020Baseline > 0
    ? (post2020Baseline / pre2020Baseline) * 100
    : 0;

  // Risk classification
  let riskLevel, riskColor;
  if (continuityRatio >= 90) {
    riskLevel = 'Negligible';
    riskColor = '#27ae60';
  } else if (continuityRatio >= 75) {
    riskLevel = 'Low';
    riskColor = '#f39c12';
  } else if (continuityRatio >= 60) {
    riskLevel = 'Standard';
    riskColor = '#e67e22';
  } else {
    riskLevel = 'High';
    riskColor = '#e74c3c';
  }

  return {
    continuityRatio,
    riskLevel,
    riskColor,
    reason: riskLevel === 'Negligible'
      ? 'Forest cover maintained above 90% of pre-2021 baseline'
      : riskLevel === 'Low'
        ? 'Minor vegetation change detected — additional documentation recommended'
        : riskLevel === 'Standard'
          ? 'Moderate vegetation change — due diligence investigation required'
          : 'Significant vegetation loss detected — enhanced due diligence required',
    pre2020Baseline,
    post2020Baseline,
    dataPoints: { pre: pre2020.length, post: post2020.length }
  };
}

/**
 * Generate a full EUDR compliance report.
 */
export function generateComplianceReport(biomassData, forestCoords, forestType, areaHectares) {
  const riskAssessment = assessDeforestationRisk(biomassData);
  if (!riskAssessment) return null;

  // Build evidence timeline from NDVI data
  const evidenceTimeline = buildEvidenceTimeline(biomassData);

  // Format geo-reference
  const geoReference = forestCoords ? formatGeoReference(forestCoords) : null;

  return {
    reportDate: new Date().toISOString().split('T')[0],
    eudrReferenceDate: '2020-12-31',
    riskAssessment,
    evidenceTimeline,
    geoReference,
    forestType,
    areaHectares,
    complianceStatus: riskAssessment.riskLevel === 'Negligible' || riskAssessment.riskLevel === 'Low'
      ? 'Compliant'
      : riskAssessment.riskLevel === 'Standard'
        ? 'Requires Investigation'
        : riskAssessment.riskLevel === 'Unknown'
          ? 'Insufficient Data'
          : 'Non-Compliant Risk',
    recommendations: generateRecommendations(riskAssessment)
  };
}

/**
 * Format polygon coordinates for EUDR compliance documents.
 */
export function formatGeoReference(coords) {
  if (!coords || !Array.isArray(coords) || coords.length === 0) return null;

  const points = coords.map(c => ({
    lat: parseFloat(c.lat || c[0]).toFixed(6),
    lng: parseFloat(c.lng || c[1]).toFixed(6)
  }));

  // Calculate centroid
  const centroid = {
    lat: (points.reduce((s, p) => s + parseFloat(p.lat), 0) / points.length).toFixed(6),
    lng: (points.reduce((s, p) => s + parseFloat(p.lng), 0) / points.length).toFixed(6)
  };

  return {
    type: 'Polygon',
    coordinates: points,
    centroid,
    coordinateSystem: 'WGS84 (EPSG:4326)'
  };
}

function buildEvidenceTimeline(biomassData) {
  if (!biomassData || biomassData.length === 0) return [];

  // Group by year, take peak NDVI per year
  const byYear = {};
  for (const d of biomassData) {
    if (!byYear[d.year] || d.ndvi > byYear[d.year].ndvi) {
      byYear[d.year] = { year: d.year, date: d.date, ndvi: d.ndvi, biomass: d.biomass };
    }
  }

  return Object.values(byYear).sort((a, b) => a.year - b.year).map(d => ({
    year: d.year,
    date: d.date,
    peakNdvi: parseFloat(d.ndvi.toFixed(4)),
    biomass: parseFloat(d.biomass.toFixed(1)),
    period: d.year <= 2020 ? 'pre-reference' : 'post-reference'
  }));
}

function generateRecommendations(riskAssessment) {
  const recs = [];
  if (riskAssessment.riskLevel === 'Unknown') {
    recs.push('Obtain historical satellite imagery (pre-2021) to establish forest baseline');
    recs.push('Request forestry authority records for the parcel');
  }
  if (riskAssessment.riskLevel === 'Negligible') {
    recs.push('Maintain satellite monitoring records for ongoing compliance');
    recs.push('Archive this report as part of due diligence documentation');
  }
  if (riskAssessment.riskLevel === 'Low') {
    recs.push('Document any known management activities (thinning, storm damage) that explain NDVI changes');
    recs.push('Obtain forestry authority confirmation of continuous forest cover');
  }
  if (riskAssessment.riskLevel === 'Standard' || riskAssessment.riskLevel === 'High') {
    recs.push('Commission independent field verification of forest cover status');
    recs.push('Obtain detailed land use change records from local forestry authority');
    recs.push('Consider delaying timber sale until compliance status is resolved');
  }
  return recs;
}
