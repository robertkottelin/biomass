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

// Real discount rate for forestry NPV calculations
export const FORESTRY_DISCOUNT_RATE = 0.03;

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

  for (let y = 0; y <= projectionYears; y++) {
    const age = currentAge + y;
    const biomass = estimateBiomass(1.0 * (params.ndviSaturation || 0.85), type, y, currentAge);
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

export function projectForestValue(forestType, areaHectares, projectionYears = 100) {
  const type = (forestType && forestParams[forestType]) ? forestType : 'pine';
  const params = forestParams[type];
  const points = [];

  for (let age = 0; age <= projectionYears; age++) {
    const biomass = estimateBiomass(params.ndviSaturation, type, age, 0);
    const timber = estimateTimberValue(biomass, type, age, areaHectares);
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

  const values = projectForestValue(type, areaHectares, 120);

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

export function projectHarvestCycle(forestType, areaHectares, totalYears = 100) {
  const type = (forestType && forestParams[forestType]) ? forestType : 'pine';
  const optimal = findOptimalHarvest(type, areaHectares);
  const cycleLength = optimal.optimalAge;
  const params = forestParams[type];
  const points = [];
  let cumulativeHarvestIncome = 0;

  for (let year = 0; year <= totalYears; year++) {
    const ageInCycle = cycleLength > 0 ? year % cycleLength : year;
    const isHarvestYear = cycleLength > 0 && year > 0 && ageInCycle === 0;

    if (isHarvestYear) {
      const matureBiomass = estimateBiomass(params.ndviSaturation, type, cycleLength, 0);
      const harvestTimber = estimateTimberValue(matureBiomass, type, cycleLength, areaHectares);
      cumulativeHarvestIncome += harvestTimber.totalValue;
    }

    const biomass = estimateBiomass(params.ndviSaturation, type, ageInCycle, 0);
    const timber = estimateTimberValue(biomass, type, ageInCycle, areaHectares);

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

export function estimateTimberValue(biomassPerHa, forestType, forestAge, areaHectares) {
  const type = forestType || 'pine';
  const density = BASIC_DENSITY[type] || BASIC_DENSITY.pine;
  const prices = TIMBER_PRICES[type] || TIMBER_PRICES.pine;

  // Convert biomass (tons/ha) to volume (m³/ha)
  const volumePerHa = biomassPerHa / density;

  // Sawlog fraction by age: <30yr mostly pulpwood, >60yr mostly sawlog, linear interpolation
  let sawlogFraction;
  if (forestAge <= 30) {
    sawlogFraction = 0.1;
  } else if (forestAge >= 60) {
    sawlogFraction = 0.7;
  } else {
    sawlogFraction = 0.1 + (0.6 * (forestAge - 30) / 30);
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
