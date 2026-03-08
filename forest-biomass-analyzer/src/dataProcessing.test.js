import { estimateBiomass, calculateRollingAverage, forestParams } from './dataProcessing';

describe('forestParams', () => {
  it('has parameters for all 4 species', () => {
    expect(forestParams).toHaveProperty('pine');
    expect(forestParams).toHaveProperty('fir');
    expect(forestParams).toHaveProperty('birch');
    expect(forestParams).toHaveProperty('aspen');
  });

  it('each species has required fields', () => {
    for (const species of ['pine', 'fir', 'birch', 'aspen']) {
      expect(forestParams[species]).toHaveProperty('maxBiomass');
      expect(forestParams[species]).toHaveProperty('growthRate');
      expect(forestParams[species]).toHaveProperty('ndviSaturation');
      expect(forestParams[species]).toHaveProperty('youngBiomass');
    }
  });
});

describe('estimateBiomass', () => {
  describe('all 4 species with realistic NDVI values', () => {
    const species = ['pine', 'fir', 'birch', 'aspen'];
    const ndviValues = [0.3, 0.5, 0.65, 0.75, 0.85];

    species.forEach(sp => {
      ndviValues.forEach(ndvi => {
        it(`${sp} with NDVI=${ndvi} returns positive biomass`, () => {
          const result = estimateBiomass(ndvi, sp, 0, 30);
          expect(result).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('edge cases', () => {
    it('negative NDVI returns 0', () => {
      expect(estimateBiomass(-0.5, 'pine', 0, 30)).toBe(0);
      expect(estimateBiomass(-0.1, 'fir', 0, 30)).toBe(0);
    });

    it('NDVI=0 returns youngBiomass (no NDVI contribution)', () => {
      // With NDVI=0, ndviFactor=0 so biomass = youngBiomass + (max-young)*growthFactor*0 = youngBiomass
      // But wait: ndviNormalized = max(0,0)/sat = 0, ndviFactor = 0
      // biomass = young + (max-young)*growthFactor*0 = young
      // Actually at age 30, growthFactor > 0, but ndviFactor = 0
      // So biomass = young + 0 = young
      const result = estimateBiomass(0, 'pine', 0, 30);
      expect(result).toBe(forestParams.pine.youngBiomass);
    });

    it('NDVI=1.0 caps ndviFactor at 1', () => {
      const result = estimateBiomass(1.0, 'pine', 0, 50);
      // ndviNormalized = 1.0/0.85 > 1, so ndviFactor = min(1, ...) = 1
      // biomass = 20 + (450-20)*growthFactor*1
      const growthFactor = 1 - Math.exp(-0.08 * 50);
      const expected = 20 + (450 - 20) * growthFactor * 1;
      expect(result).toBeCloseTo(expected, 5);
    });
  });

  describe('age progression', () => {
    it('young forest (5yr) has lower biomass than mid (30yr)', () => {
      const young = estimateBiomass(0.6, 'pine', 0, 5);
      const mid = estimateBiomass(0.6, 'pine', 0, 30);
      expect(mid).toBeGreaterThan(young);
    });

    it('mid forest (30yr) has lower biomass than mature (80yr)', () => {
      const mid = estimateBiomass(0.6, 'pine', 0, 30);
      const mature = estimateBiomass(0.6, 'pine', 0, 80);
      expect(mature).toBeGreaterThan(mid);
    });

    it('biomass increases monotonically with age', () => {
      const ages = [5, 10, 20, 30, 50, 80, 120];
      const results = ages.map(age => estimateBiomass(0.7, 'fir', 0, age));
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBeGreaterThan(results[i - 1]);
      }
    });
  });

  describe('logistic growth math verification', () => {
    it('hand-calculated value for pine, NDVI=0.7, age=30', () => {
      const params = forestParams.pine;
      const currentAge = 30;
      const ndvi = 0.7;

      const growthFactor = 1 - Math.exp(-params.growthRate * currentAge);
      const ndviNormalized = ndvi / params.ndviSaturation;
      const ndviFactor = Math.min(1, ndviNormalized);
      const expected = params.youngBiomass +
        (params.maxBiomass - params.youngBiomass) * growthFactor * ndviFactor;

      expect(estimateBiomass(ndvi, 'pine', 0, 30)).toBeCloseTo(expected, 5);
    });

    it('yearsFromStart adds to currentForestAge', () => {
      // estimateBiomass(ndvi, type, yearsFromStart=5, age=25) should equal
      // estimateBiomass(ndvi, type, yearsFromStart=0, age=30)
      const a = estimateBiomass(0.6, 'birch', 5, 25);
      const b = estimateBiomass(0.6, 'birch', 0, 30);
      expect(a).toBeCloseTo(b, 10);
    });
  });

  describe('yearsFromStart=0 baseline', () => {
    it('returns a valid baseline value', () => {
      const result = estimateBiomass(0.6, 'pine', 0, 20);
      expect(result).toBeGreaterThan(0);
      expect(typeof result).toBe('number');
      expect(isFinite(result)).toBe(true);
    });
  });
});

describe('calculateRollingAverage', () => {
  it('window=7 on 20-item dataset', () => {
    const data = Array.from({ length: 20 }, (_, i) => ({ value: i + 1 }));
    const result = calculateRollingAverage(data, 'value', 7);

    expect(result).toHaveLength(20);
    // Each item should have valueRollingAvg
    result.forEach(item => {
      expect(item).toHaveProperty('valueRollingAvg');
      expect(typeof item.valueRollingAvg).toBe('number');
    });

    // Item at index 10: average of items 4-10 = (5+6+7+8+9+10+11)/7 = 56/7 = 8
    expect(result[10].valueRollingAvg).toBeCloseTo(8, 5);
  });

  it('partial windows at start average available data only', () => {
    const data = Array.from({ length: 20 }, (_, i) => ({ value: i + 1 }));
    const result = calculateRollingAverage(data, 'value', 7);

    // Index 0: only 1 item, average = 1
    expect(result[0].valueRollingAvg).toBeCloseTo(1, 5);
    // Index 1: 2 items, average = (1+2)/2 = 1.5
    expect(result[1].valueRollingAvg).toBeCloseTo(1.5, 5);
    // Index 2: 3 items, average = (1+2+3)/3 = 2
    expect(result[2].valueRollingAvg).toBeCloseTo(2, 5);
    // Index 5: 6 items, average = (1+2+3+4+5+6)/6 = 3.5
    expect(result[5].valueRollingAvg).toBeCloseTo(3.5, 5);
  });

  it('window=1 returns original values', () => {
    const data = [{ v: 10 }, { v: 20 }, { v: 30 }];
    const result = calculateRollingAverage(data, 'v', 1);
    expect(result[0].vRollingAvg).toBe(10);
    expect(result[1].vRollingAvg).toBe(20);
    expect(result[2].vRollingAvg).toBe(30);
  });

  it('empty array returns empty array', () => {
    const result = calculateRollingAverage([], 'value', 7);
    expect(result).toEqual([]);
  });

  it('single item', () => {
    const result = calculateRollingAverage([{ x: 42 }], 'x', 7);
    expect(result).toHaveLength(1);
    expect(result[0].xRollingAvg).toBe(42);
  });

  it('preserves original properties', () => {
    const data = [{ value: 5, name: 'a' }, { value: 10, name: 'b' }];
    const result = calculateRollingAverage(data, 'value', 3);
    expect(result[0].name).toBe('a');
    expect(result[1].name).toBe('b');
  });
});
