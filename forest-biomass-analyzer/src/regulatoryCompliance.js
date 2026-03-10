// METSO Programme & EU Nature Restoration Law compliance screener
// METSO: €21.7M available for voluntary forest conservation
// NRL: EU Nature Restoration Law targets by Sept 2026

import { estimateTimberValue } from './carbonCalculation';

// METSO habitat class criteria (Finnish Environmental Ministry)
const METSO_CRITERIA = {
  pine: {
    classI: { minAge: 160, minBiodiversity: 70 },
    classII: { minAge: 100, minBiodiversity: 55 },
    classIII: { minAge: 80, minBiodiversity: 40 }
  },
  fir: {
    classI: { minAge: 140, minBiodiversity: 70 },
    classII: { minAge: 100, minBiodiversity: 55 },
    classIII: { minAge: 80, minBiodiversity: 40 }
  },
  birch: {
    classI: { minAge: 100, minBiodiversity: 70 },
    classII: { minAge: 70, minBiodiversity: 55 },
    classIII: { minAge: 50, minBiodiversity: 40 }
  },
  aspen: {
    classI: { minAge: 80, minBiodiversity: 70 },
    classII: { minAge: 60, minBiodiversity: 55 },
    classIII: { minAge: 40, minBiodiversity: 40 }
  }
};

// NRL deadwood and retention targets for boreal forests
const NRL_TARGETS = {
  deadwoodM3PerHa: 20,       // m³/ha target
  retentionTreesPerHa: 10,   // trees/ha at harvest
  unevenAgedMinAge: 40       // years gap between oldest and youngest cohort
};

/**
 * Assess METSO programme eligibility — Class I/II/III scoring.
 */
export function assessMetsoEligibility(forestType, forestAge, biodiversityScore, areaHectares) {
  const type = forestType || 'pine';
  const criteria = METSO_CRITERIA[type] || METSO_CRITERIA.pine;
  const age = forestAge || 0;
  const bioScore = biodiversityScore || 0;

  let metsoClass = null;
  let eligible = false;
  let classDetails = {};

  if (age >= criteria.classI.minAge && bioScore >= criteria.classI.minBiodiversity) {
    metsoClass = 'I';
    eligible = true;
    classDetails = { label: 'Class I — High conservation value', priority: 'Highest priority for METSO funding' };
  } else if (age >= criteria.classII.minAge && bioScore >= criteria.classII.minBiodiversity) {
    metsoClass = 'II';
    eligible = true;
    classDetails = { label: 'Class II — Significant conservation value', priority: 'Good candidate for METSO funding' };
  } else if (age >= criteria.classIII.minAge && bioScore >= criteria.classIII.minBiodiversity) {
    metsoClass = 'III';
    eligible = true;
    classDetails = { label: 'Class III — Potential conservation value', priority: 'Eligible with habitat restoration plan' };
  } else {
    classDetails = { label: 'Not eligible', priority: 'Does not meet minimum METSO criteria' };
  }

  // What's needed to reach next class
  let nextClassRequirements = null;
  if (!metsoClass) {
    nextClassRequirements = {
      targetClass: 'III',
      ageNeeded: Math.max(0, criteria.classIII.minAge - age),
      biodiversityGap: Math.max(0, criteria.classIII.minBiodiversity - bioScore)
    };
  } else if (metsoClass === 'III') {
    nextClassRequirements = {
      targetClass: 'II',
      ageNeeded: Math.max(0, criteria.classII.minAge - age),
      biodiversityGap: Math.max(0, criteria.classII.minBiodiversity - bioScore)
    };
  } else if (metsoClass === 'II') {
    nextClassRequirements = {
      targetClass: 'I',
      ageNeeded: Math.max(0, criteria.classI.minAge - age),
      biodiversityGap: Math.max(0, criteria.classI.minBiodiversity - bioScore)
    };
  }

  return {
    eligible,
    metsoClass,
    ...classDetails,
    forestType: type,
    forestAge: age,
    biodiversityScore: bioScore,
    areaHectares,
    nextClassRequirements,
    criteria
  };
}

/**
 * Estimate METSO compensation value.
 * Permanent protection: 100% of timber value.
 * 20-year temporary: 70% of timber value + annual management payment.
 */
export function estimateMetsoCompensation(timberValue, protectionType) {
  if (protectionType === 'permanent') {
    return {
      type: 'Permanent Protection',
      lumpSum: timberValue,
      annualPayment: 0,
      totalOver20Years: timberValue,
      description: 'Full timber value compensation — permanent conservation easement'
    };
  }

  // 20-year temporary protection
  const lumpSum = timberValue * 0.70;
  const annualPayment = timberValue * 0.02; // ~2% per year management compensation

  return {
    type: '20-Year Temporary Protection',
    lumpSum,
    annualPayment,
    totalOver20Years: lumpSum + annualPayment * 20,
    description: '70% timber value upfront + annual management payment for 20 years'
  };
}

/**
 * Assess EU Nature Restoration Law compliance.
 * Checks deadwood, retention trees, and structural diversity targets.
 */
export function assessNRLCompliance(forestType, forestAge, volumePerHa) {
  const type = forestType || 'pine';
  const age = forestAge || 0;
  const volume = volumePerHa || 0;

  // Estimated deadwood (increases with age, ~5% of standing volume for managed forests)
  const estimatedDeadwood = age > 80 ? volume * 0.08 : age > 50 ? volume * 0.05 : volume * 0.02;

  const deadwoodCompliant = estimatedDeadwood >= NRL_TARGETS.deadwoodM3PerHa;
  const deadwoodGap = Math.max(0, NRL_TARGETS.deadwoodM3PerHa - estimatedDeadwood);

  // Uneven-aged structure — difficult to assess from remote sensing, use age as proxy
  const hasUnevenStructure = age > NRL_TARGETS.unevenAgedMinAge;

  const targets = [
    {
      name: 'Deadwood Volume',
      target: `${NRL_TARGETS.deadwoodM3PerHa} m³/ha`,
      current: `${estimatedDeadwood.toFixed(1)} m³/ha`,
      compliant: deadwoodCompliant,
      gap: deadwoodGap > 0 ? `${deadwoodGap.toFixed(1)} m³/ha deficit` : null
    },
    {
      name: 'Retention Trees',
      target: `${NRL_TARGETS.retentionTreesPerHa} trees/ha at harvest`,
      current: 'Assessed at harvest',
      compliant: null,
      gap: null
    },
    {
      name: 'Structural Diversity',
      target: 'Uneven-aged management',
      current: hasUnevenStructure ? 'Age suggests potential' : 'Young stand — limited structure',
      compliant: hasUnevenStructure,
      gap: null
    }
  ];

  const compliantCount = targets.filter(t => t.compliant === true).length;
  const totalAssessable = targets.filter(t => t.compliant !== null).length;

  return {
    overallStatus: compliantCount === totalAssessable ? 'Compliant' : 'Partial',
    compliantCount,
    totalTargets: totalAssessable,
    targets,
    estimatedDeadwood,
    recommendations: generateNRLRecommendations(deadwoodCompliant, hasUnevenStructure)
  };
}

/**
 * Compare protection vs harvest: trade-off analysis.
 */
export function compareProtectionVsHarvest(timberValue, compensationValue, carbonCreditValue) {
  const harvestValue = timberValue;
  const protectValue = compensationValue + (carbonCreditValue || 0);
  const difference = protectValue - harvestValue;

  return {
    harvestValue,
    protectValue,
    carbonCreditValue: carbonCreditValue || 0,
    compensationValue,
    difference,
    betterOption: difference >= 0 ? 'protection' : 'harvest',
    protectionPremium: harvestValue > 0 ? ((protectValue / harvestValue - 1) * 100) : 0
  };
}

function generateNRLRecommendations(deadwoodOk, structureOk) {
  const recs = [];
  if (!deadwoodOk) {
    recs.push('Leave fallen trees and high stumps during thinning to increase deadwood');
    recs.push('Ring-bark 2-3 trees per hectare to create standing deadwood');
  }
  if (!structureOk) {
    recs.push('Transition to continuous cover forestry (CCF) for uneven-aged structure');
    recs.push('Use gap harvesting instead of clearcuts to promote regeneration diversity');
  }
  if (deadwoodOk && structureOk) {
    recs.push('Forest meets current NRL targets — maintain management practices');
  }
  return recs;
}
