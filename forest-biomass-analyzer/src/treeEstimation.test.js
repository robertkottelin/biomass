import { estimateTreeCount } from './treeEstimation';

// Helper to generate NDVI arrays
const generateNdviArray = (count, min, max) =>
  Array.from({ length: count }, () => min + Math.random() * (max - min));

describe('estimateTreeCount', () => {
  describe('all 4 species at various ages', () => {
    const species = ['pine', 'fir', 'birch', 'aspen'];
    const ages = [5, 20, 50, 80];

    species.forEach(sp => {
      ages.forEach(age => {
        it(`${sp} at age ${age} returns valid result`, () => {
          const ndvi = generateNdviArray(100, 0.5, 0.8);
          const result = estimateTreeCount(ndvi, sp, age, 10);
          expect(result).toHaveProperty('count');
          expect(result).toHaveProperty('countMin');
          expect(result).toHaveProperty('countMax');
          expect(result).toHaveProperty('treesPerHa');
          expect(result).toHaveProperty('canopyCover');
          expect(result).toHaveProperty('meanCrownDiameter');
          expect(result.count).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('realistic NDVI arrays', () => {
    it('healthy forest (NDVI 0.5-0.8) gives plausible trees/ha', () => {
      const ndvi = generateNdviArray(200, 0.5, 0.8);
      const result = estimateTreeCount(ndvi, 'pine', 40, 100);
      // Managed forests typically have 400-1200 trees/ha
      expect(result.treesPerHa).toBeGreaterThanOrEqual(100);
      expect(result.treesPerHa).toBeLessThanOrEqual(3000);
    });

    it('sparse forest (NDVI 0.2-0.4) gives fewer trees than healthy', () => {
      const healthy = generateNdviArray(200, 0.5, 0.8);
      const sparse = generateNdviArray(200, 0.2, 0.4);
      const healthyResult = estimateTreeCount(healthy, 'pine', 40, 100);
      const sparseResult = estimateTreeCount(sparse, 'pine', 40, 100);
      expect(healthyResult.treesPerHa).toBeGreaterThan(sparseResult.treesPerHa);
    });
  });

  describe('edge cases', () => {
    it('empty ndviValues returns count=0', () => {
      const result = estimateTreeCount([], 'pine', 30, 10);
      expect(result.count).toBe(0);
      expect(result.treesPerHa).toBe(0);
    });

    it('all-negative ndviValues (water) returns count=0', () => {
      const ndvi = Array(50).fill(-0.3);
      const result = estimateTreeCount(ndvi, 'pine', 30, 10);
      expect(result.count).toBe(0);
    });

    it('area=0 returns treesPerHa=0', () => {
      const ndvi = generateNdviArray(100, 0.5, 0.8);
      const result = estimateTreeCount(ndvi, 'pine', 30, 0);
      expect(result.treesPerHa).toBe(0);
    });
  });

  describe('confidence range', () => {
    it('countMin = count * 0.7 (rounded)', () => {
      const ndvi = generateNdviArray(100, 0.5, 0.8);
      const result = estimateTreeCount(ndvi, 'pine', 30, 10);
      expect(result.countMin).toBe(Math.round(result.count * 0.7));
    });

    it('countMax = count * 1.3 (rounded)', () => {
      const ndvi = generateNdviArray(100, 0.5, 0.8);
      const result = estimateTreeCount(ndvi, 'pine', 30, 10);
      expect(result.countMax).toBe(Math.round(result.count * 1.3));
    });
  });

  describe('unknown species falls back to pine params', () => {
    it('unknown species uses pine packing factor', () => {
      const ndvi = Array(100).fill(0.6);
      const unknownResult = estimateTreeCount(ndvi, 'oak', 30, 10);
      const pineResult = estimateTreeCount(ndvi, 'pine', 30, 10);
      // Packing factor falls back to pine
      expect(unknownResult.packingFactor).toBe(pineResult.packingFactor);
      expect(unknownResult.packingFactor).toBe(0.70);
      // Count should be positive (crown diameter uses fallback 5.0)
      expect(unknownResult.count).toBeGreaterThan(0);
    });
  });

  describe('crown diameter increases with age', () => {
    it('monotonically increases across ages', () => {
      const ndvi = Array(100).fill(0.6);
      const ages = [5, 10, 20, 40, 60, 80];
      const diameters = ages.map(age => {
        const result = estimateTreeCount(ndvi, 'pine', age, 10);
        return parseFloat(result.meanCrownDiameter);
      });
      for (let i = 1; i < diameters.length; i++) {
        expect(diameters[i]).toBeGreaterThan(diameters[i - 1]);
      }
    });
  });

  describe('canopy cover', () => {
    it('all pixels > 0.4 gives 100% cover', () => {
      const ndvi = Array(100).fill(0.7);
      const result = estimateTreeCount(ndvi, 'pine', 30, 10);
      expect(parseFloat(result.canopyCover)).toBeCloseTo(100, 0);
    });

    it('all pixels < 0.2 gives 0% cover', () => {
      const ndvi = Array(100).fill(0.1);
      const result = estimateTreeCount(ndvi, 'pine', 30, 10);
      expect(parseFloat(result.canopyCover)).toBeCloseTo(0, 0);
    });

    it('all negative pixels (water) gives 0% cover', () => {
      const ndvi = Array(100).fill(-0.2);
      const result = estimateTreeCount(ndvi, 'pine', 30, 10);
      expect(parseFloat(result.canopyCover)).toBeCloseTo(0, 0);
    });
  });
});
