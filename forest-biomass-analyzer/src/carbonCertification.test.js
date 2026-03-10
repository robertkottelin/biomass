import {
  assessCertificationEligibility,
  estimateAdditionalityGap,
  calculateCertificationROI,
  calculateGroupViability,
  CERTIFICATION_COSTS,
  VOLUNTARY_CREDIT_PRICE
} from './carbonCertification';

describe('assessCertificationEligibility', () => {
  test('large area eligible for all schemes', () => {
    const result = assessCertificationEligibility('pine', 50, 200, 80);
    expect(result.verraVCS.eligible).toBe(true);
    expect(result.goldStandard.eligible).toBe(true);
    expect(result.finnishNational.eligible).toBe(true);
  });

  test('small area only eligible for Finnish national', () => {
    const result = assessCertificationEligibility('pine', 50, 10, 80);
    expect(result.verraVCS.eligible).toBe(false);
    expect(result.goldStandard.eligible).toBe(false);
    expect(result.finnishNational.eligible).toBe(true);
  });

  test('low health score blocks Gold Standard', () => {
    const result = assessCertificationEligibility('pine', 50, 200, 30);
    expect(result.goldStandard.eligible).toBe(false);
    expect(result.goldStandard.barriers.length).toBeGreaterThan(0);
  });

  test('barriers explain why not eligible', () => {
    const result = assessCertificationEligibility('pine', 50, 5, 80);
    expect(result.verraVCS.barriers.length).toBeGreaterThan(0);
    expect(result.verraVCS.barriers[0]).toMatch(/Area/);
  });

  test('works for all species', () => {
    ['pine', 'fir', 'birch', 'aspen'].forEach(type => {
      const result = assessCertificationEligibility(type, 40, 100, 70);
      expect(result.finnishNational.eligible).toBe(true);
    });
  });

  test('healthScore of 0 is treated as 0, not default', () => {
    const result = assessCertificationEligibility('pine', 50, 200, 0);
    expect(result.goldStandard.eligible).toBe(false);
    expect(result.goldStandard.barriers.length).toBeGreaterThan(0);
    expect(result.verraVCS.eligible).toBe(true);
  });
});

describe('estimateAdditionalityGap', () => {
  test('returns null for null input', () => {
    expect(estimateAdditionalityGap(null)).toBeNull();
  });

  test('calculates gap from scenario data', () => {
    const mockScenarios = {
      continueGrowing: { cumulativeSequestration: 50 },
      harvestReplant: { cumulativeSequestration: 30 },
      optimal: { cumulativeSequestration: 40 }
    };
    const result = estimateAdditionalityGap(mockScenarios);
    expect(result.vsHarvest).toBe(20);
    expect(result.vsOptimal).toBe(10);
    expect(result.additionalityPerYear).toBeCloseTo(20 / 30, 5);
  });

  test('additionality per year is averaged over 30 years', () => {
    const mockScenarios = {
      continueGrowing: { cumulativeSequestration: 90 },
      harvestReplant: { cumulativeSequestration: 60 },
      optimal: { cumulativeSequestration: 75 }
    };
    const result = estimateAdditionalityGap(mockScenarios);
    expect(result.additionalityPerYear).toBe(1);
  });
});

describe('calculateCertificationROI', () => {
  test('returns 20-year projection', () => {
    const result = calculateCertificationROI(2.0, 50);
    expect(result.projections).toHaveLength(20);
    expect(result.totalRevenue).toBeGreaterThan(0);
    expect(result.totalCost).toBeGreaterThan(0);
  });

  test('finds breakeven year when profitable', () => {
    const result = calculateCertificationROI(5.0, 100);
    expect(result.breakevenYear).toBeGreaterThan(0);
    expect(result.breakevenYear).toBeLessThanOrEqual(20);
  });

  test('no breakeven when not profitable', () => {
    const result = calculateCertificationROI(0.01, 1);
    expect(result.breakevenYear).toBeNull();
    expect(result.netValue).toBeLessThan(0);
  });

  test('credits per year matches input', () => {
    const result = calculateCertificationROI(3.0, 20);
    expect(result.creditsPerYear).toBe(60);
  });

  test('cumulative values increase over time', () => {
    const result = calculateCertificationROI(2.0, 50);
    for (let i = 1; i < result.projections.length; i++) {
      expect(result.projections[i].cumulativeRevenue).toBeGreaterThanOrEqual(result.projections[i - 1].cumulativeRevenue);
      expect(result.projections[i].cumulativeCost).toBeGreaterThanOrEqual(result.projections[i - 1].cumulativeCost);
    }
  });
});

describe('calculateGroupViability', () => {
  test('large area is independently viable', () => {
    const result = calculateGroupViability(300);
    expect(result.viable).toBe(true);
    expect(result.membersNeeded).toBe(1);
    expect(result.areaGap).toBe(0);
  });

  test('small area needs group certification', () => {
    const result = calculateGroupViability(20);
    expect(result.viable).toBe(false);
    expect(result.membersNeeded).toBe(10);
    expect(result.areaGap).toBe(180);
  });

  test('cost per member decreases with group size', () => {
    const small = calculateGroupViability(10);
    const medium = calculateGroupViability(50);
    expect(medium.costPerHectare).toBeLessThanOrEqual(small.costPerHectare);
  });

  test('boundary case: exactly min viable area', () => {
    const result = calculateGroupViability(CERTIFICATION_COSTS.minViableArea);
    expect(result.viable).toBe(true);
    expect(result.membersNeeded).toBe(1);
  });

  test('zero area returns not viable with Infinity members', () => {
    const result = calculateGroupViability(0);
    expect(result.viable).toBe(false);
    expect(result.membersNeeded).toBe(Infinity);
    expect(result.areaGap).toBe(CERTIFICATION_COSTS.minViableArea);
  });
});

describe('constants', () => {
  test('certification costs are positive', () => {
    expect(CERTIFICATION_COSTS.initialAudit).toBeGreaterThan(0);
    expect(CERTIFICATION_COSTS.annualVerification).toBeGreaterThan(0);
    expect(CERTIFICATION_COSTS.registryFee).toBeGreaterThan(0);
    expect(CERTIFICATION_COSTS.minViableArea).toBeGreaterThan(0);
  });

  test('credit prices are ordered low < avg < high', () => {
    expect(VOLUNTARY_CREDIT_PRICE.low).toBeLessThan(VOLUNTARY_CREDIT_PRICE.avg);
    expect(VOLUNTARY_CREDIT_PRICE.avg).toBeLessThan(VOLUNTARY_CREDIT_PRICE.high);
  });
});
