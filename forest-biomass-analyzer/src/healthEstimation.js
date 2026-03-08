// Forest health estimation using multi-spectral stress classification
// Maps detected stress patterns to species-specific probable causes

const vulnerabilityProfiles = {
  pine: {
    diseases: [
      { name: 'Heterobasidion root rot', stressPattern: 'gradual_decline', seasons: 'all' },
      { name: 'Diplodia tip blight', stressPattern: 'chlorophyll_loss', seasons: 'spring' }
    ],
    parasites: [
      { name: 'European pine sawfly', stressPattern: 'defoliation', seasons: 'summer' },
      { name: 'Pine bark beetle (Tomicus)', stressPattern: 'moisture_stress', seasons: 'summer' },
      { name: 'Pine weevil (Hylobius)', stressPattern: 'gradual_decline', seasons: 'all' }
    ],
    animalDamage: [
      { name: 'Moose browsing', stressPattern: 'defoliation', ageRange: [1, 30] }
    ]
  },
  fir: {
    diseases: [
      { name: 'Heterobasidion root rot', stressPattern: 'gradual_decline', seasons: 'all' },
      { name: 'Needle cast (Lophodermium)', stressPattern: 'chlorophyll_loss', seasons: 'spring' }
    ],
    parasites: [
      { name: 'Spruce bark beetle (Ips typographus)', stressPattern: 'moisture_stress', seasons: 'summer' },
      { name: 'Spruce budworm', stressPattern: 'defoliation', seasons: 'summer' }
    ],
    animalDamage: [
      { name: 'Deer bark stripping', stressPattern: 'gradual_decline', ageRange: [5, 40] }
    ]
  },
  birch: {
    diseases: [
      { name: 'Phytophthora', stressPattern: 'moisture_stress', seasons: 'all' },
      { name: 'Birch rust', stressPattern: 'chlorophyll_loss', seasons: 'summer' }
    ],
    parasites: [
      { name: 'Birch leaf miner (Fenusa)', stressPattern: 'defoliation', seasons: 'summer' }
    ],
    animalDamage: [
      { name: 'Moose/deer browsing', stressPattern: 'defoliation', ageRange: [1, 25] }
    ]
  },
  aspen: {
    diseases: [
      { name: 'Hypoxylon canker', stressPattern: 'gradual_decline', seasons: 'all' },
      { name: 'Marssonina leaf spot', stressPattern: 'chlorophyll_loss', seasons: 'summer' }
    ],
    parasites: [
      { name: 'Aspen leaf beetle', stressPattern: 'defoliation', seasons: 'summer' }
    ],
    animalDamage: [
      { name: 'Deer/elk browsing', stressPattern: 'defoliation', ageRange: [1, 20] }
    ]
  }
};

/**
 * Classify stress type from spectral index deviations relative to baselines.
 */
function classifyStress(ndvi, ndmi, ndre, baselines) {
  const STRESS_THRESHOLD = -0.10;
  const SEVERE_THRESHOLD = -0.20;

  const ndviDev = baselines.ndvi > 0 ? (ndvi - baselines.ndvi) / baselines.ndvi : 0;
  const ndmiDev = baselines.ndmi > 0 ? (ndmi - baselines.ndmi) / baselines.ndmi : 0;
  const ndreDev = baselines.ndre > 0 ? (ndre - baselines.ndre) / baselines.ndre : 0;

  const ndviStressed = ndviDev < STRESS_THRESHOLD;
  const ndmiStressed = ndmiDev < STRESS_THRESHOLD;
  const ndreStressed = ndreDev < STRESS_THRESHOLD;

  if (!ndviStressed && !ndmiStressed && !ndreStressed) {
    return { type: 'healthy', severity: 'none', description: 'No stress detected' };
  }

  const severity = ndviDev < SEVERE_THRESHOLD || ndmiDev < SEVERE_THRESHOLD
    ? 'severe' : 'moderate';

  if (ndviStressed && ndmiStressed) {
    return { type: 'moisture_stress', severity, description: 'Drought or water stress detected' };
  }
  if (ndviStressed && !ndmiStressed) {
    return { type: 'defoliation', severity, description: 'Leaf loss — possible insects or animal browsing' };
  }
  if (ndreStressed && !ndviStressed) {
    return { type: 'chlorophyll_loss', severity, description: 'Early chlorophyll degradation — possible disease onset' };
  }
  if (ndviStressed) {
    return { type: 'general_stress', severity, description: 'Vegetation stress detected' };
  }

  return { type: 'minor_stress', severity: 'low', description: 'Minor spectral anomaly' };
}

/**
 * Compute baseline values from the full time series (median of top-quartile values).
 */
function computeBaselines(data) {
  const validNdvi = data.map(d => d.ndvi).filter(v => v != null && !isNaN(v)).sort((a, b) => b - a);
  const validNdmi = data.map(d => d.ndmi).filter(v => v != null && !isNaN(v)).sort((a, b) => b - a);
  const validNdre = data.map(d => d.ndre).filter(v => v != null && !isNaN(v)).sort((a, b) => b - a);

  const topQuartile = arr => {
    const q = Math.ceil(arr.length * 0.25);
    const top = arr.slice(0, q);
    return top.length > 0 ? top.reduce((a, b) => a + b, 0) / top.length : 0;
  };

  return {
    ndvi: topQuartile(validNdvi),
    ndmi: topQuartile(validNdmi),
    ndre: topQuartile(validNdre)
  };
}

/**
 * Detect anomalous years where peak NDVI deviates >1.5 std dev from multi-year mean.
 */
function detectAnomalies(data) {
  const yearlyPeaks = {};
  for (const d of data) {
    if (!yearlyPeaks[d.year] || d.ndvi > yearlyPeaks[d.year].ndvi) {
      yearlyPeaks[d.year] = { year: d.year, date: d.date, ndvi: d.ndvi, ndmi: d.ndmi, ndre: d.ndre };
    }
  }

  const peaks = Object.values(yearlyPeaks).sort((a, b) => a.year - b.year);
  if (peaks.length < 3) return { anomalies: [], yearlyPeaks: peaks, baselineMean: 0, baselineStdDev: 0 };

  const peakVals = peaks.map(p => p.ndvi);
  const mean = peakVals.reduce((a, b) => a + b, 0) / peakVals.length;
  const stdDev = Math.sqrt(peakVals.reduce((s, v) => s + (v - mean) ** 2, 0) / peakVals.length);

  const anomalies = peaks
    .filter(p => stdDev > 0 && (p.ndvi - mean) / stdDev < -1.5)
    .map(p => ({
      year: p.year,
      date: p.date,
      peakNdvi: p.ndvi,
      expectedNdvi: mean,
      zScore: (p.ndvi - mean) / stdDev,
      severity: (p.ndvi - mean) / stdDev < -2.0 ? 'severe' : 'moderate'
    }));

  return { anomalies, yearlyPeaks: peaks, baselineMean: mean, baselineStdDev: stdDev };
}

/**
 * Detect sudden NDVI drops >15% between consecutive acquisitions in the same season.
 */
function detectDisturbanceEvents(data) {
  const events = [];
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    if (curr.year !== prev.year || prev.ndvi <= 0) continue;

    const drop = (curr.ndvi - prev.ndvi) / prev.ndvi;
    if (drop < -0.15) {
      events.push({
        date: curr.date,
        ndviBefore: prev.ndvi,
        ndviAfter: curr.ndvi,
        dropPercent: Math.abs(drop * 100).toFixed(1)
      });
    }
  }
  return events;
}

/**
 * Detect gradual multi-year decline via linear regression on yearly peak NDVI.
 */
function detectGradualDecline(yearlyPeaks) {
  if (yearlyPeaks.length < 3) return null;

  const n = yearlyPeaks.length;
  const sumX = yearlyPeaks.reduce((s, p) => s + p.year, 0);
  const sumY = yearlyPeaks.reduce((s, p) => s + p.ndvi, 0);
  const sumXY = yearlyPeaks.reduce((s, p) => s + p.year * p.ndvi, 0);
  const sumX2 = yearlyPeaks.reduce((s, p) => s + p.year * p.year, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denom;

  if (slope < -0.01) {
    return {
      slopePerYear: slope,
      totalDecline: slope * (yearlyPeaks[n - 1].year - yearlyPeaks[0].year)
    };
  }
  return null;
}

/**
 * Match detected stress pattern to probable causes for the given species and age.
 */
function matchProbableCauses(stressType, forestType, forestAge) {
  const profile = vulnerabilityProfiles[forestType];
  if (!profile) return [];

  const allThreats = [
    ...profile.diseases.map(d => ({ ...d, category: 'Disease' })),
    ...profile.parasites.map(p => ({ ...p, category: 'Parasite' })),
    ...profile.animalDamage.map(a => ({ ...a, category: 'Animal damage' }))
  ];

  return allThreats.filter(threat => {
    if (threat.stressPattern !== stressType) return false;
    if (threat.ageRange && (forestAge < threat.ageRange[0] || forestAge > threat.ageRange[1])) return false;
    return true;
  });
}

/**
 * Compute overall health score (0-100).
 */
function computeHealthScore(perAcquisitionStress, anomalies, gradualDecline) {
  let score = 100;

  // Penalize recent stress (last 5 acquisitions)
  const recent = perAcquisitionStress.slice(-5);
  const stressedRecent = recent.filter(d => d.stress.type !== 'healthy').length;
  score -= stressedRecent * 8;

  // Penalize anomalous years
  score -= anomalies.length * 10;

  // Penalize gradual decline
  if (gradualDecline) {
    score -= Math.min(30, Math.abs(gradualDecline.slopePerYear) * 1000);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Main health analysis function.
 * @param {Array} timeSeriesData - Array of acquisition results with ndvi, ndmi, ndre fields
 * @param {string} forestType - Species: 'pine', 'fir', 'birch', or 'aspen'
 * @param {number} forestAge - Current age of the forest in years
 * @returns {object|null} Health assessment or null if insufficient data
 */
export function analyzeForestHealth(timeSeriesData, forestType, forestAge) {
  if (!timeSeriesData || timeSeriesData.length < 3) return null;

  // Filter to entries that have all three indices
  const validData = timeSeriesData.filter(d =>
    d.ndvi != null && d.ndmi != null && d.ndre != null &&
    !isNaN(d.ndvi) && !isNaN(d.ndmi) && !isNaN(d.ndre)
  );
  if (validData.length < 3) return null;

  // 1. Baselines from top-quartile values
  const baselines = computeBaselines(validData);

  // 2. Per-acquisition stress classification
  const perAcquisitionStress = validData.map(d => ({
    date: d.date,
    stress: classifyStress(d.ndvi, d.ndmi, d.ndre, baselines)
  }));

  // 3. Anomaly detection on yearly peaks
  const anomalyResult = detectAnomalies(validData);

  // 4. Sudden disturbance events
  const disturbanceEvents = detectDisturbanceEvents(validData);

  // 5. Gradual decline
  const gradualDecline = detectGradualDecline(anomalyResult.yearlyPeaks);

  // 6. Current status (most recent acquisition)
  const currentStress = perAcquisitionStress[perAcquisitionStress.length - 1]?.stress;

  // 7. Probable causes for current stress and for gradual decline
  let currentProbableCauses = [];
  if (currentStress && currentStress.type !== 'healthy') {
    currentProbableCauses = matchProbableCauses(currentStress.type, forestType, forestAge);
  }
  if (gradualDecline) {
    const declineCauses = matchProbableCauses('gradual_decline', forestType, forestAge);
    for (const c of declineCauses) {
      if (!currentProbableCauses.find(e => e.name === c.name)) {
        currentProbableCauses.push(c);
      }
    }
  }

  // 8. Health score
  const healthScore = computeHealthScore(perAcquisitionStress, anomalyResult.anomalies, gradualDecline);

  let healthLabel;
  if (healthScore > 80) healthLabel = 'Good';
  else if (healthScore > 60) healthLabel = 'Fair';
  else if (healthScore > 40) healthLabel = 'Poor';
  else healthLabel = 'Critical';

  return {
    healthScore,
    healthLabel,
    currentStatus: currentStress,
    currentProbableCauses,
    anomalies: anomalyResult.anomalies,
    disturbanceEvents,
    gradualDecline,
    baselines,
    perAcquisitionStress,
    yearlyPeaks: anomalyResult.yearlyPeaks
  };
}
