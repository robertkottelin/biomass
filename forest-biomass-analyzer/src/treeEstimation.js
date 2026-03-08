// Tree density estimation using canopy cover and forestry allometric models
// Crown diameter parameters based on Finnish NFI data and Pretzsch (2009)

const crownParams = {
  pine: { minCrownDiam: 2.0, maxCrownDiam: 8.0, matureCrownAge: 80, packingFactor: 0.70 },
  fir: { minCrownDiam: 1.5, maxCrownDiam: 6.0, matureCrownAge: 90, packingFactor: 0.75 },
  birch: { minCrownDiam: 3.0, maxCrownDiam: 10.0, matureCrownAge: 60, packingFactor: 0.65 },
  aspen: { minCrownDiam: 2.5, maxCrownDiam: 9.0, matureCrownAge: 50, packingFactor: 0.60 }
};

/**
 * Estimate crown diameter (meters) based on species and age.
 * Uses a saturating exponential model.
 */
function estimateCrownDiameter(forestType, age) {
  const params = crownParams[forestType];
  if (!params) return 5.0; // fallback
  const ageFraction = 1 - Math.exp(-0.04 * age);
  return params.minCrownDiam + (params.maxCrownDiam - params.minCrownDiam) * ageFraction;
}

/**
 * Calculate canopy cover fraction from NDVI pixel values.
 * Pixels with NDVI > 0.4 are fully canopy-covered.
 * Pixels with NDVI 0.2-0.4 contribute fractionally.
 */
function calculateCanopyCover(ndviValues) {
  if (!ndviValues || ndviValues.length === 0) return 0;

  let canopySum = 0;
  let validCount = 0;

  for (const ndvi of ndviValues) {
    if (ndvi < 0) continue; // skip water
    validCount++;
    if (ndvi > 0.4) {
      canopySum += 1.0;
    } else if (ndvi > 0.2) {
      // Linear interpolation: 0.2 -> 0%, 0.4 -> 100%
      canopySum += (ndvi - 0.2) / 0.2;
    }
  }

  return validCount > 0 ? canopySum / validCount : 0;
}

/**
 * Estimate tree count for a forest area.
 *
 * @param {number[]} ndviValues - Array of per-pixel NDVI values
 * @param {string} forestType - Species: 'pine', 'fir', 'birch', or 'aspen'
 * @param {number} forestAge - Current age of the forest in years
 * @param {number} areaHectares - Area of the forest polygon in hectares
 * @returns {object} Tree count estimate with confidence range
 */
export function estimateTreeCount(ndviValues, forestType, forestAge, areaHectares) {
  const params = crownParams[forestType] || crownParams.pine;

  // 1. Canopy cover from NDVI
  const canopyCover = calculateCanopyCover(ndviValues);

  // 2. Crown diameter from species + age
  const crownDiameter = estimateCrownDiameter(forestType, forestAge);
  const crownArea = Math.PI * Math.pow(crownDiameter / 2, 2); // m²

  // 3. Tree count = (total canopy area) / (individual crown area)
  // Total canopy area = polygon area × canopy cover fraction × packing factor
  const totalAreaM2 = areaHectares * 10000;
  const effectiveCanopyArea = totalAreaM2 * canopyCover * params.packingFactor;
  const treeCount = Math.round(effectiveCanopyArea / crownArea);

  // 4. Trees per hectare
  const treesPerHa = areaHectares > 0 ? Math.round(treeCount / areaHectares) : 0;

  // 5. Confidence range (±30% given 10m resolution uncertainty)
  const uncertaintyFactor = 0.30;

  return {
    count: treeCount,
    countMin: Math.round(treeCount * (1 - uncertaintyFactor)),
    countMax: Math.round(treeCount * (1 + uncertaintyFactor)),
    treesPerHa,
    treesPerHaMin: Math.round(treesPerHa * (1 - uncertaintyFactor)),
    treesPerHaMax: Math.round(treesPerHa * (1 + uncertaintyFactor)),
    canopyCover: (canopyCover * 100).toFixed(1),
    meanCrownDiameter: crownDiameter.toFixed(2),
    crownArea: crownArea.toFixed(1),
    packingFactor: params.packingFactor
  };
}
