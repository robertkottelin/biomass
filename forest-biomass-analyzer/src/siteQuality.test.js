import {
  assessSiteQuality,
  computeSiteQualityIndex,
  computeHealthAdjustment,
  computeGrowthVigor,
  computeObservedBiomassGrowth,
  computeMoistureStress,
  generateInsights
} from './siteQuality';

// Helper: generate biomass data spanning multiple years with given NDVI
const makeBiomassData = (peakNdvi, years = 5) => {
  const data = [];
  for (let y = 0; y < years; y++) {
    // 6 entries per year (growing season)
    for (let m = 0; m < 6; m++) {
      data.push({
        date: `${2020 + y}-0${m + 4}-15`,
        year: 2020 + y,
        ndvi: peakNdvi - 0.05 + Math.random() * 0.05, // slight variation below peak
        ndmi: 0.2,
        biomass: 150
      });
    }
    // Peak entry
    data.push({
      date: `${2020 + y}-07-15`,
      year: 2020 + y,
      ndvi: peakNdvi,
      ndmi: 0.25,
      biomass: 150
    });
  }
  return data;
};

const makeHealthEstimate = (overrides = {}) => ({
  healthScore: 85,
  gradualDecline: null,
  disturbanceEvents: [],
  currentProbableCauses: [],
  ...overrides
});

describe('computeSiteQualityIndex', () => {
  test('high-NDVI forest returns SQI > 1.0', () => {
    // Pine at age 35 with NDVI 0.82 (saturation is 0.85, expected at 35 = 0.85*(1-exp(-0.08*35)) ≈ 0.78)
    const data = makeBiomassData(0.82, 5);
    const sqi = computeSiteQualityIndex(data, 'pine', 35);
    expect(sqi).toBeGreaterThan(1.0);
  });

  test('low-NDVI forest returns SQI < 1.0', () => {
    const data = makeBiomassData(0.55, 5);
    const sqi = computeSiteQualityIndex(data, 'pine', 35);
    expect(sqi).toBeLessThan(1.0);
  });

  test('returns 1.0 for insufficient data', () => {
    expect(computeSiteQualityIndex([], 'pine', 35)).toBe(1.0);
    expect(computeSiteQualityIndex(null, 'pine', 35)).toBe(1.0);
  });

  test('clamps to [0.6, 1.5]', () => {
    const veryLow = makeBiomassData(0.1, 5);
    expect(computeSiteQualityIndex(veryLow, 'pine', 60)).toBeGreaterThanOrEqual(0.6);

    const veryHigh = makeBiomassData(0.95, 3);
    expect(computeSiteQualityIndex(veryHigh, 'pine', 10)).toBeLessThanOrEqual(1.5);
  });
});

describe('computeHealthAdjustment', () => {
  test('critical health (< 40) returns urgency >= 8', () => {
    const urgency = computeHealthAdjustment(makeHealthEstimate({ healthScore: 30 }));
    expect(urgency).toBeGreaterThanOrEqual(8);
  });

  test('poor health (< 60) returns urgency >= 4', () => {
    const urgency = computeHealthAdjustment(makeHealthEstimate({ healthScore: 55 }));
    expect(urgency).toBeGreaterThanOrEqual(4);
  });

  test('gradual decline increases urgency', () => {
    const noDecline = computeHealthAdjustment(makeHealthEstimate());
    const withDecline = computeHealthAdjustment(makeHealthEstimate({
      gradualDecline: { slopePerYear: -0.02 }
    }));
    expect(withDecline).toBeGreaterThan(noDecline);
  });

  test('bark beetle in causes increases urgency', () => {
    const noPest = computeHealthAdjustment(makeHealthEstimate());
    const withPest = computeHealthAdjustment(makeHealthEstimate({
      currentProbableCauses: [{ cause: 'Bark beetle infestation' }]
    }));
    expect(withPest).toBeGreaterThan(noPest);
  });

  test('null health returns 0', () => {
    expect(computeHealthAdjustment(null)).toBe(0);
  });

  test('healthy forest returns 0', () => {
    expect(computeHealthAdjustment(makeHealthEstimate({ healthScore: 90 }))).toBe(0);
  });
});

describe('computeGrowthVigor', () => {
  test('declining NDVI gives positive urgency', () => {
    // Create data with declining yearly peaks
    const data = [];
    for (let y = 0; y < 5; y++) {
      data.push({
        date: `${2020 + y}-07-15`,
        year: 2020 + y,
        ndvi: 0.8 - y * 0.03,
        ndmi: 0.2,
        biomass: 150
      });
    }
    const result = computeGrowthVigor(data);
    expect(result.slope).toBeLessThan(0);
    expect(result.urgency).toBeGreaterThan(0);
  });

  test('stable NDVI gives zero urgency', () => {
    const data = makeBiomassData(0.75, 5);
    const result = computeGrowthVigor(data);
    expect(result.urgency).toBe(0);
  });
});

describe('computeObservedBiomassGrowth', () => {
  test('returns null for insufficient data', () => {
    expect(computeObservedBiomassGrowth(null, 'pine')).toBeNull();
    expect(computeObservedBiomassGrowth([], 'pine')).toBeNull();
    expect(computeObservedBiomassGrowth([{ date: '2020-07-15', year: 2020, ndvi: 0.7, biomass: 100 }], 'pine')).toBeNull();
  });

  test('uses biomass-based growth when biomass is increasing', () => {
    // Create data where biomass increases ~14 t/ha/year
    const data = [];
    for (let y = 0; y < 5; y++) {
      for (let m = 0; m < 6; m++) {
        data.push({
          date: `${2020 + y}-0${m + 4}-15`,
          year: 2020 + y,
          ndvi: 0.7 + y * 0.01,
          ndmi: 0.2,
          biomass: 200 + y * 14 + (m === 3 ? 0 : -5) // peak at m=3
        });
      }
    }
    const result = computeObservedBiomassGrowth(data, 'pine');
    expect(result).not.toBeNull();
    expect(result.annualGrowthRate).toBeGreaterThanOrEqual(10);
    expect(result.biomassGrowthRate).toBeGreaterThan(0);
  });

  test('returns max of biomass-based and ndvi-based growth', () => {
    const data = [];
    for (let y = 0; y < 5; y++) {
      data.push({
        date: `${2020 + y}-07-15`,
        year: 2020 + y,
        ndvi: 0.7 + y * 0.02,
        ndmi: 0.2,
        biomass: 200 + y * 20 // biomass grows faster than NDVI suggests
      });
      // Add filler entries
      for (let m = 0; m < 3; m++) {
        data.push({
          date: `${2020 + y}-0${m + 4}-15`,
          year: 2020 + y,
          ndvi: 0.65 + y * 0.02,
          ndmi: 0.2,
          biomass: 180 + y * 20
        });
      }
    }
    const result = computeObservedBiomassGrowth(data, 'pine');
    expect(result.annualGrowthRate).toBe(Math.max(result.biomassGrowthRate, result.ndviGrowthRate));
  });

  test('latestNdviBiomass is age-independent', () => {
    const data = [];
    for (let y = 0; y < 3; y++) {
      data.push({
        date: `${2020 + y}-07-15`,
        year: 2020 + y,
        ndvi: 0.75,
        ndmi: 0.2,
        biomass: 300
      });
      data.push({
        date: `${2020 + y}-05-15`,
        year: 2020 + y,
        ndvi: 0.70,
        ndmi: 0.2,
        biomass: 280
      });
    }
    const result = computeObservedBiomassGrowth(data, 'pine');
    // latestNdviBiomass = maxBiomass * (ndvi / ndviSaturation) = 450 * (0.75 / 0.85) ≈ 397
    expect(result.latestNdviBiomass).toBeCloseTo(450 * (0.75 / 0.85), 0);
  });

  test('declineUrgency is 5 when recent biomass is flat/declining', () => {
    const data = [];
    for (let y = 0; y < 5; y++) {
      data.push({
        date: `${2020 + y}-07-15`,
        year: 2020 + y,
        ndvi: 0.75 - y * 0.01,
        ndmi: 0.2,
        biomass: 300 - y * 5 // declining
      });
      data.push({
        date: `${2020 + y}-05-15`,
        year: 2020 + y,
        ndvi: 0.70 - y * 0.01,
        ndmi: 0.2,
        biomass: 280 - y * 5
      });
    }
    const result = computeObservedBiomassGrowth(data, 'pine');
    expect(result.declineUrgency).toBe(5);
  });

  test('returns latestNdvi from last yearly peak', () => {
    const data = [];
    for (let y = 0; y < 3; y++) {
      data.push({
        date: `${2020 + y}-07-15`,
        year: 2020 + y,
        ndvi: 0.75,
        ndmi: 0.2,
        biomass: 300
      });
      data.push({
        date: `${2020 + y}-05-15`,
        year: 2020 + y,
        ndvi: 0.70,
        ndmi: 0.2,
        biomass: 280
      });
    }
    const result = computeObservedBiomassGrowth(data, 'pine');
    expect(result.latestNdvi).toBeCloseTo(0.75, 2);
  });

  test('declineUrgency is 0 when biomass is growing', () => {
    const data = [];
    for (let y = 0; y < 5; y++) {
      data.push({
        date: `${2020 + y}-07-15`,
        year: 2020 + y,
        ndvi: 0.7 + y * 0.02,
        ndmi: 0.2,
        biomass: 200 + y * 15
      });
      data.push({
        date: `${2020 + y}-05-15`,
        year: 2020 + y,
        ndvi: 0.65 + y * 0.02,
        ndmi: 0.2,
        biomass: 180 + y * 15
      });
    }
    const result = computeObservedBiomassGrowth(data, 'pine');
    expect(result.declineUrgency).toBe(0);
  });
});

describe('computeMoistureStress', () => {
  test('high stress ratio detected', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      date: `2024-0${(i % 9) + 1}-15`,
      ndmi: i < 6 ? -0.2 : 0.3 // 60% stressed
    }));
    const result = computeMoistureStress(data, null);
    expect(result.stressRatio).toBeGreaterThan(0.4);
    expect(result.urgency).toBeGreaterThanOrEqual(3);
  });

  test('no stress when NDMI is positive', () => {
    const data = makeBiomassData(0.75, 3);
    const result = computeMoistureStress(data, null);
    expect(result.stressRatio).toBe(0);
    expect(result.urgency).toBe(0);
  });
});

describe('assessSiteQuality', () => {
  test('returns null for empty data', () => {
    expect(assessSiteQuality([], null, null, 'pine', 35)).toBeNull();
    expect(assessSiteQuality(null, null, null, 'pine', 35)).toBeNull();
  });

  test('returns complete shape with valid data', () => {
    const data = makeBiomassData(0.75, 5);
    const result = assessSiteQuality(data, null, null, 'pine', 35);
    expect(result).toHaveProperty('siteQualityIndex');
    expect(result).toHaveProperty('harvestUrgency');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('factors');
    expect(result).toHaveProperty('insights');
    expect(result.factors).toHaveProperty('siteQuality');
    expect(result.factors).toHaveProperty('healthAdjustment');
    expect(result.factors).toHaveProperty('growthVigor');
    expect(result.factors).toHaveProperty('moistureStress');
  });

  test('insights array is non-empty and well-formed', () => {
    const data = makeBiomassData(0.75, 5);
    const result = assessSiteQuality(data, makeHealthEstimate(), null, 'pine', 35);
    expect(result.insights.length).toBeGreaterThan(0);
    result.insights.forEach(insight => {
      expect(['positive', 'warning', 'critical', 'info']).toContain(insight.type);
      expect(typeof insight.text).toBe('string');
      expect(insight.text.length).toBeGreaterThan(0);
    });
  });

  test('null health data has no health urgency', () => {
    const data = makeBiomassData(0.75, 5);
    const result = assessSiteQuality(data, null, null, 'pine', 35);
    expect(result.factors.healthAdjustment.value).toBe(0);
  });

  test('confidence is high when all data sources present', () => {
    const data = makeBiomassData(0.75, 5);
    const health = makeHealthEstimate();
    const vegStats = { data: [{ outputs: { ndvi: { bands: { B0: { stats: { stDev: 0.05 } } } } } }] };
    const result = assessSiteQuality(data, health, vegStats, 'pine', 35);
    expect(result.confidence).toBe('high');
  });

  test('confidence is low with minimal data', () => {
    const data = makeBiomassData(0.75, 5);
    const result = assessSiteQuality(data, null, null, 'pine', 35);
    expect(result.confidence).toBe('low');
  });

  test('defaults to pine for unknown type', () => {
    const data = makeBiomassData(0.75, 5);
    const result = assessSiteQuality(data, null, null, 'oak', 35);
    expect(result).not.toBeNull();
    expect(result.siteQualityIndex).toBeGreaterThan(0);
  });
});

describe('generateInsights', () => {
  test('generates at least one insight', () => {
    const factors = {
      siteQuality: { value: 1.15, label: 'Above-average' },
      healthAdjustment: { value: 0, label: 'No issues' },
      growthVigor: { value: 0.003, label: 'Stable' },
      moistureStress: { value: 0, label: 'None' }
    };
    const insights = generateInsights(factors, 'pine', 35);
    expect(insights.length).toBeGreaterThan(0);
  });

  test('critical health generates critical insight', () => {
    const factors = {
      siteQuality: { value: 1.0, label: 'Average' },
      healthAdjustment: { value: 10, label: 'Significant' },
      growthVigor: { value: -0.02, label: 'Declining' },
      moistureStress: { value: 0.5, label: 'Stress' }
    };
    const insights = generateInsights(factors, 'pine', 35);
    expect(insights.some(i => i.type === 'critical')).toBe(true);
  });
});
