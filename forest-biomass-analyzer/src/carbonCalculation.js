import { forestParams, estimateBiomass } from './dataProcessing';

// EU ETS average price 2024 (€/ton CO2)
export const EU_ETS_PRICE_PER_TON = 65;

// IPCC Tier 1 constants
export const CARBON_FRACTION = 0.5;
export const CO2_PER_CARBON = 3.67; // 44/12

export const BELOW_GROUND_RATIO = {
  pine: 0.29,
  fir: 0.29,
  birch: 0.24,
  aspen: 0.24
};

export const SOIL_CARBON_TONS_PER_HA = {
  pine: 70,
  fir: 85,
  birch: 55,
  aspen: 50
};

// Basic density (tons/m³) for biomass-to-volume conversion
export const BASIC_DENSITY = {
  pine: 0.42,
  fir: 0.38,
  birch: 0.49,
  aspen: 0.35
};

// Average Finnish timber prices (Luke 2024, €/m³)
export const TIMBER_PRICES = {
  pine: { sawlog: 72, pulpwood: 32 },
  fir: { sawlog: 78, pulpwood: 30 },
  birch: { sawlog: 52, pulpwood: 28 },
  aspen: { sawlog: 0, pulpwood: 25 }
};

// Finnish minimum harvest ages (Southern Finland regional guidelines)
export const MIN_HARVEST_AGE = {
  pine: 60,
  fir: 60,
  birch: 50,
  aspen: 35
};

// Regeneration costs (€/ha) — site preparation + planting + early tending
export const REGENERATION_COST = {
  pine: 1500,
  fir: 1800,
  birch: 1200,
  aspen: 800
};

// Minimum stem growth rate (t/ha/yr) for healthy forests where NDVI has saturated
// NDVI plateaus after canopy closure (~age 25-30) but stem diameter growth continues
export const MIN_HEALTHY_GROWTH = { pine: 3.0, fir: 3.5, birch: 2.5, aspen: 2.0 };

// Peak productive age: age where timber value growth is overtaken by
// senescence (mortality, rot, wind damage, quality degradation).
// Beyond this age, standing timber value begins to decline.
export const PEAK_PRODUCTIVE_AGE = { pine: 80, fir: 75, birch: 55, aspen: 40 };

// Annual senescence rate past peak age. Boreal conifers decline slowly; broadleaves faster.
export const SENESCENCE_RATE = { pine: 0.008, fir: 0.010, birch: 0.012, aspen: 0.015 };

// Real discount rate for forestry NPV calculations
export const FORESTRY_DISCOUNT_RATE = 0.03;

// Compute health-adjusted peak productive age from site quality data.
// Healthy, thriving forests peak later; stressed forests peak earlier.
export function computeHealthAdjustedPeakAge(forestType, siteQuality) {
  const type = (forestType && forestParams[forestType]) ? forestType : 'pine';
  const basePeak = PEAK_PRODUCTIVE_AGE[type] || PEAK_PRODUCTIVE_AGE.pine;
  const minAge = MIN_HARVEST_AGE[type] || MIN_HARVEST_AGE.pine;

  if (!siteQuality) return basePeak;

  const sqi = siteQuality.siteQualityIndex || 1.0;
  const urgency = siteQuality.harvestUrgency || 0;
  const obs = siteQuality.observedBiomassGrowth;

  let adjustment = 0;

  // High SQI + low urgency: excellent sites sustain productivity longer
  if (sqi > 1.05 && urgency <= 5) {
    adjustment += Math.min(15, (sqi - 1.0) * 30);
  }

  // NDVI health: high NDVI with non-declining trend indicates continued
  // biological productivity. Stem diameter growth continues even after
  // NDVI saturates at canopy closure.
  if (obs && obs.latestNdvi != null && urgency <= 5) {
    const ndviSat = (forestParams[type] || forestParams.pine).ndviSaturation;
    const ndviRatio = obs.latestNdvi / ndviSat;
    const ndviTrend = obs.ndviSlope || 0;
    if (ndviRatio >= 0.7 && ndviTrend >= -0.005) {
      const healthLevel = Math.max(0, Math.min(1, (ndviRatio - 0.5) / 0.3));
      if (ndviTrend >= 0.005) {
        adjustment += Math.round(healthLevel * 15); // growing NDVI
      } else {
        adjustment += Math.round(healthLevel * 10); // stable NDVI
      }
    }
  }

  // Strong observed growth supports later peak
  const minGrowth = MIN_HEALTHY_GROWTH[type] || MIN_HEALTHY_GROWTH.pine;
  if (obs && obs.annualGrowthRate > minGrowth && urgency <= 5) {
    adjustment += Math.min(5, (obs.annualGrowthRate - minGrowth) * 0.5);
  }

  // Health urgency pulls peak earlier
  if (urgency > 0) {
    adjustment -= Math.min(20, urgency * 2);
  }

  // Below-average SQI: poor site peaks earlier
  if (sqi < 0.9) {
    adjustment -= Math.min(10, (0.9 - sqi) * 30);
  }

  return Math.max(minAge, Math.min(120, Math.round(basePeak + adjustment)));
}

// Senescence factor: exponential decline past peak productive age.
// Returns 1.0 at/before peak, declining after with quadratic acceleration.
export function computeSenescenceFactor(forestType, age, peakAge) {
  if (age <= peakAge) return 1.0;
  const type = forestType || 'pine';
  const rate = SENESCENCE_RATE[type] || SENESCENCE_RATE.pine;
  const yearsPast = age - peakAge;
  return Math.exp(-rate * yearsPast * (1 + yearsPast * 0.01));
}

// Quality degradation for over-mature timber (rot, heart decay, defects).
// Returns 0 before peak+10yr buffer, then increases up to 0.6 cap.
export function computeQualityDegradation(forestType, age, peakAge) {
  const buffer = 10;
  const declineStart = peakAge + buffer;
  if (age <= declineStart) return 0;
  const yearsPast = age - declineStart;
  return Math.min(0.6, 0.012 * yearsPast * (1 + yearsPast * 0.005));
}

export function biomassToCarbon(aboveGroundBiomass, forestType, options = {}) {
  const type = forestType || 'pine';
  const bgRatio = BELOW_GROUND_RATIO[type] || BELOW_GROUND_RATIO.pine;
  const soilC = SOIL_CARBON_TONS_PER_HA[type] || SOIL_CARBON_TONS_PER_HA.pine;

  const aboveGround = aboveGroundBiomass * CARBON_FRACTION * CO2_PER_CARBON;
  const belowGround = aboveGround * bgRatio;
  const soil = soilC * CO2_PER_CARBON;

  const carbonTons = (aboveGroundBiomass * CARBON_FRACTION) + (aboveGroundBiomass * CARBON_FRACTION * bgRatio) + soilC;
  const co2eTons = aboveGround + belowGround + soil;

  return {
    carbonTons,
    co2eTons,
    breakdown: {
      aboveGround,
      belowGround,
      soil
    }
  };
}

export function carbonTimeSeries(biomassData, forestType, areaHectares) {
  return biomassData.map(item => {
    const result = biomassToCarbon(item.biomass, forestType);
    return {
      ...item,
      co2ePerHa: result.co2eTons,
      co2eTotal: result.co2eTons * areaHectares,
      carbonPerHa: result.carbonTons
    };
  });
}

export function projectCarbonStock(currentBiomass, forestType, currentAge, areaHectares, projectionYears = 30) {
  const type = (forestType && forestParams[forestType]) ? forestType : 'pine';
  const params = forestParams[type];
  const points = [];

  // Scale theoretical projection to anchor at observed currentBiomass
  const theoreticalNow = estimateBiomass(params.ndviSaturation || 0.85, type, 0, currentAge);
  const scaleFactor = (currentBiomass > 0 && theoreticalNow > 0) ? currentBiomass / theoreticalNow : 1;

  for (let y = 0; y <= projectionYears; y++) {
    const age = currentAge + y;
    const biomass = estimateBiomass(params.ndviSaturation || 0.85, type, y, currentAge) * scaleFactor;
    const carbon = biomassToCarbon(biomass, type);

    const prevCo2e = y > 0 ? points[y - 1].co2ePerHa : null;
    const annualSequestration = prevCo2e !== null ? carbon.co2eTons - prevCo2e : 0;

    points.push({
      year: y,
      age,
      biomass,
      co2ePerHa: carbon.co2eTons,
      co2eTotal: carbon.co2eTons * areaHectares,
      carbonPerHa: carbon.carbonTons,
      annualSequestration
    });
  }

  return points;
}

export function compareScenarios(currentBiomass, forestType, currentAge, areaHectares) {
  const type = (forestType && forestParams[forestType]) ? forestType : 'pine';

  // Scenario 1: Continue growing
  const continueGrowing = projectCarbonStock(currentBiomass, type, currentAge, areaHectares, 30);

  // Scenario 2: Harvest now + replant (age resets to 0)
  const harvestReplant = projectCarbonStock(0, type, 0, areaHectares, 30);

  // Scenario 3: Optimal harvest — find inflection point
  const fullProjection = projectCarbonStock(currentBiomass, type, currentAge, areaHectares, 60);
  const sequestrationThreshold = 0.5; // tons CO2e/ha/year
  let optimalYear = 30;
  for (let i = 2; i < fullProjection.length; i++) {
    if (fullProjection[i].annualSequestration < sequestrationThreshold && fullProjection[i].annualSequestration >= 0) {
      optimalYear = i;
      break;
    }
  }

  // For optimal: grow until optimal year, then harvest+replant
  const optimalPoints = [];
  for (let y = 0; y <= 30; y++) {
    if (y < optimalYear) {
      optimalPoints.push({ ...continueGrowing[y], scenario: 'optimal' });
    } else {
      const replantYear = y - optimalYear;
      const replantProjection = projectCarbonStock(0, type, 0, areaHectares, 30);
      const replantPoint = replantProjection[Math.min(replantYear, replantProjection.length - 1)];
      optimalPoints.push({
        year: y,
        age: replantYear,
        biomass: replantPoint.biomass,
        co2ePerHa: replantPoint.co2ePerHa,
        co2eTotal: replantPoint.co2eTotal,
        carbonPerHa: replantPoint.carbonPerHa,
        annualSequestration: replantPoint.annualSequestration,
        scenario: 'optimal'
      });
    }
  }

  // Cumulative sequestration (sum of annual deltas)
  const cumulative = (data) => data.reduce((sum, d) => sum + Math.max(0, d.annualSequestration), 0);
  const peakRate = (data) => Math.max(...data.map(d => d.annualSequestration));

  return {
    continueGrowing: {
      data: continueGrowing,
      cumulativeSequestration: cumulative(continueGrowing),
      peakRate: peakRate(continueGrowing),
      label: 'Continue Growing'
    },
    harvestReplant: {
      data: harvestReplant,
      cumulativeSequestration: cumulative(harvestReplant),
      peakRate: peakRate(harvestReplant),
      label: 'Harvest Now + Replant'
    },
    optimal: {
      data: optimalPoints,
      cumulativeSequestration: cumulative(optimalPoints),
      peakRate: peakRate(optimalPoints),
      optimalYear,
      label: `Optimal (harvest at year ${optimalYear})`
    }
  };
}

export function projectForestValue(forestType, areaHectares, projectionYears = 100, options = {}) {
  const type = (forestType && forestParams[forestType]) ? forestType : 'pine';
  const params = forestParams[type];
  const points = [];

  // When observed growth data is available, use it for ages >= currentAge
  const { currentAge, siteQuality } = options;
  const observedGrowth = siteQuality?.observedBiomassGrowth;
  const projectionBase = observedGrowth?.latestNdviBiomass;
  let effectiveRate = null;

  if (observedGrowth && projectionBase && currentAge != null) {
    const observedRate = observedGrowth.annualGrowthRate || 0;
    const minGrowth = MIN_HEALTHY_GROWTH[type] || MIN_HEALTHY_GROWTH.pine;
    effectiveRate = observedRate;
    if (observedGrowth.latestNdvi != null) {
      const ndviRatio = observedGrowth.latestNdvi / params.ndviSaturation;
      const ndviTrend = observedGrowth.ndviSlope || 0;
      if (ndviRatio >= 0.7 && ndviTrend >= -0.005 && observedRate < minGrowth) {
        effectiveRate = minGrowth;
      }
    }
  }

  // Soft cap: logarithmic overshoot up to 10% beyond max
  const softCap = (projected, max) => {
    if (projected <= max) return projected;
    const overshoot = projected - max;
    return max + max * 0.1 * (1 - Math.exp(-overshoot / (max * 0.1)));
  };

  // When observed data is available, scale the theoretical curve so it passes through
  // projectionBase at currentAge, avoiding a visual discontinuity on the chart.
  // For ages beyond currentAge, project forward using effective growth rate.
  let biomassCorrectionFactor = 1;
  if (effectiveRate != null && currentAge != null && currentAge > 0 && projectionBase) {
    const theoreticalAtCurrentAge = estimateBiomass(params.ndviSaturation, type, 0, currentAge);
    if (theoreticalAtCurrentAge > 0) {
      biomassCorrectionFactor = projectionBase / theoreticalAtCurrentAge;
    }
  }

  // Health-adjusted peak age for senescence modeling
  const peakAge = computeHealthAdjustedPeakAge(type, siteQuality);

  for (let age = 0; age <= projectionYears; age++) {
    let biomass;

    if (effectiveRate != null && currentAge != null && age >= currentAge) {
      const yrs = age - currentAge;
      if (effectiveRate > 0 && yrs > 0) {
        const integratedGrowth = effectiveRate * (20 / Math.LN2) * (1 - Math.pow(0.5, yrs / 20));
        biomass = softCap(projectionBase + integratedGrowth, params.maxBiomass);
      } else if (effectiveRate < 0 && yrs > 0) {
        biomass = Math.max(params.youngBiomass, projectionBase + effectiveRate * yrs);
      } else {
        biomass = projectionBase;
      }
    } else {
      biomass = estimateBiomass(params.ndviSaturation, type, age, 0) * biomassCorrectionFactor;
    }

    // Senescence: past peak productive age, biomass declines
    const senescence = computeSenescenceFactor(type, age, peakAge);
    biomass *= senescence;

    // Quality degradation reduces sawlog fraction for over-mature timber
    const qualityDeg = computeQualityDegradation(type, age, peakAge);

    const timber = estimateTimberValue(biomass, type, age, areaHectares, { qualityDegradation: qualityDeg });
    points.push({
      age,
      biomass,
      timberValue: timber.totalValue,
      timberPerHa: timber.perHaValue,
      sawlogFraction: timber.sawlogFraction
    });
  }

  return points;
}

export function findOptimalHarvest(forestType, areaHectares, options = {}) {
  const type = (forestType && forestParams[forestType]) ? forestType : 'pine';
  const discountRate = options.discountRate || FORESTRY_DISCOUNT_RATE;
  const regenCostPerHa = REGENERATION_COST[type] || REGENERATION_COST.pine;
  const regenCost = regenCostPerHa * areaHectares;
  const minAge = MIN_HARVEST_AGE[type] || MIN_HARVEST_AGE.pine;

  const values = projectForestValue(type, areaHectares, 140);

  // Faustmann Land Expectation Value: LEV = (V(T) - C) / (exp(r*T) - 1)
  // Maximize LEV over ages >= species minimum harvest age
  let bestAge = minAge;
  let bestLEV = -Infinity;

  for (let age = minAge; age < values.length; age++) {
    const netValue = values[age].timberValue - regenCost;
    const lev = netValue / (Math.exp(discountRate * age) - 1);
    if (lev > bestLEV) {
      bestLEV = lev;
      bestAge = age;
    }
  }

  return {
    optimalAge: bestAge,
    valueAtHarvest: values[bestAge].timberValue,
    annualizedReturn: bestLEV,
    landExpectationValue: bestLEV,
    discountRate,
    regenerationCost: regenCost,
    values
  };
}

export function findOptimalHarvestYear(forestType, currentAge, currentBiomass, areaHectares, options = {}) {
  const type = (forestType && forestParams[forestType]) ? forestType : 'pine';
  const params = forestParams[type];
  const discountRate = options.discountRate || FORESTRY_DISCOUNT_RATE;
  const regenCostPerHa = REGENERATION_COST[type] || REGENERATION_COST.pine;
  const regenCost = regenCostPerHa * areaHectares;
  const minAge = MIN_HARVEST_AGE[type] || MIN_HARVEST_AGE.pine;

  // Site quality integration (optional)
  const sq = options.siteQuality || null;
  const siteQualityIndex = sq ? sq.siteQualityIndex : 1.0;
  const harvestUrgency = sq ? sq.harvestUrgency : 0;

  // Faustmann-optimal rotation for second generation (bare-land start)
  const faustmann = findOptimalHarvest(type, areaHectares, options);
  const rotationAge = faustmann.optimalAge;
  const secondGenValue = faustmann.valueAtHarvest;

  // Anchor to real satellite data via scale factor (only used in fallback when no observed growth)
  const observedGrowth = sq?.observedBiomassGrowth;
  let biomassScaleFactor = 1;
  let adjustedScaleFactor = siteQualityIndex;
  if (!observedGrowth) {
    const theoreticalBiomass = estimateBiomass(params.ndviSaturation, type, 0, currentAge);
    biomassScaleFactor = (currentAge >= 10 && theoreticalBiomass > 0)
      ? currentBiomass / theoreticalBiomass
      : 1;
    adjustedScaleFactor = biomassScaleFactor * siteQualityIndex;
  }

  const observedGrowthRate = observedGrowth ? observedGrowth.annualGrowthRate : 0;

  // Effective growth rate: when NDVI is healthy and non-declining but observed
  // biomass growth is near zero (NDVI saturates at canopy closure), apply a
  // species-specific minimum stem growth rate
  const minGrowth = MIN_HEALTHY_GROWTH[type] || MIN_HEALTHY_GROWTH.pine;
  let effectiveGrowthRate = observedGrowthRate;
  if (observedGrowth && observedGrowth.latestNdvi != null) {
    const ndviRatio = observedGrowth.latestNdvi / params.ndviSaturation;
    const ndviTrend = observedGrowth.ndviSlope || 0;
    if (ndviRatio >= 0.7 && ndviTrend >= -0.005 && observedGrowthRate < minGrowth) {
      effectiveGrowthRate = minGrowth;
    }
  }

  // Use NDVI-derived biomass (age-independent) as projection baseline instead of
  // the age-model-distorted currentBiomass. This prevents age misentry from inflating
  // the base and making the forest look near-maxed.
  const projectionBase = observedGrowth?.latestNdviBiomass || currentBiomass;

  // For healthy, growing forests: reduce effective discount rate
  // reflecting lower biological risk and observed real appreciation
  let effectiveDiscountRate = discountRate;
  if (harvestUrgency <= 5) {
    // SQI-based reduction: excellent sites have lower risk
    if (siteQualityIndex > 1.05) {
      effectiveDiscountRate *= (1 - Math.min((siteQualityIndex - 1.0) * 2, 0.3));
    }
    // Growth-based reduction: actively growing forests are appreciating assets
    // Use NDVI-based biomass as denominator to avoid age-model inflation
    if (effectiveGrowthRate > 0 && projectionBase > 0) {
      const biomassAppreciation = effectiveGrowthRate / projectionBase;
      if (biomassAppreciation > 0.01) {
        // Scale reduction: 1% appreciation → 20% reduction, 5%+ → 60% reduction
        const reductionFactor = Math.min(biomassAppreciation * 12, 0.6);
        effectiveDiscountRate *= (1 - reductionFactor);
      }
    }
    // NDVI health bonus: forests with high NDVI that is not declining have
    // lower biological risk and continued hidden value appreciation (stem growth).
    if (observedGrowth && observedGrowth.latestNdvi != null) {
      const ndviRatio = observedGrowth.latestNdvi / params.ndviSaturation;
      const ndviTrend = observedGrowth.ndviSlope || 0;
      if (ndviRatio >= 0.7 && ndviTrend >= -0.005) {
        const healthLevel = Math.max(0, Math.min(1, (ndviRatio - 0.5) / 0.3));
        effectiveDiscountRate *= (1 - healthLevel * 0.3);
      }
    }
  }

  // Projected timber value at a given age
  // When we have observed growth data from satellite, use it to project biomass forward
  // instead of relying on the theoretical curve (which saturates and underestimates growth
  // for forests that are still actively growing).
  // Soft biomass cap: instead of hard Math.min(projected, max), allow logarithmic
  // overshoot up to 10% beyond nominal max. Prevents "hit cap → zero growth → harvest now" cliff.
  const softCap = (projected, max) => {
    if (projected <= max) return projected;
    // Logarithmic overshoot: up to 10% beyond max
    const overshoot = projected - max;
    const softOvershoot = max * 0.1 * (1 - Math.exp(-overshoot / (max * 0.1)));
    return max + softOvershoot;
  };

  // Health-adjusted peak age for senescence modeling
  const peakAge = computeHealthAdjustedPeakAge(type, sq);

  const valueAt = (age, yearsFromCurrent) => {
    const yrs = yearsFromCurrent || 0;
    let biomass;

    if (effectiveGrowthRate > 0 && yrs > 0 && harvestUrgency <= 5) {
      // Project from NDVI-based biomass (age-independent) using effective growth rate
      // Half-life dampening — growth rate halves every 20 years
      const integratedGrowth = effectiveGrowthRate * (20 / Math.LN2) * (1 - Math.pow(0.5, yrs / 20));
      const projectedBiomass = projectionBase + integratedGrowth;
      biomass = softCap(projectedBiomass, params.maxBiomass);
    } else if (observedGrowthRate < 0 && yrs > 0) {
      // Declining forest: project loss forward
      biomass = Math.max(params.youngBiomass, projectionBase + observedGrowthRate * yrs);
    } else {
      // Fallback: theoretical curve with scale factor
      biomass = estimateBiomass(params.ndviSaturation, type, 0, age) * adjustedScaleFactor;
    }

    // Apply senescence past peak productive age
    const senescence = computeSenescenceFactor(type, age, peakAge);
    biomass *= senescence;

    // Apply quality degradation for over-mature timber
    const qualityDeg = computeQualityDegradation(type, age, peakAge);

    return estimateTimberValue(biomass, type, age, areaHectares, { qualityDegradation: qualityDeg }).totalValue;
  };

  const currentValue = estimateTimberValue(currentBiomass, type, currentAge, areaHectares).totalValue;

  // Two-generation NPV: find first-harvest age T that maximizes
  // NPV(T) = [V_scaled(T) - C] / (1+r)^(T-now) + [V(R) - C] / (1+r)^(T-now+R)
  // Health-based minimum harvest age: healthy forests should not be harvested
  // prematurely. The peak age drives a biological minimum (peakAge - 15yr).
  const healthAdjustedMinAge = harvestUrgency <= 5 ? Math.max(minAge, peakAge - 15) : minAge;
  const adjustedStartAge = Math.max(healthAdjustedMinAge, Math.max(healthAdjustedMinAge, currentAge) - Math.min(harvestUrgency, Math.max(healthAdjustedMinAge, currentAge) - healthAdjustedMinAge));
  const startAge = Math.max(healthAdjustedMinAge, adjustedStartAge);
  const maxCandidateAge = Math.max(currentAge + 40, peakAge + 20);
  let bestT = startAge;
  let bestNPV = -Infinity;

  for (let T = startAge; T <= maxCandidateAge; T++) {
    const yearsUntilT = T - currentAge;
    const discountFirst = Math.pow(1 + effectiveDiscountRate, yearsUntilT);
    const discountSecond = Math.pow(1 + effectiveDiscountRate, yearsUntilT + rotationAge);

    const firstGenNPV = (valueAt(T, yearsUntilT) - regenCost) / discountFirst;
    const secondGenNPV = (secondGenValue - regenCost) / discountSecond;
    const npv = firstGenNPV + secondGenNPV;

    if (npv > bestNPV) {
      bestNPV = npv;
      bestT = T;
    }
  }

  // Marginal value check: if the forest is actively growing and healthy, compare
  // the value gained by waiting one more year vs the discount cost of waiting.
  // This prevents the two-generation NPV from being biased toward early harvest
  // when the standing timber is still appreciating faster than the discount rate.
  if (effectiveGrowthRate > 0 && harvestUrgency <= 5) {
    let T = bestT;
    while (T < maxCandidateAge) {
      const currentVal = valueAt(T, T - currentAge);
      const nextVal = valueAt(T + 1, T + 1 - currentAge);
      const marginalReturn = (nextVal - currentVal) / currentVal;
      // Keep waiting as long as the marginal return on standing timber exceeds
      // the effective discount rate (i.e., it's more valuable to let it grow)
      if (marginalReturn > effectiveDiscountRate) {
        T++;
      } else {
        break;
      }
    }
    bestT = T;
  }

  const harvestYear = bestT;
  const yearsFromNow = harvestYear - currentAge;
  const annualGrowthRate = currentValue > 0
    ? (valueAt(currentAge + 1, 1) - currentValue) / currentValue : 0;

  let recommendation;
  if (yearsFromNow <= 0) {
    recommendation = 'Harvest now — two-generation NPV is maximized at current age';
  } else if (yearsFromNow <= 3) {
    recommendation = `Harvest within ${yearsFromNow} year${yearsFromNow > 1 ? 's' : ''} (age ${harvestYear})`;
  } else {
    recommendation = `Wait ${yearsFromNow} years (age ${harvestYear})`;
  }

  // Append site-quality context to recommendation
  if (sq) {
    const adjustmentReason = buildAdjustmentReason(sq);
    if (adjustmentReason) {
      recommendation += ` — ${adjustmentReason}`;
    }
  }

  return {
    harvestYear, yearsFromNow, currentValue,
    valueAtHarvest: valueAt(harvestYear, yearsFromNow),
    annualGrowthRate, rotationAge, recommendation, biomassScaleFactor,
    siteQualityIndex, harvestUrgency,
    adjustmentReason: sq ? buildAdjustmentReason(sq) : null,
  };
}

function buildAdjustmentReason(sq) {
  const parts = [];
  if (sq.harvestUrgency > 5) {
    parts.push('adjusted earlier due to health decline');
  } else if (sq.harvestUrgency > 0) {
    parts.push('minor health adjustment applied');
  }
  if (sq.siteQualityIndex > 1.1) {
    parts.push('excellent site quality supports later harvest');
  } else if (sq.siteQualityIndex < 0.85) {
    parts.push('below-average site quality');
  }
  return parts.join(', ') || null;
}

export function projectHarvestCycle(forestType, areaHectares, totalYears = 100, options = {}) {
  const type = (forestType && forestParams[forestType]) ? forestType : 'pine';
  const optimal = findOptimalHarvest(type, areaHectares);
  const cycleLength = optimal.optimalAge;
  const params = forestParams[type];
  const points = [];
  let cumulativeHarvestIncome = 0;

  // Scale theoretical curve to match real observed biomass when available
  const { currentBiomass, currentAge } = options;
  let scaleFactor = 1;
  if (currentBiomass > 0 && currentAge > 0) {
    const theoreticalNow = estimateBiomass(params.ndviSaturation, type, 0, currentAge);
    if (theoreticalNow > 0) scaleFactor = currentBiomass / theoreticalNow;
  }

  for (let year = 0; year <= totalYears; year++) {
    const ageInCycle = cycleLength > 0 ? year % cycleLength : year;
    const isHarvestYear = cycleLength > 0 && year > 0 && ageInCycle === 0;
    // Only apply scale factor during the first cycle (before first harvest)
    const isFirstCycle = cycleLength > 0 ? year < cycleLength : true;
    const sf = isFirstCycle ? scaleFactor : 1;

    if (isHarvestYear) {
      const matureBiomass = estimateBiomass(params.ndviSaturation, type, cycleLength, 0) * sf;
      const harvestTimber = estimateTimberValue(matureBiomass, type, cycleLength, areaHectares);
      cumulativeHarvestIncome += harvestTimber.totalValue;
    }

    const baseBiomass = estimateBiomass(params.ndviSaturation, type, ageInCycle, 0) * sf;
    const basePeak = PEAK_PRODUCTIVE_AGE[type] || PEAK_PRODUCTIVE_AGE.pine;
    const senescence = computeSenescenceFactor(type, ageInCycle, basePeak);
    const qualityDeg = computeQualityDegradation(type, ageInCycle, basePeak);
    const biomass = baseBiomass * senescence;
    const timber = estimateTimberValue(biomass, type, ageInCycle, areaHectares, { qualityDegradation: qualityDeg });

    points.push({
      year,
      ageInCycle,
      standingTimberValue: timber.totalValue,
      cumulativeHarvestIncome,
      totalWealth: timber.totalValue + cumulativeHarvestIncome
    });
  }

  return { points, cycleLength, optimalAge: optimal.optimalAge, valueAtHarvest: optimal.valueAtHarvest };
}

export function estimateCarbonCreditValue(co2eTons, creditPricePerTon) {
  const pricePerTon = creditPricePerTon != null ? creditPricePerTon : EU_ETS_PRICE_PER_TON;
  return {
    totalValue: co2eTons * pricePerTon,
    co2eTons,
    pricePerTon,
    currency: 'EUR'
  };
}

export function estimateTimberValue(biomassPerHa, forestType, forestAge, areaHectares, options = {}) {
  const type = forestType || 'pine';
  const density = BASIC_DENSITY[type] || BASIC_DENSITY.pine;
  const prices = TIMBER_PRICES[type] || TIMBER_PRICES.pine;

  // Convert biomass (tons/ha) to volume (m³/ha)
  const volumePerHa = biomassPerHa / density;

  // Sawlog fraction by age: <30yr mostly pulpwood, increases with age as trunk diameter grows
  // 30→60yr: rapid increase (0.1→0.7), 60→100yr: continued slow increase (0.7→0.85)
  let sawlogFraction;
  if (forestAge <= 30) {
    sawlogFraction = 0.1;
  } else if (forestAge <= 60) {
    sawlogFraction = 0.1 + (0.6 * (forestAge - 30) / 30);
  } else if (forestAge <= 100) {
    sawlogFraction = 0.7 + (0.15 * (forestAge - 60) / 40);
  } else {
    sawlogFraction = 0.85;
  }

  // Quality degradation for over-mature stands (only in projections)
  if (options.qualityDegradation > 0 && type !== 'aspen') {
    sawlogFraction = Math.max(0.1, sawlogFraction * (1 - options.qualityDegradation));
  }

  // Aspen has no sawlog market
  if (type === 'aspen') {
    sawlogFraction = 0;
  }

  const pulpwoodFraction = 1 - sawlogFraction;

  const sawlogVolume = volumePerHa * sawlogFraction;
  const pulpwoodVolume = volumePerHa * pulpwoodFraction;

  const perHaValue = sawlogVolume * prices.sawlog + pulpwoodVolume * prices.pulpwood;
  const totalValue = perHaValue * areaHectares;

  return {
    totalValue,
    perHaValue,
    sawlogFraction,
    pulpwoodFraction,
    sawlogPriceM3: prices.sawlog,
    pulpwoodPriceM3: prices.pulpwood,
    volumePerHa
  };
}
