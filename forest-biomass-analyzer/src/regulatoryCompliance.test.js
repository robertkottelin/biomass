import {
  assessMetsoEligibility,
  estimateMetsoCompensation,
  assessNRLCompliance,
  compareProtectionVsHarvest
} from './regulatoryCompliance';

describe('assessMetsoEligibility', () => {
  test('old high-biodiversity pine forest is Class I', () => {
    const result = assessMetsoEligibility('pine', 170, 80, 20);
    expect(result.metsoClass).toBe('I');
    expect(result.eligible).toBe(true);
  });

  test('medium-age moderate-biodiversity is Class II or III', () => {
    const result = assessMetsoEligibility('pine', 110, 60, 20);
    expect(['II', 'III']).toContain(result.metsoClass);
    expect(result.eligible).toBe(true);
  });

  test('young forest is not eligible', () => {
    const result = assessMetsoEligibility('pine', 30, 30, 20);
    expect(result.metsoClass).toBeNull();
    expect(result.eligible).toBe(false);
  });

  test('provides next class requirements when not top class', () => {
    const result = assessMetsoEligibility('pine', 90, 45, 20);
    expect(result.nextClassRequirements).toBeDefined();
    expect(result.nextClassRequirements.targetClass).toBeDefined();
  });

  test('Class I has no next class requirements', () => {
    const result = assessMetsoEligibility('pine', 170, 80, 20);
    expect(result.nextClassRequirements).toBeNull();
  });

  test('works for all species', () => {
    ['pine', 'fir', 'birch', 'aspen'].forEach(type => {
      const result = assessMetsoEligibility(type, 200, 80, 20);
      expect(result.eligible).toBe(true);
      expect(result.metsoClass).toBe('I');
    });
  });

  test('birch has lower age requirements', () => {
    const birch = assessMetsoEligibility('birch', 55, 45, 20);
    const pine = assessMetsoEligibility('pine', 55, 45, 20);
    expect(birch.eligible).toBe(true);
    expect(pine.eligible).toBe(false);
  });
});

describe('estimateMetsoCompensation', () => {
  test('permanent protection pays 100% of timber value', () => {
    const result = estimateMetsoCompensation(50000, 'permanent');
    expect(result.lumpSum).toBe(50000);
    expect(result.annualPayment).toBe(0);
    expect(result.type).toBe('Permanent Protection');
  });

  test('temporary protection pays 70% upfront + annual', () => {
    const result = estimateMetsoCompensation(50000, 'temporary');
    expect(result.lumpSum).toBe(35000);
    expect(result.annualPayment).toBeGreaterThan(0);
    expect(result.totalOver20Years).toBeGreaterThan(result.lumpSum);
  });

  test('total compensation over 20 years exceeds lump sum for temporary', () => {
    const result = estimateMetsoCompensation(100000, 'temporary');
    expect(result.totalOver20Years).toBeGreaterThan(result.lumpSum);
  });
});

describe('assessNRLCompliance', () => {
  test('old forest with high volume is compliant', () => {
    const result = assessNRLCompliance('pine', 100, 300);
    expect(result.overallStatus).toBeDefined();
    expect(result.targets.length).toBeGreaterThan(0);
  });

  test('young forest has deadwood deficit', () => {
    const result = assessNRLCompliance('pine', 20, 50);
    const deadwoodTarget = result.targets.find(t => t.name === 'Deadwood Volume');
    expect(deadwoodTarget.compliant).toBe(false);
    expect(deadwoodTarget.gap).toBeDefined();
  });

  test('provides recommendations', () => {
    const result = assessNRLCompliance('pine', 30, 100);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  test('estimated deadwood increases with age', () => {
    const young = assessNRLCompliance('pine', 30, 200);
    const old = assessNRLCompliance('pine', 90, 200);
    expect(old.estimatedDeadwood).toBeGreaterThan(young.estimatedDeadwood);
  });

  test('works for all species', () => {
    ['pine', 'fir', 'birch', 'aspen'].forEach(type => {
      const result = assessNRLCompliance(type, 50, 150);
      expect(result.targets).toBeDefined();
      expect(result.overallStatus).toBeDefined();
    });
  });
});

describe('compareProtectionVsHarvest', () => {
  test('protection wins when compensation exceeds timber value', () => {
    const result = compareProtectionVsHarvest(50000, 60000, 10000);
    expect(result.betterOption).toBe('protection');
    expect(result.difference).toBeGreaterThan(0);
  });

  test('harvest wins when timber value is higher', () => {
    const result = compareProtectionVsHarvest(100000, 40000, 5000);
    expect(result.betterOption).toBe('harvest');
    expect(result.difference).toBeLessThan(0);
  });

  test('includes carbon credit value in protection', () => {
    const withCarbon = compareProtectionVsHarvest(50000, 40000, 15000);
    const withoutCarbon = compareProtectionVsHarvest(50000, 40000, 0);
    expect(withCarbon.protectValue).toBeGreaterThan(withoutCarbon.protectValue);
  });

  test('handles zero timber value', () => {
    const result = compareProtectionVsHarvest(0, 10000, 5000);
    expect(result.betterOption).toBe('protection');
    expect(result.protectionPremium).toBe(0);
  });

  test('handles null carbon credit value', () => {
    const result = compareProtectionVsHarvest(50000, 60000, null);
    expect(result.carbonCreditValue).toBe(0);
    expect(result.protectValue).toBe(60000);
  });
});
