// Site quality assessment from satellite data, health analysis, and vegetation statistics
// Derives a site quality index and harvest urgency adjustment from all available data sources

import { forestParams } from './dataProcessing';
import { extractYearlyPeakNdvi } from './ageEstimation';

function linearRegression(points) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const { x, y } of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export function computeSiteQualityIndex(biomassData, forestType, forestAge) {
  if (!biomassData || biomassData.length === 0 || !forestAge || forestAge < 5) return 1.0;

  const type = (forestType && forestParams[forestType]) ? forestType : 'pine';
  const params = forestParams[type];
  const yearlyPeaks = extractYearlyPeakNdvi(biomassData);

  if (yearlyPeaks.length < 2) return 1.0;

  const observedMean = yearlyPeaks.reduce((s, p) => s + p.peakNdvi, 0) / yearlyPeaks.length;
  const expectedNdvi = params.ndviSaturation * (1 - Math.exp(-params.growthRate * forestAge));

  if (expectedNdvi <= 0) return 1.0;

  const sqi = observedMean / expectedNdvi;
  return Math.max(0.6, Math.min(1.5, sqi));
}

export function computeHealthAdjustment(healthEstimate) {
  if (!healthEstimate || healthEstimate.healthScore == null) return 0;

  let urgency = 0;

  if (healthEstimate.healthScore < 40) {
    urgency += 8;
  } else if (healthEstimate.healthScore < 60) {
    urgency += 4;
  }

  if (healthEstimate.gradualDecline) {
    const slope = Math.abs(healthEstimate.gradualDecline.slopePerYear || 0);
    urgency += Math.min(5, slope * 300);
  }

  if (healthEstimate.disturbanceEvents && healthEstimate.disturbanceEvents.length > 0) {
    urgency += 3;
  }

  if (healthEstimate.currentProbableCauses && healthEstimate.currentProbableCauses.length > 0) {
    const causes = healthEstimate.currentProbableCauses.map(c =>
      (typeof c === 'string' ? c : c.cause || '').toLowerCase()
    );
    if (causes.some(c => c.includes('bark beetle') || c.includes('root rot'))) {
      urgency += 5;
    }
  }

  return urgency;
}

export function computeGrowthVigor(biomassData) {
  if (!biomassData || biomassData.length === 0) return { slope: 0, urgency: 0 };

  const yearlyPeaks = extractYearlyPeakNdvi(biomassData);
  const recent = yearlyPeaks.slice(-5);

  if (recent.length < 2) return { slope: 0, urgency: 0 };

  const points = recent.map((p, i) => ({ x: i, y: p.peakNdvi }));
  const { slope } = linearRegression(points);

  let urgency = 0;
  if (slope < 0) {
    urgency = Math.min(5, Math.abs(slope) * 200);
  }

  return { slope, urgency };
}

export function computeObservedBiomassGrowth(biomassData, forestType) {
  if (!biomassData || biomassData.length < 6) return null;

  const type = (forestType && forestParams[forestType]) ? forestType : 'pine';
  const params = forestParams[type];

  // === Method 1: Biomass-based growth (matches what the UI displays) ===
  // Group by year, take peak biomass per year (same logic as extractYearlyPeakNdvi but for biomass)
  const biomassByYear = {};
  for (const d of biomassData) {
    const year = d.year;
    if (year == null || d.biomass == null) continue;
    if (!biomassByYear[year] || d.biomass > biomassByYear[year]) {
      biomassByYear[year] = d.biomass;
    }
  }
  const yearlyBiomass = Object.entries(biomassByYear)
    .map(([year, peakBiomass]) => ({ year: parseInt(year), peakBiomass }))
    .sort((a, b) => a.year - b.year);

  let biomassGrowthRate = 0;
  if (yearlyBiomass.length >= 2) {
    const bPoints = yearlyBiomass.map((p, i) => ({ x: i, y: p.peakBiomass }));
    const { slope } = linearRegression(bPoints);
    biomassGrowthRate = slope; // tons/ha/year directly
  }

  // === Method 2: NDVI-based growth (age-independent cross-check) ===
  const yearlyPeaks = extractYearlyPeakNdvi(biomassData);
  if (yearlyPeaks.length < 2) return null;

  const ndviPoints = yearlyPeaks.map((p, i) => ({ x: i, y: p.peakNdvi }));
  const { slope: ndviSlope } = linearRegression(ndviPoints);
  const ndviGrowthRate = (params.maxBiomass / params.ndviSaturation) * ndviSlope;

  // Use the maximum of both methods: biomass-based captures the full growth signal
  // including age-model contribution (which IS real growth the user sees), while
  // NDVI-based is age-independent and works when biomass data is sparse
  const annualGrowthRate = Math.max(biomassGrowthRate, ndviGrowthRate);

  // NDVI-based biomass at start and end (age-independent, for projection baseline)
  const firstNdvi = yearlyPeaks[0].peakNdvi;
  const lastNdvi = yearlyPeaks[yearlyPeaks.length - 1].peakNdvi;
  const ndviBiomassFirst = params.maxBiomass * Math.min(1, firstNdvi / params.ndviSaturation);
  const ndviBiomassLast = params.maxBiomass * Math.min(1, lastNdvi / params.ndviSaturation);

  // Check for stagnation/decline: if biomass hasn't grown over last 3+ years, flag it
  let declineUrgency = 0;
  if (yearlyBiomass.length >= 3) {
    const recent3 = yearlyBiomass.slice(-3);
    const recentPoints = recent3.map((p, i) => ({ x: i, y: p.peakBiomass }));
    const { slope: recentSlope } = linearRegression(recentPoints);
    if (recentSlope <= 0) {
      declineUrgency = 5;
    }
  }

  return {
    annualGrowthRate,    // tons/ha/year (max of biomass-based and NDVI-based)
    biomassGrowthRate,   // tons/ha/year from biomass time series directly
    ndviGrowthRate,      // tons/ha/year from NDVI trend (age-independent)
    ndviSlope,           // raw NDVI change per year
    latestNdvi: lastNdvi, // raw latest peak NDVI value (for health-based harvest delay)
    years: yearlyPeaks.length,
    latestNdviBiomass: ndviBiomassLast,
    earliestNdviBiomass: ndviBiomassFirst,
    declineUrgency       // extra urgency if recent biomass is flat/declining
  };
}

export function computeMoistureStress(biomassData, vegetationStats) {
  if (!biomassData || biomassData.length === 0) return { stressRatio: 0, urgency: 0 };

  let urgency = 0;

  // Count acquisitions with NDMI < -0.1
  const ndmiValues = biomassData.filter(d => d.ndmi != null);
  const stressCount = ndmiValues.filter(d => d.ndmi < -0.1).length;
  const stressRatio = ndmiValues.length > 0 ? stressCount / ndmiValues.length : 0;

  if (stressRatio > 0.4) {
    urgency += 3;
  }

  // Check vegetation stats for NDMI P25 trend
  if (vegetationStats && vegetationStats.data && vegetationStats.data.length >= 3) {
    const ndmiP25Values = vegetationStats.data
      .filter(d => d.outputs?.ndmi?.bands?.B0?.stats?.percentiles?.['25.0'] != null)
      .map((d, i) => ({
        x: i,
        y: d.outputs.ndmi.bands.B0.stats.percentiles['25.0']
      }));

    if (ndmiP25Values.length >= 3) {
      const { slope } = linearRegression(ndmiP25Values);
      if (slope < -0.01) {
        urgency += 2;
      }
    }
  }

  return { stressRatio, urgency };
}

export function generateInsights(factors, forestType, forestAge) {
  const insights = [];

  // Site quality insights
  const sqi = factors.siteQuality.value;
  if (sqi > 1.1) {
    insights.push({ type: 'positive', text: `Growth vigor above average — site quality index ${sqi.toFixed(2)}×` });
  } else if (sqi < 0.85) {
    insights.push({ type: 'warning', text: `Below-average growth for ${forestType} at age ${forestAge} — site quality index ${sqi.toFixed(2)}×` });
  } else {
    insights.push({ type: 'info', text: `Site quality near expected for ${forestType} at age ${forestAge} (${sqi.toFixed(2)}×)` });
  }

  // Health insights
  if (factors.healthAdjustment.value > 5) {
    insights.push({ type: 'critical', text: `Health concerns suggest harvesting ${Math.round(factors.healthAdjustment.value)} years earlier` });
  } else if (factors.healthAdjustment.value > 0) {
    insights.push({ type: 'warning', text: `Minor health concerns — harvest timing adjusted by ${Math.round(factors.healthAdjustment.value)} years` });
  }

  // Growth vigor insights
  const vigorSlope = factors.growthVigor.value;
  if (vigorSlope < -0.01) {
    insights.push({ type: 'warning', text: `Declining NDVI trend (${(vigorSlope * 1000).toFixed(1)}/1000 per year) — canopy may be deteriorating` });
  } else if (vigorSlope > 0.01) {
    insights.push({ type: 'positive', text: `Increasing NDVI trend — forest is actively growing` });
  }

  // Biomass growth insights (from observed satellite data)
  if (factors.biomassGrowth && factors.biomassGrowth.value > 3) {
    insights.push({ type: 'positive', text: `Actively gaining ${factors.biomassGrowth.value.toFixed(1)} tons/ha/year biomass — strong growth supports delayed harvest` });
  } else if (factors.biomassGrowth && factors.biomassGrowth.value < -1) {
    insights.push({ type: 'warning', text: `Losing ${Math.abs(factors.biomassGrowth.value).toFixed(1)} tons/ha/year biomass — declining productivity` });
  }

  // Moisture stress insights
  if (factors.moistureStress.value > 0.4) {
    insights.push({ type: 'warning', text: `${(factors.moistureStress.value * 100).toFixed(0)}% of observations show moisture stress (NDMI < -0.1)` });
  } else if (factors.moistureStress.value === 0) {
    insights.push({ type: 'positive', text: 'No moisture stress detected' });
  }

  return insights;
}

export function assessSiteQuality(biomassData, healthEstimate, vegetationStats, forestType, forestAge) {
  if (!biomassData || biomassData.length === 0 || !forestType) {
    return null;
  }

  const type = (forestParams[forestType]) ? forestType : 'pine';

  const siteQualityIndex = computeSiteQualityIndex(biomassData, type, forestAge);
  const healthUrgency = computeHealthAdjustment(healthEstimate);
  const vigor = computeGrowthVigor(biomassData);
  const moisture = computeMoistureStress(biomassData, vegetationStats);
  const biomassGrowth = computeObservedBiomassGrowth(biomassData, type);

  const harvestUrgency = healthUrgency + vigor.urgency + moisture.urgency
    + (biomassGrowth ? biomassGrowth.declineUrgency : 0);

  // Confidence based on data availability
  let confidence;
  const hasHealth = healthEstimate != null;
  const hasVegStats = vegetationStats != null && vegetationStats.data && vegetationStats.data.length > 0;
  const hasAge = forestAge != null && forestAge > 0;
  if (hasHealth && hasVegStats && hasAge) {
    confidence = 'high';
  } else if (hasHealth || hasVegStats) {
    confidence = 'moderate';
  } else {
    confidence = 'low';
  }

  const sqiLabel = siteQualityIndex > 1.1 ? 'Above-average growth site'
    : siteQualityIndex < 0.85 ? 'Below-average growth site'
    : 'Average growth site';

  const healthLabel = healthUrgency === 0 ? 'No health concerns'
    : healthUrgency <= 4 ? 'Minor health concerns'
    : 'Significant health concerns';

  const vigorLabel = vigor.slope > 0.005 ? 'Increasing NDVI trend'
    : vigor.slope < -0.005 ? 'Declining NDVI trend'
    : 'Stable NDVI trend';

  const moistureLabel = moisture.stressRatio > 0.4 ? 'Moisture stress detected'
    : moisture.stressRatio > 0.1 ? 'Some moisture variability'
    : 'No moisture stress';

  const growthRate = biomassGrowth ? biomassGrowth.annualGrowthRate : 0;
  const growthLabel = growthRate > 3 ? 'Strong biomass growth'
    : growthRate > 0 ? 'Moderate biomass growth'
    : growthRate < -1 ? 'Declining biomass'
    : 'Stable biomass';

  const factors = {
    siteQuality: { value: siteQualityIndex, label: sqiLabel },
    healthAdjustment: { value: healthUrgency, label: healthLabel },
    growthVigor: { value: vigor.slope, label: vigorLabel },
    moistureStress: { value: moisture.stressRatio, label: moistureLabel },
    biomassGrowth: { value: growthRate, label: growthLabel }
  };

  const insights = generateInsights(factors, type, forestAge);

  return {
    siteQualityIndex,
    harvestUrgency,
    confidence,
    factors,
    insights,
    observedBiomassGrowth: biomassGrowth
  };
}
