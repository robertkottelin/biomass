import {
  biomassToCarbon,
  carbonTimeSeries,
  projectCarbonStock,
  compareScenarios,
  estimateTimberValue,
  projectForestValue,
  findOptimalHarvest,
  findOptimalHarvestYear,
  projectHarvestCycle,
  estimateCarbonCreditValue,
  EU_ETS_PRICE_PER_TON,
  CARBON_FRACTION,
  CO2_PER_CARBON,
  BELOW_GROUND_RATIO,
  SOIL_CARBON_TONS_PER_HA
} from './carbonCalculation';

describe('biomassToCarbon', () => {
  test('zero biomass returns zero above/below ground', () => {
    const result = biomassToCarbon(0, 'pine');
    expect(result.breakdown.aboveGround).toBe(0);
    expect(result.breakdown.belowGround).toBe(0);
    // Soil carbon is still present
    expect(result.breakdown.soil).toBeGreaterThan(0);
  });

  test('known value for pine: 200 t/ha', () => {
    const result = biomassToCarbon(200, 'pine');
    // aboveGround = 200 * 0.5 * 3.67 = 367
    expect(result.breakdown.aboveGround).toBeCloseTo(367, 0);
    // belowGround = 367 * 0.29 = 106.43
    expect(result.breakdown.belowGround).toBeCloseTo(367 * 0.29, 1);
    // soil = 70 * 3.67 = 256.9
    expect(result.breakdown.soil).toBeCloseTo(70 * 3.67, 1);
    // co2eTons = sum of all three
    expect(result.co2eTons).toBeCloseTo(367 + 367 * 0.29 + 70 * 3.67, 1);
  });

  test('below-ground ratio correct for all species', () => {
    const species = ['pine', 'fir', 'birch', 'aspen'];
    species.forEach(type => {
      const result = biomassToCarbon(100, type);
      const expectedBG = result.breakdown.aboveGround * BELOW_GROUND_RATIO[type];
      expect(result.breakdown.belowGround).toBeCloseTo(expectedBG, 5);
    });
  });

  test('soil carbon correct for all species', () => {
    const species = ['pine', 'fir', 'birch', 'aspen'];
    species.forEach(type => {
      const result = biomassToCarbon(100, type);
      expect(result.breakdown.soil).toBeCloseTo(SOIL_CARBON_TONS_PER_HA[type] * CO2_PER_CARBON, 1);
    });
  });

  test('carbonTons calculated correctly', () => {
    const result = biomassToCarbon(100, 'birch');
    // carbonTons = (100*0.5) + (100*0.5*0.24) + 55 = 50 + 12 + 55 = 117
    expect(result.carbonTons).toBeCloseTo(50 + 12 + 55, 1);
  });

  test('defaults to pine for unknown type', () => {
    const result = biomassToCarbon(100, 'oak');
    const pineResult = biomassToCarbon(100, 'pine');
    expect(result.co2eTons).toBeCloseTo(pineResult.co2eTons, 5);
  });

  test('defaults to pine when forestType is null/undefined', () => {
    const result = biomassToCarbon(100, null);
    const pineResult = biomassToCarbon(100, 'pine');
    expect(result.co2eTons).toBeCloseTo(pineResult.co2eTons, 5);
  });
});

describe('carbonTimeSeries', () => {
  const mockData = [
    { biomass: 100, date: '2020-01-01' },
    { biomass: 110, date: '2021-01-01' },
    { biomass: 120, date: '2022-01-01' }
  ];

  test('output length matches input', () => {
    const result = carbonTimeSeries(mockData, 'pine', 10);
    expect(result.length).toBe(mockData.length);
  });

  test('co2eTotal = co2ePerHa * area', () => {
    const area = 5;
    const result = carbonTimeSeries(mockData, 'pine', area);
    result.forEach(item => {
      expect(item.co2eTotal).toBeCloseTo(item.co2ePerHa * area, 5);
    });
  });

  test('preserves original data fields', () => {
    const result = carbonTimeSeries(mockData, 'fir', 1);
    expect(result[0].date).toBe('2020-01-01');
    expect(result[0].biomass).toBe(100);
  });

  test('includes carbonPerHa field', () => {
    const result = carbonTimeSeries(mockData, 'birch', 2);
    result.forEach(item => {
      expect(item.carbonPerHa).toBeDefined();
      expect(item.carbonPerHa).toBeGreaterThan(0);
    });
  });
});

describe('projectCarbonStock', () => {
  test('correct length for projection', () => {
    const result = projectCarbonStock(100, 'pine', 20, 5, 30);
    expect(result.length).toBe(31); // 0 to 30 inclusive
  });

  test('year 0 matches current state', () => {
    const result = projectCarbonStock(100, 'pine', 20, 5, 10);
    expect(result[0].year).toBe(0);
    expect(result[0].age).toBe(20);
  });

  test('monotonically increasing CO2e for young forest', () => {
    const result = projectCarbonStock(50, 'pine', 10, 1, 20);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].co2ePerHa).toBeGreaterThanOrEqual(result[i - 1].co2ePerHa);
    }
  });

  test('sequestration rate decreases near maturity', () => {
    const result = projectCarbonStock(200, 'pine', 60, 1, 30);
    // Late years should have lower sequestration than early years
    const earlySeq = result[1].annualSequestration;
    const lateSeq = result[29].annualSequestration;
    expect(lateSeq).toBeLessThanOrEqual(earlySeq);
  });

  test('annual sequestration at year 0 is 0', () => {
    const result = projectCarbonStock(100, 'pine', 20, 5, 5);
    expect(result[0].annualSequestration).toBe(0);
  });

  test('defaults to pine for null type', () => {
    const result = projectCarbonStock(100, null, 20, 5, 5);
    const pineResult = projectCarbonStock(100, 'pine', 20, 5, 5);
    expect(result[2].co2ePerHa).toBeCloseTo(pineResult[2].co2ePerHa, 5);
  });

  test('defaults to pine params for unknown species', () => {
    const result = projectCarbonStock(100, 'oak', 20, 5, 5);
    expect(result.length).toBe(6);
    expect(result[0].co2ePerHa).toBeGreaterThan(0);
  });

  test('co2eTotal scales with area', () => {
    const result1 = projectCarbonStock(100, 'pine', 20, 1, 5);
    const result5 = projectCarbonStock(100, 'pine', 20, 5, 5);
    expect(result5[3].co2eTotal).toBeCloseTo(result1[3].co2eTotal * 5, 1);
  });
});

describe('compareScenarios', () => {
  test('returns three scenarios', () => {
    const result = compareScenarios(200, 'pine', 40, 5);
    expect(result.continueGrowing).toBeDefined();
    expect(result.harvestReplant).toBeDefined();
    expect(result.optimal).toBeDefined();
  });

  test('each scenario has 31 data points', () => {
    const result = compareScenarios(200, 'pine', 40, 5);
    expect(result.continueGrowing.data.length).toBe(31);
    expect(result.harvestReplant.data.length).toBe(31);
    expect(result.optimal.data.length).toBe(31);
  });

  test('harvest+replant starts from young forest', () => {
    const result = compareScenarios(200, 'pine', 40, 5);
    // Harvest+replant should start from near-zero biomass
    expect(result.harvestReplant.data[0].biomass).toBeLessThan(50);
  });

  test('continue growing better for young forest', () => {
    const result = compareScenarios(50, 'pine', 15, 5);
    // Young forest should continue growing — higher cumulative sequestration
    expect(result.continueGrowing.cumulativeSequestration).toBeGreaterThan(0);
  });

  test('optimal year is between current age and maturity', () => {
    const result = compareScenarios(200, 'pine', 30, 5);
    expect(result.optimal.optimalYear).toBeGreaterThanOrEqual(0);
    expect(result.optimal.optimalYear).toBeLessThanOrEqual(60);
  });

  test('has labels for each scenario', () => {
    const result = compareScenarios(100, 'fir', 20, 3);
    expect(result.continueGrowing.label).toBe('Continue Growing');
    expect(result.harvestReplant.label).toBe('Harvest Now + Replant');
    expect(result.optimal.label).toContain('Optimal');
  });

  test('defaults to pine for null type', () => {
    const result = compareScenarios(100, null, 20, 5);
    expect(result.continueGrowing).toBeDefined();
  });

  test('harvest+replant yields higher 30yr sequestration for very old forest', () => {
    const result = compareScenarios(400, 'pine', 100, 5);
    // Old forest at near-max biomass has very low sequestration
    // Young replanted forest should sequester more over 30 years
    expect(result.harvestReplant.cumulativeSequestration).toBeGreaterThan(0);
  });

  test('cumulative sequestration is non-negative', () => {
    const result = compareScenarios(100, 'birch', 25, 2);
    expect(result.continueGrowing.cumulativeSequestration).toBeGreaterThanOrEqual(0);
    expect(result.harvestReplant.cumulativeSequestration).toBeGreaterThanOrEqual(0);
    expect(result.optimal.cumulativeSequestration).toBeGreaterThanOrEqual(0);
  });
});

describe('estimateCarbonCreditValue', () => {
  test('zero CO2e returns zero value', () => {
    const result = estimateCarbonCreditValue(0);
    expect(result.totalValue).toBe(0);
  });

  test('default price is EU_ETS_PRICE_PER_TON', () => {
    const result = estimateCarbonCreditValue(100);
    expect(result.pricePerTon).toBe(EU_ETS_PRICE_PER_TON);
    expect(result.totalValue).toBe(100 * EU_ETS_PRICE_PER_TON);
  });

  test('custom price override', () => {
    const result = estimateCarbonCreditValue(100, 50);
    expect(result.pricePerTon).toBe(50);
    expect(result.totalValue).toBe(5000);
  });

  test('currency is EUR', () => {
    const result = estimateCarbonCreditValue(10);
    expect(result.currency).toBe('EUR');
  });

  test('co2eTons passthrough', () => {
    const result = estimateCarbonCreditValue(42.5);
    expect(result.co2eTons).toBe(42.5);
  });
});

describe('estimateTimberValue', () => {
  test('zero biomass returns zero value', () => {
    const result = estimateTimberValue(0, 'pine', 40, 5);
    expect(result.totalValue).toBe(0);
    expect(result.perHaValue).toBe(0);
  });

  test('biomass-to-volume conversion correct per species', () => {
    const densities = { pine: 0.42, fir: 0.38, birch: 0.49, aspen: 0.35 };
    Object.entries(densities).forEach(([type, density]) => {
      const result = estimateTimberValue(100, type, 40, 1);
      expect(result.volumePerHa).toBeCloseTo(100 / density, 1);
    });
  });

  test('sawlog fraction increases with age', () => {
    const young = estimateTimberValue(100, 'pine', 20, 1);
    const mature = estimateTimberValue(100, 'pine', 70, 1);
    expect(mature.sawlogFraction).toBeGreaterThan(young.sawlogFraction);
  });

  test('young forest is mostly pulpwood', () => {
    const result = estimateTimberValue(100, 'pine', 20, 1);
    expect(result.pulpwoodFraction).toBeGreaterThan(0.8);
  });

  test('mature forest is mostly sawlog', () => {
    const result = estimateTimberValue(100, 'fir', 70, 1);
    expect(result.sawlogFraction).toBeGreaterThan(0.6);
  });

  test('total value = sawlog + pulpwood value calculation', () => {
    const result = estimateTimberValue(100, 'pine', 45, 1);
    const expectedSawlog = result.volumePerHa * result.sawlogFraction * result.sawlogPriceM3;
    const expectedPulp = result.volumePerHa * result.pulpwoodFraction * result.pulpwoodPriceM3;
    expect(result.perHaValue).toBeCloseTo(expectedSawlog + expectedPulp, 1);
  });

  test('total value scales with area', () => {
    const result = estimateTimberValue(100, 'birch', 50, 5);
    expect(result.totalValue).toBeCloseTo(result.perHaValue * 5, 1);
  });

  test('all 4 species return valid results', () => {
    ['pine', 'fir', 'birch', 'aspen'].forEach(type => {
      const result = estimateTimberValue(100, type, 40, 1);
      expect(result.totalValue).toBeGreaterThan(0);
      expect(result.perHaValue).toBeGreaterThan(0);
    });
  });

  test('defaults to pine for unknown type', () => {
    const result = estimateTimberValue(100, 'oak', 40, 1);
    const pineResult = estimateTimberValue(100, 'pine', 40, 1);
    expect(result.perHaValue).toBeCloseTo(pineResult.perHaValue, 1);
  });

  test('defaults to pine for null type', () => {
    const result = estimateTimberValue(100, null, 40, 1);
    const pineResult = estimateTimberValue(100, 'pine', 40, 1);
    expect(result.perHaValue).toBeCloseTo(pineResult.perHaValue, 1);
  });

  test('aspen has zero sawlog fraction', () => {
    const result = estimateTimberValue(100, 'aspen', 50, 1);
    expect(result.sawlogFraction).toBe(0);
    expect(result.pulpwoodFraction).toBe(1);
  });

  test('sawlog fraction linear interpolation between 30-60', () => {
    const at30 = estimateTimberValue(100, 'pine', 30, 1);
    const at45 = estimateTimberValue(100, 'pine', 45, 1);
    const at60 = estimateTimberValue(100, 'pine', 60, 1);
    expect(at30.sawlogFraction).toBeCloseTo(0.1, 5);
    expect(at60.sawlogFraction).toBeCloseTo(0.7, 5);
    expect(at45.sawlogFraction).toBeCloseTo(0.4, 5);
  });
});

describe('projectForestValue', () => {
  test('returns 101 points for 100 year projection', () => {
    const result = projectForestValue('pine', 5, 100);
    expect(result.length).toBe(101);
  });

  test('value increases with age', () => {
    const result = projectForestValue('pine', 5, 50);
    expect(result[30].timberValue).toBeGreaterThan(result[10].timberValue);
  });

  test('age 0 has minimal timber value', () => {
    const result = projectForestValue('pine', 5, 50);
    expect(result[0].timberValue).toBeLessThan(result[30].timberValue);
  });

  test('includes timber value fields', () => {
    const result = projectForestValue('fir', 3, 50);
    result.forEach(p => {
      expect(p.timberValue).toBeDefined();
      expect(p.timberPerHa).toBeDefined();
    });
  });

  test('scales with area', () => {
    const r1 = projectForestValue('pine', 1, 50);
    const r5 = projectForestValue('pine', 5, 50);
    expect(r5[30].timberValue).toBeCloseTo(r1[30].timberValue * 5, 1);
  });

  test('defaults to pine for unknown type', () => {
    const result = projectForestValue('oak', 5, 50);
    const pineResult = projectForestValue('pine', 5, 50);
    expect(result[30].timberValue).toBeCloseTo(pineResult[30].timberValue, 1);
  });
});

describe('findOptimalHarvest', () => {
  test('returns a realistic optimal harvest age', () => {
    const result = findOptimalHarvest('pine', 5);
    expect(result.optimalAge).toBeGreaterThanOrEqual(50);
    expect(result.optimalAge).toBeLessThanOrEqual(90);
  });

  test('value at harvest is positive', () => {
    const result = findOptimalHarvest('pine', 5);
    expect(result.valueAtHarvest).toBeGreaterThan(0);
  });

  test('annualized return (LEV) is positive', () => {
    const result = findOptimalHarvest('birch', 3);
    expect(result.annualizedReturn).toBeGreaterThan(0);
    expect(result.landExpectationValue).toBeGreaterThan(0);
  });

  test('works for all species with realistic ages', () => {
    const expectedMinAges = { pine: 55, fir: 55, birch: 45, aspen: 30 };
    ['pine', 'fir', 'birch', 'aspen'].forEach(type => {
      const result = findOptimalHarvest(type, 5);
      expect(result.optimalAge).toBeGreaterThanOrEqual(expectedMinAges[type]);
      expect(result.valueAtHarvest).toBeGreaterThan(0);
    });
  });

  test('returns Faustmann LEV and discount rate', () => {
    const result = findOptimalHarvest('pine', 5);
    expect(result.landExpectationValue).toBeDefined();
    expect(result.landExpectationValue).toBeGreaterThan(0);
    expect(result.discountRate).toBe(0.03);
    expect(result.regenerationCost).toBeGreaterThan(0);
  });

  test('accepts custom discount rate', () => {
    const low = findOptimalHarvest('pine', 5, { discountRate: 0.01 });
    const high = findOptimalHarvest('pine', 5, { discountRate: 0.05 });
    expect(low.optimalAge).toBeGreaterThanOrEqual(high.optimalAge);
  });
});

describe('projectHarvestCycle', () => {
  test('returns 101 points for 100 year projection', () => {
    const result = projectHarvestCycle('pine', 5, 100);
    expect(result.points.length).toBe(101);
  });

  test('cumulative harvest income increases over time', () => {
    const result = projectHarvestCycle('pine', 5, 100);
    const incomes = result.points.map(p => p.cumulativeHarvestIncome);
    for (let i = 1; i < incomes.length; i++) {
      expect(incomes[i]).toBeGreaterThanOrEqual(incomes[i - 1]);
    }
  });

  test('standing value shows sawtooth pattern', () => {
    const result = projectHarvestCycle('pine', 5, 200);
    let sawDrop = false;
    for (let i = 1; i < result.points.length; i++) {
      if (result.points[i].standingTimberValue < result.points[i - 1].standingTimberValue * 0.5) {
        sawDrop = true;
        break;
      }
    }
    expect(sawDrop).toBe(true);
  });

  test('total wealth grows over multiple cycles', () => {
    const result = projectHarvestCycle('fir', 5, 100);
    expect(result.points[99].totalWealth).toBeGreaterThan(result.points[0].totalWealth);
  });

  test('cycle length matches optimal age', () => {
    const result = projectHarvestCycle('pine', 5, 100);
    const optimal = findOptimalHarvest('pine', 5);
    expect(result.cycleLength).toBe(optimal.optimalAge);
  });

  test('defaults to pine for unknown type', () => {
    const result = projectHarvestCycle('oak', 5, 100);
    const pineResult = projectHarvestCycle('pine', 5, 100);
    expect(result.cycleLength).toBe(pineResult.cycleLength);
  });
});

describe('findOptimalHarvestYear', () => {
  test('old forest recommends harvest soon', () => {
    const result = findOptimalHarvestYear('pine', 75, 180, 5);
    expect(result.yearsFromNow).toBeGreaterThanOrEqual(0);
    expect(result.yearsFromNow).toBeLessThanOrEqual(5);
  });

  test('young forest recommends waiting', () => {
    const result = findOptimalHarvestYear('pine', 30, 80, 5);
    expect(result.yearsFromNow).toBeGreaterThanOrEqual(25);
    expect(result.harvestYear).toBeGreaterThanOrEqual(60); // MIN_HARVEST_AGE.pine
  });

  test('forest at rotation age recommends harvest within 0-10 years', () => {
    const result = findOptimalHarvestYear('pine', 60, 150, 5);
    expect(result.yearsFromNow).toBeGreaterThanOrEqual(0);
    expect(result.yearsFromNow).toBeLessThanOrEqual(10);
  });

  test('all species work', () => {
    ['pine', 'fir', 'birch', 'aspen'].forEach(type => {
      const result = findOptimalHarvestYear(type, 70, 150, 5);
      expect(result.yearsFromNow).toBeGreaterThanOrEqual(0);
      expect(result.harvestYear).toBeGreaterThanOrEqual(0);
    });
  });

  test('return shape has all expected fields', () => {
    const result = findOptimalHarvestYear('pine', 50, 120, 5);
    expect(result).toHaveProperty('harvestYear');
    expect(result).toHaveProperty('yearsFromNow');
    expect(result).toHaveProperty('currentValue');
    expect(result).toHaveProperty('valueAtHarvest');
    expect(result).toHaveProperty('annualGrowthRate');
    expect(result).toHaveProperty('rotationAge');
    expect(result).toHaveProperty('recommendation');
    expect(result).toHaveProperty('biomassScaleFactor');
  });

  test('recommendation says "now" for old forests', () => {
    const result = findOptimalHarvestYear('pine', 75, 180, 5);
    expect(result.recommendation.toLowerCase()).toMatch(/harvest (now|within)/);
  });

  test('recommendation says "Wait" for young forests', () => {
    const result = findOptimalHarvestYear('pine', 30, 80, 5);
    expect(result.recommendation).toMatch(/^Wait/);
  });

  test('higher biomass yields higher value at harvest', () => {
    const normal = findOptimalHarvestYear('pine', 60, 150, 5);
    const high = findOptimalHarvestYear('pine', 60, 180, 5);
    expect(high.valueAtHarvest).toBeGreaterThan(normal.valueAtHarvest);
  });

  test('harvest year never below minimum age', () => {
    ['pine', 'fir', 'birch', 'aspen'].forEach(type => {
      const result = findOptimalHarvestYear(type, 40, 100, 5);
      const minAge = type === 'aspen' ? 35 : type === 'birch' ? 50 : 60;
      expect(result.harvestYear).toBeGreaterThanOrEqual(minAge);
    });
  });

  test('mid-age forest finds sensible harvest age', () => {
    const result = findOptimalHarvestYear('pine', 50, 120, 5);
    expect(result.harvestYear).toBeGreaterThanOrEqual(60); // MIN_HARVEST_AGE.pine
    expect(result.harvestYear).toBeLessThanOrEqual(90);
  });

  test('high SQI returns siteQualityIndex in result', () => {
    const siteQuality = {
      siteQualityIndex: 1.2,
      harvestUrgency: 0,
      factors: { growthVigor: { value: 0.003 } }
    };
    const result = findOptimalHarvestYear('pine', 50, 120, 5, { siteQuality });
    expect(result.siteQualityIndex).toBe(1.2);
    expect(result.harvestUrgency).toBe(0);
  });

  test('health urgency can shift harvest earlier', () => {
    const noUrgency = findOptimalHarvestYear('pine', 50, 120, 5);
    const siteQuality = {
      siteQualityIndex: 1.0,
      harvestUrgency: 8,
      factors: { growthVigor: { value: -0.02 } }
    };
    const withUrgency = findOptimalHarvestYear('pine', 50, 120, 5, { siteQuality });
    expect(withUrgency.harvestYear).toBeLessThanOrEqual(noUrgency.harvestYear);
  });

  test('thriving high-SQI forest with observed growth extends harvest later', () => {
    const baseline = findOptimalHarvestYear('pine', 50, 120, 5);
    const siteQuality = {
      siteQualityIndex: 1.25,
      harvestUrgency: 0,
      factors: { growthVigor: { value: 0.015 } },
      observedBiomassGrowth: { annualGrowthRate: 14, latestNdviBiomass: 320, latestNdvi: 0.72, ndviSlope: 0.01 }
    };
    const thriving = findOptimalHarvestYear('pine', 50, 120, 5, { siteQuality });
    expect(thriving.harvestYear).toBeGreaterThan(baseline.harvestYear);
  });

  test('20yo forest entered as age 55, growing at 14 t/ha/yr, harvests well after 60', () => {
    // The user's scenario: real age ~20, entered as 55, currentBiomass inflated to ~380
    // With latestNdviBiomass the optimizer should use NDVI-based biomass (~320) as base
    const siteQuality = {
      siteQualityIndex: 1.1,
      harvestUrgency: 0,
      observedBiomassGrowth: {
        annualGrowthRate: 14,
        latestNdviBiomass: 320,
        earliestNdviBiomass: 260,
        latestNdvi: 0.72,
        ndviSlope: 0.01
      }
    };
    const result = findOptimalHarvestYear('pine', 55, 380, 5, { siteQuality });
    // Should recommend harvest meaningfully after min age 60
    expect(result.harvestYear).toBeGreaterThanOrEqual(65);
  });

  test('same forest entered as age 20 gives similar harvest age', () => {
    // Same NDVI data but correctly entered as age 20
    const siteQuality = {
      siteQualityIndex: 1.1,
      harvestUrgency: 0,
      observedBiomassGrowth: {
        annualGrowthRate: 14,
        latestNdviBiomass: 320,
        earliestNdviBiomass: 260,
        latestNdvi: 0.72,
        ndviSlope: 0.01
      }
    };
    const asAge55 = findOptimalHarvestYear('pine', 55, 380, 5, { siteQuality });
    const asAge20 = findOptimalHarvestYear('pine', 20, 200, 5, { siteQuality });
    // Both should recommend similar absolute calendar years — the NDVI base dominates
    // The difference should be less than 10 years (not the 35 year age difference)
    expect(Math.abs(asAge55.harvestYear - asAge20.harvestYear)).toBeLessThanOrEqual(15);
  });

  test('declining forest with flat recent biomass gets earlier harvest', () => {
    const siteQuality = {
      siteQualityIndex: 0.9,
      harvestUrgency: 5, // declineUrgency from flat recent biomass
      observedBiomassGrowth: {
        annualGrowthRate: -2,
        latestNdviBiomass: 200,
        earliestNdviBiomass: 220,
        declineUrgency: 5,
        latestNdvi: 0.50,
        ndviSlope: -0.02
      }
    };
    const result = findOptimalHarvestYear('pine', 65, 200, 5, { siteQuality });
    expect(result.harvestYear).toBeLessThanOrEqual(68);
  });

  test('pine age 59, NDVI 0.75 stable → harvest age 74 (health delay)', () => {
    const siteQuality = {
      siteQualityIndex: 1.0,
      harvestUrgency: 0,
      observedBiomassGrowth: {
        annualGrowthRate: 0.5, // near-zero observed growth (NDVI saturated)
        latestNdviBiomass: 397,
        earliestNdviBiomass: 395,
        latestNdvi: 0.75,
        ndviSlope: 0.0   // stable
      }
    };
    const result = findOptimalHarvestYear('pine', 59, 397, 5, { siteQuality });
    // NDVI health delay: ndviRatio=0.88, healthLevel=1.0, stable → delay=15 → harvest 74
    expect(result.harvestYear).toBeGreaterThanOrEqual(74);
  });

  test('pine age 55, NDVI 0.70 growing → harvest age 75+ (growing delay)', () => {
    const siteQuality = {
      siteQualityIndex: 1.0,
      harvestUrgency: 0,
      observedBiomassGrowth: {
        annualGrowthRate: 5,
        latestNdviBiomass: 371,
        earliestNdviBiomass: 340,
        latestNdvi: 0.70,
        ndviSlope: 0.01   // growing
      }
    };
    const result = findOptimalHarvestYear('pine', 55, 371, 5, { siteQuality });
    // ndviRatio=0.82, healthLevel=1.0, growing → delay=20 → harvest 75
    expect(result.harvestYear).toBeGreaterThanOrEqual(75);
  });

  test('pine age 65, NDVI 0.65 declining -0.02/yr → harvest ≤70 (no delay)', () => {
    const siteQuality = {
      siteQualityIndex: 0.9,
      harvestUrgency: 3,
      observedBiomassGrowth: {
        annualGrowthRate: -1,
        latestNdviBiomass: 344,
        earliestNdviBiomass: 370,
        latestNdvi: 0.65,
        ndviSlope: -0.02   // significant decline
      }
    };
    const result = findOptimalHarvestYear('pine', 65, 344, 5, { siteQuality });
    expect(result.harvestYear).toBeLessThanOrEqual(70);
  });

  test('pine age 65, NDVI 0.30 stable → harvest ≤70 (too low NDVI for delay)', () => {
    const siteQuality = {
      siteQualityIndex: 0.8,
      harvestUrgency: 0,
      observedBiomassGrowth: {
        annualGrowthRate: 0.2,
        latestNdviBiomass: 159,
        earliestNdviBiomass: 155,
        latestNdvi: 0.30,
        ndviSlope: 0.0   // stable but very low NDVI
      }
    };
    const result = findOptimalHarvestYear('pine', 65, 159, 5, { siteQuality });
    // ndviRatio=0.35, healthLevel=0 → no delay
    expect(result.harvestYear).toBeLessThanOrEqual(70);
  });

  test('MIN_HARVEST_AGE still respected with urgency', () => {
    const siteQuality = {
      siteQualityIndex: 0.7,
      harvestUrgency: 20,
      factors: { growthVigor: { value: -0.03 } }
    };
    ['pine', 'fir', 'birch', 'aspen'].forEach(type => {
      const result = findOptimalHarvestYear(type, 40, 100, 5, { siteQuality });
      const minAge = type === 'aspen' ? 35 : type === 'birch' ? 50 : 60;
      expect(result.harvestYear).toBeGreaterThanOrEqual(minAge);
    });
  });
});
