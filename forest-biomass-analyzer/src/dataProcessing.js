// Extracted pure functions for biomass estimation and data processing

export const forestParams = {
  pine: {
    maxBiomass: 450,      // Maximum biomass (tons/ha) at maturity
    growthRate: 0.08,     // Growth rate parameter
    ndviSaturation: 0.85, // NDVI saturation level for mature forest
    youngBiomass: 20      // Initial biomass for young forest
  },
  fir: {
    maxBiomass: 500,
    growthRate: 0.07,
    ndviSaturation: 0.88,
    youngBiomass: 25
  },
  birch: {
    maxBiomass: 300,
    growthRate: 0.12,
    ndviSaturation: 0.82,
    youngBiomass: 15
  },
  aspen: {
    maxBiomass: 250,
    growthRate: 0.15,
    ndviSaturation: 0.80,
    youngBiomass: 12
  }
};

export function estimateBiomass(ndvi, forestType, yearsFromStart, currentForestAge) {
  const params = forestParams[forestType];

  // For water bodies (negative NDVI), return 0 biomass
  if (ndvi < 0) {
    return 0;
  }

  // Logistic growth model for forest biomass accumulation
  const currentAge = currentForestAge + yearsFromStart;
  const growthFactor = 1 - Math.exp(-params.growthRate * currentAge);

  // NDVI-based adjustment factor (accounts for vegetation health/density)
  const ndviNormalized = Math.max(0, ndvi) / params.ndviSaturation;
  const ndviFactor = Math.min(1, ndviNormalized);

  // Calculate biomass combining growth model and NDVI
  const biomass = params.youngBiomass +
    (params.maxBiomass - params.youngBiomass) * growthFactor * ndviFactor;

  return Math.max(0, biomass);
}

export function calculateRollingAverage(data, key, windowSize) {
  return data.map((item, index) => {
    const startIndex = Math.max(0, index - windowSize + 1);
    const windowData = data.slice(startIndex, index + 1);

    const sum = windowData.reduce((acc, d) => acc + d[key], 0);
    const average = sum / windowData.length;

    return {
      ...item,
      [`${key}RollingAvg`]: average
    };
  });
}
