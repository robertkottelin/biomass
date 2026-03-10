// Carbon credit certification pathway calculator
// EU Carbon Farming Framework — group certification support

import { compareScenarios, estimateCarbonCreditValue, projectCarbonStock } from './carbonCalculation';

// Certification costs (EUR) based on Verra VCS and Gold Standard fee schedules
export const CERTIFICATION_COSTS = {
  initialAudit: 15000,
  annualVerification: 5000,
  registryFee: 0.30, // per credit
  minViableArea: 200  // hectares
};

// Voluntary carbon credit market prices (EUR per t CO2e)
export const VOLUNTARY_CREDIT_PRICE = {
  low: 15,
  avg: 30,
  high: 50
};

// Certification schemes applicable to Finnish forests
const CERTIFICATION_SCHEMES = {
  verraVCS: {
    name: 'Verra VCS (Verified Carbon Standard)',
    minArea: 100,
    minAge: 0,
    minHealthScore: 0,
    requiresAdditionality: true,
    creditPeriod: 30,
    description: 'International standard, highest market liquidity'
  },
  goldStandard: {
    name: 'Gold Standard',
    minArea: 50,
    minAge: 0,
    minHealthScore: 50,
    requiresAdditionality: true,
    creditPeriod: 20,
    description: 'Premium pricing, requires co-benefits (biodiversity/community)'
  },
  finnishNational: {
    name: 'Finnish National Carbon Sink Registry',
    minArea: 5,
    minAge: 0,
    minHealthScore: 0,
    requiresAdditionality: false,
    creditPeriod: 10,
    description: 'Lower barrier, domestic market, suitable for small holdings'
  }
};

/**
 * Assess eligibility for different certification schemes.
 */
export function assessCertificationEligibility(forestType, forestAge, areaHectares, healthScore) {
  const results = {};

  for (const [key, scheme] of Object.entries(CERTIFICATION_SCHEMES)) {
    const effectiveHealth = healthScore != null ? healthScore : 70;
    const eligible = areaHectares >= scheme.minArea &&
      forestAge >= scheme.minAge &&
      effectiveHealth >= scheme.minHealthScore;

    const barriers = [];
    if (areaHectares < scheme.minArea) {
      barriers.push(`Area (${areaHectares} ha) below minimum ${scheme.minArea} ha — consider group certification`);
    }
    if (effectiveHealth < scheme.minHealthScore) {
      barriers.push(`Health score (${healthScore}) below minimum ${scheme.minHealthScore}`);
    }

    results[key] = {
      ...scheme,
      eligible,
      barriers
    };
  }

  return results;
}

/**
 * Estimate additionality gap: extra carbon sequestered vs. business-as-usual.
 * Uses compareScenarios output to calculate the difference.
 */
export function estimateAdditionalityGap(scenarios) {
  if (!scenarios) return null;

  // Additionality = continue growing cumulative - harvest+replant cumulative
  // This represents the carbon benefit of NOT harvesting
  const continueSeq = scenarios.continueGrowing.cumulativeSequestration;
  const harvestSeq = scenarios.harvestReplant.cumulativeSequestration;
  const optimalSeq = scenarios.optimal.cumulativeSequestration;

  return {
    vsHarvest: continueSeq - harvestSeq,
    vsOptimal: continueSeq - optimalSeq,
    continueGrowingTotal: continueSeq,
    harvestReplantTotal: harvestSeq,
    optimalTotal: optimalSeq,
    additionalityPerYear: (continueSeq - harvestSeq) / 30 // 30-year projection
  };
}

/**
 * Calculate certification ROI: costs vs revenue over 20 years, find breakeven year.
 */
export function calculateCertificationROI(additionalityPerYear, areaHectares) {
  const years = 20;
  const costs = {
    year0: CERTIFICATION_COSTS.initialAudit,
    annual: CERTIFICATION_COSTS.annualVerification,
    perCredit: CERTIFICATION_COSTS.registryFee
  };

  const projections = [];
  let cumulativeCost = costs.year0;
  let cumulativeRevenue = 0;
  let breakevenYear = null;

  for (let y = 1; y <= years; y++) {
    const creditsThisYear = additionalityPerYear * areaHectares;
    const revenueThisYear = creditsThisYear * VOLUNTARY_CREDIT_PRICE.avg;
    const costThisYear = costs.annual + creditsThisYear * costs.perCredit;

    cumulativeCost += costThisYear;
    cumulativeRevenue += revenueThisYear;

    const netValue = cumulativeRevenue - cumulativeCost;

    if (breakevenYear === null && netValue >= 0) {
      breakevenYear = y;
    }

    projections.push({
      year: y,
      annualRevenue: revenueThisYear,
      annualCost: costThisYear,
      cumulativeRevenue,
      cumulativeCost,
      netValue
    });
  }

  return {
    totalRevenue: cumulativeRevenue,
    totalCost: cumulativeCost,
    netValue: cumulativeRevenue - cumulativeCost,
    breakevenYear,
    projections,
    creditsPerYear: additionalityPerYear * areaHectares,
    priceAssumption: VOLUNTARY_CREDIT_PRICE.avg
  };
}

/**
 * Calculate group certification viability: how many members needed for minimum viable area.
 */
export function calculateGroupViability(areaHectares) {
  const minArea = CERTIFICATION_COSTS.minViableArea;

  if (areaHectares <= 0) {
    return {
      viable: false,
      membersNeeded: Infinity,
      areaGap: minArea,
      costPerHectare: Infinity,
      costPerMember: null,
      recommendation: 'Area must be greater than 0 hectares'
    };
  }

  if (areaHectares >= minArea) {
    return {
      viable: true,
      membersNeeded: 1,
      areaGap: 0,
      costPerHectare: (CERTIFICATION_COSTS.initialAudit + CERTIFICATION_COSTS.annualVerification * 5) / areaHectares,
      recommendation: 'Sufficient area for independent certification'
    };
  }

  const membersNeeded = Math.ceil(minArea / areaHectares);
  const totalCostOver5Years = CERTIFICATION_COSTS.initialAudit + CERTIFICATION_COSTS.annualVerification * 5;
  const costPerMember = totalCostOver5Years / membersNeeded;

  return {
    viable: false,
    membersNeeded,
    areaGap: minArea - areaHectares,
    costPerHectare: totalCostOver5Years / minArea,
    costPerMember,
    recommendation: `Join a group certification with ${membersNeeded - 1} other forest owners (${minArea} ha minimum)`
  };
}
