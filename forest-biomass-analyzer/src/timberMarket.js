// Timber market benchmarking & negotiation tool
// Luke 2024 price data for Finnish timber market

import {
  estimateTimberValue,
  BASIC_DENSITY,
  TIMBER_PRICES,
  FORESTRY_DISCOUNT_RATE
} from './carbonCalculation';
import { forestParams, estimateBiomass } from './dataProcessing';

// Price ranges: low/avg/high per species per assortment (Luke 2024)
export const TIMBER_PRICE_RANGES = {
  pine: {
    sawlog: { low: 62, avg: 72, high: 82 },
    pulpwood: { low: 26, avg: 32, high: 38 }
  },
  fir: {
    sawlog: { low: 68, avg: 78, high: 88 },
    pulpwood: { low: 24, avg: 30, high: 36 }
  },
  birch: {
    sawlog: { low: 44, avg: 52, high: 60 },
    pulpwood: { low: 22, avg: 28, high: 34 }
  },
  aspen: {
    sawlog: { low: 0, avg: 0, high: 0 },
    pulpwood: { low: 19, avg: 25, high: 31 }
  }
};

// Energy wood (branches, stumps, small-diameter) average price
export const ENERGY_WOOD_PRICE = 22; // €/m³

// Standing sale discount: buyer handles harvest, typically 15% discount
export const STANDING_SALE_DISCOUNT = 0.85;

/**
 * Calculate price range (low/avg/high) for a forest stand.
 * Returns total values with volume breakdown by assortment.
 */
export function calculatePriceRange(biomassPerHa, forestType, forestAge, areaHectares) {
  const type = forestType || 'pine';
  const density = BASIC_DENSITY[type] || BASIC_DENSITY.pine;
  const ranges = TIMBER_PRICE_RANGES[type] || TIMBER_PRICE_RANGES.pine;

  const volumePerHa = biomassPerHa / density;

  // Sawlog fraction by age (same logic as estimateTimberValue)
  let sawlogFraction;
  if (forestAge <= 30) {
    sawlogFraction = 0.1;
  } else if (forestAge >= 60) {
    sawlogFraction = 0.7;
  } else {
    sawlogFraction = 0.1 + (0.6 * (forestAge - 30) / 30);
  }
  if (type === 'aspen') sawlogFraction = 0;

  const pulpwoodFraction = 1 - sawlogFraction;

  // Energy wood is ~10% of total volume (harvest residues)
  const energyWoodFraction = 0.10;
  const merchantableVolume = volumePerHa * (1 - energyWoodFraction);
  const energyWoodVolume = volumePerHa * energyWoodFraction;

  const sawlogVolume = merchantableVolume * sawlogFraction;
  const pulpwoodVolume = merchantableVolume * pulpwoodFraction;

  const calcTotal = (level) => {
    const sawlogPrice = ranges.sawlog[level];
    const pulpwoodPrice = ranges.pulpwood[level];
    const perHa = sawlogVolume * sawlogPrice + pulpwoodVolume * pulpwoodPrice + energyWoodVolume * ENERGY_WOOD_PRICE;
    return perHa * areaHectares;
  };

  return {
    low: calcTotal('low'),
    avg: calcTotal('avg'),
    high: calcTotal('high'),
    volumePerHa,
    sawlogVolume,
    pulpwoodVolume,
    energyWoodVolume,
    sawlogFraction,
    pulpwoodFraction,
    standingSaleLow: calcTotal('low') * STANDING_SALE_DISCOUNT,
    standingSaleAvg: calcTotal('avg') * STANDING_SALE_DISCOUNT,
    standingSaleHigh: calcTotal('high') * STANDING_SALE_DISCOUNT,
    deliverySaleLow: calcTotal('low'),
    deliverySaleAvg: calcTotal('avg'),
    deliverySaleHigh: calcTotal('high')
  };
}

/**
 * Analyze harvest delay: project value at +1/3/5yr with discount rate.
 */
export function analyzeHarvestDelay(forestType, currentAge, areaHectares, delayYears = [1, 3, 5]) {
  const type = (forestType && forestParams[forestType]) ? forestType : 'pine';
  const params = forestParams[type];
  const discountRate = FORESTRY_DISCOUNT_RATE;

  // Current value
  const currentBiomass = estimateBiomass(params.ndviSaturation, type, 0, currentAge);
  const currentRange = calculatePriceRange(currentBiomass, type, currentAge, areaHectares);

  const projections = delayYears.map(years => {
    const futureAge = currentAge + years;
    const futureBiomass = estimateBiomass(params.ndviSaturation, type, years, currentAge);
    const futureRange = calculatePriceRange(futureBiomass, type, futureAge, areaHectares);
    const discountFactor = Math.pow(1 + discountRate, years);

    return {
      delayYears: years,
      futureAge,
      nominalValue: futureRange.avg,
      discountedValue: futureRange.avg / discountFactor,
      nominalGain: futureRange.avg - currentRange.avg,
      discountedGain: (futureRange.avg / discountFactor) - currentRange.avg,
      volumePerHa: futureRange.volumePerHa
    };
  });

  return {
    currentValue: currentRange.avg,
    currentAge,
    projections
  };
}

/**
 * Generate a comprehensive sale sheet with all pricing data.
 */
export function generateSaleSheet(biomassPerHa, forestType, forestAge, areaHectares) {
  const type = forestType || 'pine';
  const priceRange = calculatePriceRange(biomassPerHa, type, forestAge, areaHectares);
  const harvestDelay = analyzeHarvestDelay(type, forestAge, areaHectares);
  const timberValue = estimateTimberValue(biomassPerHa, type, forestAge, areaHectares);

  return {
    priceRange,
    harvestDelay,
    timberValue,
    forestType: type,
    forestAge,
    areaHectares,
    biomassPerHa,
    summary: {
      deliveryPriceRange: `€${priceRange.low.toFixed(0)} - €${priceRange.high.toFixed(0)}`,
      standingPriceRange: `€${priceRange.standingSaleLow.toFixed(0)} - €${priceRange.standingSaleHigh.toFixed(0)}`,
      avgDeliveryPrice: priceRange.avg,
      avgStandingPrice: priceRange.standingSaleAvg,
      totalVolume: priceRange.volumePerHa * areaHectares,
      sawlogPercent: priceRange.sawlogFraction * 100,
      pulpwoodPercent: priceRange.pulpwoodFraction * 100
    }
  };
}
