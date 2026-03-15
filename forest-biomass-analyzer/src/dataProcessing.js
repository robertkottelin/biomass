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

export function estimateBiomass(ndvi, forestType, yearsFromStart, currentForestAge, options = {}) {
  const params = forestParams[forestType] || forestParams.pine;
  const { ndmi, ndre } = options;

  // For water bodies (negative NDVI), return 0 biomass
  if (ndvi < 0) {
    return 0;
  }

  // Logistic growth model for forest biomass accumulation
  const currentAge = currentForestAge + yearsFromStart;
  const growthFactor = 1 - Math.exp(-params.growthRate * currentAge);

  // --- Multi-index vegetation factor ---
  // NDVI: primary canopy coverage signal (saturates at high biomass ~0.8+)
  const ndviNorm = Math.min(1, Math.max(0, ndvi) / params.ndviSaturation);

  // NDRE: red-edge chlorophyll density — less prone to saturation than NDVI at high biomass.
  // Typical healthy forest NDRE: 0.2–0.5; saturation ~55% of NDVI saturation.
  // At high NDVI (canopy closed), NDRE provides better differentiation of biomass levels.
  let vegetationFactor = ndviNorm;
  if (ndre != null && ndre > 0) {
    // NDRE saturates at ~0.40 for mature boreal forests (lower absolute range than NDVI)
    // Normalizing to this range allows NDRE to differentiate high-biomass forests
    // where NDVI is already saturated
    const ndreNorm = Math.min(1.15, ndre / (params.ndviSaturation * 0.45));
    // NDRE can push the vegetation factor above what NDVI alone can reach (breaks saturation)
    // Blend: take the higher of NDVI and NDRE-boosted factor
    const ndreBoosted = 0.6 * ndviNorm + 0.4 * ndreNorm;
    vegetationFactor = Math.max(ndviNorm, ndreBoosted);
  }

  // NDMI: canopy water content — well-hydrated forests have more actual biomass.
  // Range for forests: -0.1 (dry/stressed) to 0.5+ (very healthy).
  // Adjusts biomass ±15%: stressed canopy reduces estimate, healthy canopy boosts slightly.
  let healthModifier = 1.0;
  if (ndmi != null) {
    healthModifier = Math.max(0.85, Math.min(1.1, 1.0 + ndmi * 0.2));
  }

  // Calculate biomass combining growth model, vegetation index, and health
  const biomass = params.youngBiomass +
    (params.maxBiomass - params.youngBiomass) * growthFactor * vegetationFactor * healthModifier;

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
