// Biodiversity estimation from remote sensing and forest parameters
// Based on Finnish forestry science (Luke, METSO, SYKE)

export const BIODIVERSITY_PARAMS = {
  pine: {
    matureAge: 80,
    deadwoodAge: 100,
    maxNdviStdDev: 0.15,
    maxCrownDiam: 8,
    mixRecommendation: 'Add birch or rowan as understory to increase structural diversity'
  },
  fir: {
    matureAge: 90,
    deadwoodAge: 110,
    maxNdviStdDev: 0.12,
    maxCrownDiam: 6,
    mixRecommendation: 'Introduce birch and aspen at canopy gaps to diversify structure'
  },
  birch: {
    matureAge: 60,
    deadwoodAge: 70,
    maxNdviStdDev: 0.18,
    maxCrownDiam: 10,
    mixRecommendation: 'Retain conifer understory (spruce) for year-round habitat'
  },
  aspen: {
    matureAge: 50,
    deadwoodAge: 60,
    maxNdviStdDev: 0.20,
    maxCrownDiam: 9,
    mixRecommendation: 'Retain aspen as biodiversity trees when harvesting surrounding conifers'
  }
};

export function estimateBiodiversity(biomassData, treeEstimate, healthEstimate, forestType, forestAge, areaHectares) {
  if (!biomassData || biomassData.length === 0) return null;

  const type = (forestType && BIODIVERSITY_PARAMS[forestType]) ? forestType : 'pine';
  const params = BIODIVERSITY_PARAMS[type];
  const age = forestAge || 20;

  // --- 1. Structural Diversity (40%) ---
  const latestData = biomassData[biomassData.length - 1];
  const ndviRange = (latestData.ndviMax != null && latestData.ndviMin != null)
    ? (latestData.ndviMax - latestData.ndviMin) / 4
    : 0;
  const ndviVarianceScore = Math.min(1, ndviRange / params.maxNdviStdDev) * 100;

  // Canopy cover optimality: 60-85% is ideal for biodiversity
  const canopyCover = treeEstimate ? parseFloat(treeEstimate.canopyCover) : 70;
  let canopyOptimalityScore;
  if (canopyCover >= 60 && canopyCover <= 85) {
    canopyOptimalityScore = 100;
  } else if (canopyCover < 60) {
    canopyOptimalityScore = (canopyCover / 60) * 100;
  } else {
    canopyOptimalityScore = Math.max(0, 100 - (canopyCover - 85) * 3);
  }

  // Crown diameter maturity
  const crownDiam = treeEstimate ? parseFloat(treeEstimate.meanCrownDiameter) : 3;
  const crownMaturityScore = Math.min(1, crownDiam / params.maxCrownDiam) * 100;

  const structuralDiversity = Math.round(
    (ndviVarianceScore * 0.4 + canopyOptimalityScore * 0.3 + crownMaturityScore * 0.3)
  );

  // --- 2. Species Composition ---
  // Cannot detect from satellite — excluded from scoring
  const speciesComposition = null;

  // --- 3. Age/Maturity Factor (25%) ---
  const ageFactor = Math.round(Math.min(age / params.matureAge, 1) * 100);

  // --- 4. Health Factor (20%) ---
  const healthFactor = healthEstimate && healthEstimate.healthScore != null
    ? healthEstimate.healthScore
    : 70;

  // --- Overall Score (excluding species composition — only measurable components) ---
  const overallScore = Math.round(
    structuralDiversity * 0.55 +
    ageFactor * 0.25 +
    healthFactor * 0.20
  );

  let overallLabel;
  if (overallScore >= 70) overallLabel = 'Good';
  else if (overallScore > 50) overallLabel = 'Moderate';
  else overallLabel = 'Low';

  // --- Deadwood Indicator ---
  let deadwood;
  if (age >= params.deadwoodAge && ndviVarianceScore > 40) {
    deadwood = 'Likely';
  } else if (age >= params.deadwoodAge * 0.8) {
    deadwood = 'Possible';
  } else {
    deadwood = 'Unlikely';
  }

  // --- Recommendations ---
  const recommendations = [];
  recommendations.push(params.mixRecommendation);
  if (age >= params.matureAge * 0.8) {
    recommendations.push('Leave retention trees (5-10 per ha) at harvest to maintain habitat continuity');
  }
  if (structuralDiversity < 50) {
    recommendations.push('Consider variable-density thinning to create structural heterogeneity');
  }
  if (age >= params.deadwoodAge * 0.7) {
    recommendations.push('Eligible for METSO programme — voluntary forest conservation with compensation');
  }

  return {
    overallScore,
    overallLabel,
    structuralDiversity,
    speciesComposition,
    ageFactor,
    healthFactor,
    deadwood,
    recommendations
  };
}
