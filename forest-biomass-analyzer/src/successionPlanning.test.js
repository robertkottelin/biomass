import {
  calculateInheritanceTax,
  projectManagementScenarios,
  generateAssetSummary,
  estimateManagementWorkload,
  INHERITANCE_TAX_CLASS_I,
  FOREST_TAX_VALUE_RATIO,
  LAND_VALUE_PER_HA
} from './successionPlanning';

describe('calculateInheritanceTax', () => {
  test('zero value has zero tax', () => {
    const result = calculateInheritanceTax(0);
    expect(result.tax).toBe(0);
  });

  test('small estate below threshold has zero tax', () => {
    // Fair market value of €40,000 → taxable = 40000 * 0.4 = 16,000 → below 20,000 threshold
    const result = calculateInheritanceTax(40000);
    expect(result.tax).toBe(0);
  });

  test('progressive rates increase with value', () => {
    const small = calculateInheritanceTax(200000);
    const large = calculateInheritanceTax(1000000);
    expect(large.effectiveRate).toBeGreaterThan(small.effectiveRate);
  });

  test('tax ratio is applied correctly', () => {
    const result = calculateInheritanceTax(500000);
    expect(result.taxableValue).toBe(Math.round(500000 * FOREST_TAX_VALUE_RATIO));
  });

  test('known bracket calculation for €250,000 FMV', () => {
    // taxable = 250000 * 0.4 = 100,000
    // Falls in 60,000-200,000 bracket: base 3400 + (100000-60000) * 0.13 = 3400 + 5200 = 8600
    const result = calculateInheritanceTax(250000);
    expect(result.tax).toBe(8600);
  });

  test('large estate uses highest bracket', () => {
    // FMV = 5,000,000 → taxable = 2,000,000
    // Falls in 1,000,000+ bracket: base 149600 + (2000000-1000000) * 0.19 = 149600 + 190000 = 339600
    const result = calculateInheritanceTax(5000000);
    expect(result.tax).toBe(339600);
  });
});

describe('projectManagementScenarios', () => {
  test('returns three scenarios', () => {
    const result = projectManagementScenarios('pine', 40, 10, 30);
    expect(result.active).toBeDefined();
    expect(result.hold).toBeDefined();
    expect(result.sellInvest).toBeDefined();
  });

  test('each scenario has correct number of data points', () => {
    const result = projectManagementScenarios('pine', 40, 10, 30);
    expect(result.active.data).toHaveLength(31); // 0 to 30 inclusive
    expect(result.hold.data).toHaveLength(31);
    expect(result.sellInvest.data).toHaveLength(31);
  });

  test('sell+invest grows exponentially', () => {
    const result = projectManagementScenarios('pine', 40, 10, 30);
    const first = result.sellInvest.data[0].value;
    const last = result.sellInvest.data[30].value;
    expect(last).toBeGreaterThan(first);
    // Should roughly be 1.05^30 ≈ 4.32x
    expect(last / first).toBeGreaterThan(3);
  });

  test('all values are positive', () => {
    const result = projectManagementScenarios('pine', 40, 10, 30);
    result.active.data.forEach(d => expect(d.value).toBeGreaterThanOrEqual(0));
    result.hold.data.forEach(d => expect(d.value).toBeGreaterThanOrEqual(0));
    result.sellInvest.data.forEach(d => expect(d.value).toBeGreaterThan(0));
  });

  test('works for all species', () => {
    ['pine', 'fir', 'birch', 'aspen'].forEach(type => {
      const result = projectManagementScenarios(type, 40, 10, 20);
      expect(result.active.data.length).toBe(21);
    });
  });

  test('scenarios have labels and descriptions', () => {
    const result = projectManagementScenarios('pine', 40, 10, 20);
    expect(result.active.label).toBeDefined();
    expect(result.hold.description).toBeDefined();
    expect(result.sellInvest.description).toMatch(/Sell now/);
  });
});

describe('generateAssetSummary', () => {
  test('uses land + max(timber, carbon) when timber is higher', () => {
    const result = generateAssetSummary(100000, 50000, 20000, 10);
    expect(result.totalValue).toBe(150000); // 50k land + 100k timber
    expect(result.betterUse).toBe('timber');
  });

  test('uses carbon when higher than timber', () => {
    const result = generateAssetSummary(30000, 50000, 80000, 10);
    expect(result.totalValue).toBe(130000); // 50k land + 80k carbon
    expect(result.betterUse).toBe('carbon');
  });

  test('per hectare calculation is correct', () => {
    const result = generateAssetSummary(100000, 50000, 20000, 10);
    expect(result.perHectare).toBe(15000);
  });

  test('breakdown percentages sum to ~100', () => {
    const result = generateAssetSummary(100000, 50000, 20000, 10);
    const total = parseFloat(result.breakdown.landPercent) +
      parseFloat(result.breakdown.forestUsePercent);
    expect(total).toBeCloseTo(100, 0);
  });

  test('handles null carbon credit value', () => {
    const result = generateAssetSummary(100000, 50000, null, 10);
    expect(result.carbonCreditValue).toBe(0);
    expect(result.totalValue).toBe(150000); // land + timber
  });

  test('handles zero area', () => {
    const result = generateAssetSummary(100000, 50000, 20000, 0);
    expect(result.perHectare).toBe(0);
  });
});

describe('estimateManagementWorkload', () => {
  test('active management has highest hours', () => {
    const active = estimateManagementWorkload(50, 'active');
    const hold = estimateManagementWorkload(50, 'hold');
    expect(active.totalHoursPerYear).toBeGreaterThan(hold.totalHoursPerYear);
  });

  test('sell+invest has lowest hours', () => {
    const result = estimateManagementWorkload(50, 'sellInvest');
    const active = estimateManagementWorkload(50, 'active');
    expect(result.totalHoursPerYear).toBeLessThan(active.totalHoursPerYear);
  });

  test('scales with area', () => {
    const small = estimateManagementWorkload(10, 'active');
    const large = estimateManagementWorkload(100, 'active');
    expect(large.totalHoursPerYear).toBeGreaterThan(small.totalHoursPerYear);
  });

  test('includes overhead for non-sell strategies', () => {
    const active = estimateManagementWorkload(10, 'active');
    expect(active.overhead).toBeGreaterThan(0);
  });
});

describe('constants', () => {
  test('tax brackets are ordered', () => {
    for (let i = 1; i < INHERITANCE_TAX_CLASS_I.length; i++) {
      expect(INHERITANCE_TAX_CLASS_I[i].min).toBeGreaterThanOrEqual(INHERITANCE_TAX_CLASS_I[i - 1].max);
    }
  });

  test('tax ratio is between 0 and 1', () => {
    expect(FOREST_TAX_VALUE_RATIO).toBeGreaterThan(0);
    expect(FOREST_TAX_VALUE_RATIO).toBeLessThan(1);
  });

  test('land values decrease from south to north', () => {
    expect(LAND_VALUE_PER_HA.south).toBeGreaterThan(LAND_VALUE_PER_HA.central);
    expect(LAND_VALUE_PER_HA.central).toBeGreaterThan(LAND_VALUE_PER_HA.north);
  });
});
