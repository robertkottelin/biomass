// Forest succession & generational transfer planner
// Finnish inheritance tax and forest estate valuation

import { estimateTimberValue, estimateCarbonCreditValue, biomassToCarbon, FORESTRY_DISCOUNT_RATE, findOptimalHarvestYear } from './carbonCalculation';
import { forestParams, estimateBiomass } from './dataProcessing';

// Finnish inheritance tax Class I (children, spouse) progressive rates
export const INHERITANCE_TAX_CLASS_I = [
  { min: 0, max: 20000, rate: 0, base: 0 },
  { min: 20000, max: 40000, rate: 0.07, base: 0 },
  { min: 40000, max: 60000, rate: 0.10, base: 1400 },
  { min: 60000, max: 200000, rate: 0.13, base: 3400 },
  { min: 200000, max: 1000000, rate: 0.16, base: 21600 },
  { min: 1000000, max: Infinity, rate: 0.19, base: 149600 }
];

// Forest tax value ratio (tax authority valuation vs fair market value)
export const FOREST_TAX_VALUE_RATIO = 0.40;

// Average land values by region (€/ha, Finnish Tax Authority 2024)
export const LAND_VALUE_PER_HA = {
  south: 3500,
  central: 2500,
  north: 1500
};

/**
 * Calculate Finnish inheritance tax using Class I progressive rates.
 */
export function calculateInheritanceTax(fairMarketValue, taxClass) {
  // Default to Class I (children/spouse). Class II rates are higher.
  const brackets = INHERITANCE_TAX_CLASS_I;

  // Tax value = fair market value × tax ratio (forests taxed at ~40% of market value)
  const taxableValue = fairMarketValue * FOREST_TAX_VALUE_RATIO;

  if (taxableValue <= brackets[0].max) return { tax: 0, effectiveRate: 0, taxableValue };

  let tax = 0;
  let bracketRate = 0;
  let bracketBase = 0;
  let bracketMin = 0;
  for (let i = brackets.length - 1; i >= 0; i--) {
    if (taxableValue > brackets[i].min) {
      bracketRate = brackets[i].rate;
      bracketBase = brackets[i].base;
      bracketMin = brackets[i].min;
      tax = bracketBase + (taxableValue - bracketMin) * bracketRate;
      break;
    }
  }

  return {
    tax: Math.round(tax),
    effectiveRate: fairMarketValue > 0 ? (tax / fairMarketValue) * 100 : 0,
    taxableValue: Math.round(taxableValue),
    fairMarketValue: Math.round(fairMarketValue),
    taxRatio: FOREST_TAX_VALUE_RATIO,
    bracketRate,
    bracketBase,
    bracketMin
  };
}

/**
 * Project 3 management scenarios over specified years.
 * - Active: regular thinning and harvest at optimal age
 * - Hold: no harvesting, value grows with biomass
 * - Sell + Invest: sell now, invest proceeds at market rate
 */
export function projectManagementScenarios(forestType, forestAge, areaHectares, years = 30, options = {}) {
  const type = (forestType && forestParams[forestType]) ? forestType : 'pine';
  const params = forestParams[type];
  const discountRate = FORESTRY_DISCOUNT_RATE;
  const marketReturn = 0.05; // 5% long-term equity return

  // Current value — use observed biomass when available, theoretical as fallback
  const theoreticalBiomass = estimateBiomass(params.ndviSaturation, type, 0, forestAge);
  const currentBiomass = options.currentBiomass || theoreticalBiomass;
  const biomassScale = theoreticalBiomass > 0 ? currentBiomass / theoreticalBiomass : 1;
  const currentTimber = estimateTimberValue(currentBiomass, type, forestAge, areaHectares);

  const active = [];
  const hold = [];
  const sellInvest = [];

  let activeCumulativeHarvest = 0;
  const harvestRec = findOptimalHarvestYear(type, forestAge, currentBiomass, areaHectares);
  const firstHarvestAge = harvestRec.harvestYear;
  const rotationAge = harvestRec.rotationAge;

  // Years from now until first harvest (min 1 — can't harvest at y=0)
  const firstHarvestYear = Math.max(1, firstHarvestAge - forestAge);

  for (let y = 0; y <= years; y++) {
    const age = forestAge + y;

    // Hold scenario: forest grows, no harvest (scaled to observed biomass)
    const holdBiomass = estimateBiomass(params.ndviSaturation, type, y, forestAge) * biomassScale;
    const holdTimber = estimateTimberValue(holdBiomass, type, age, areaHectares);
    hold.push({ year: y, age, value: holdTimber.totalValue });

    // Active scenario: first harvest at recommended age, then every rotationAge
    // Before any harvest occurs, the forest grows normally from its current state
    const isHarvestYear = y > 0 && (
      y === firstHarvestYear ||
      (y > firstHarvestYear && rotationAge > 0 && (y - firstHarvestYear) % rotationAge === 0)
    );
    if (isHarvestYear) {
      // At first harvest, use the grown forest; subsequent harvests use rotation-aged forest
      const harvestAge = y === firstHarvestYear ? firstHarvestAge : rotationAge;
      const harvestBiomass = y === firstHarvestYear
        ? estimateBiomass(params.ndviSaturation, type, y, forestAge) * biomassScale
        : estimateBiomass(params.ndviSaturation, type, 0, rotationAge);
      const harvestTimber = estimateTimberValue(harvestBiomass, type, harvestAge, areaHectares);
      activeCumulativeHarvest += harvestTimber.totalValue;
    }
    let activeBiomass, activeEffectiveAge;
    if (y <= firstHarvestYear && !isHarvestYear) {
      // Before first harvest: forest grows from current state (same as hold)
      activeBiomass = estimateBiomass(params.ndviSaturation, type, y, forestAge) * biomassScale;
      activeEffectiveAge = age;
    } else if (isHarvestYear) {
      // Just harvested: standing timber is zero (replanted)
      activeBiomass = estimateBiomass(params.ndviSaturation, type, 0, 0);
      activeEffectiveAge = 0;
    } else {
      // Regrowth after harvest
      const yearsSinceLastHarvest = firstHarvestYear >= 0
        ? (y - firstHarvestYear) % rotationAge
        : y % rotationAge;
      activeEffectiveAge = yearsSinceLastHarvest;
      activeBiomass = estimateBiomass(params.ndviSaturation, type, 0, yearsSinceLastHarvest);
    }
    const activeTimber = estimateTimberValue(activeBiomass, type, activeEffectiveAge, areaHectares);
    active.push({ year: y, age, value: activeTimber.totalValue + activeCumulativeHarvest });

    // Sell + Invest: compound at market return
    const investedValue = currentTimber.totalValue * Math.pow(1 + marketReturn, y);
    sellInvest.push({ year: y, age, value: investedValue });
  }

  return {
    active: { data: active, label: 'Active Management', description: `Harvest at age ${firstHarvestAge}, then every ${rotationAge}yr` },
    hold: { data: hold, label: 'Hold (No Harvest)', description: 'Let forest grow, no harvesting' },
    sellInvest: { data: sellInvest, label: 'Sell + Invest', description: `Sell now (€${currentTimber.totalValue.toFixed(0)}), invest at ${(marketReturn * 100)}%` }
  };
}

/**
 * Generate total asset summary for estate planning.
 */
export function generateAssetSummary(timberValue, landValue, carbonCreditValue, areaHectares) {
  const carbon = carbonCreditValue || 0;
  // Timber and carbon are mutually exclusive — you harvest OR keep standing for credits
  const forestUseValue = Math.max(timberValue, carbon);
  const totalValue = forestUseValue + landValue;
  const betterUse = timberValue >= carbon ? 'timber' : 'carbon';

  return {
    timberValue: Math.round(timberValue),
    landValue: Math.round(landValue),
    carbonCreditValue: Math.round(carbon),
    forestUseValue: Math.round(forestUseValue),
    totalValue: Math.round(totalValue),
    perHectare: areaHectares > 0 ? Math.round(totalValue / areaHectares) : 0,
    areaHectares,
    betterUse,
    breakdown: {
      landPercent: totalValue > 0 ? ((landValue / totalValue) * 100).toFixed(1) : '0',
      forestUsePercent: totalValue > 0 ? ((forestUseValue / totalValue) * 100).toFixed(1) : '0'
    }
  };
}

/**
 * Estimate annual management workload in hours.
 */
export function estimateManagementWorkload(areaHectares, strategy) {
  // Base hours per hectare by strategy
  const hoursPerHa = {
    active: 3.5,     // Planning, marking, supervising harvest, tending
    hold: 0.5,       // Minimal — monitoring, boundary maintenance
    sellInvest: 0    // No forest work
  };

  const hours = strategy in hoursPerHa ? hoursPerHa[strategy] : hoursPerHa.active;
  const baseHours = hours * areaHectares;

  // Fixed overhead per year regardless of area
  const overhead = strategy === 'sellInvest' ? 0 : 10; // Tax filing, forest plan updates

  return {
    totalHoursPerYear: Math.round(baseHours + overhead),
    hoursPerHectare: hours,
    overhead,
    strategy,
    areaHectares
  };
}
