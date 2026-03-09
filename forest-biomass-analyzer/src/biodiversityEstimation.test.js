import { estimateBiodiversity, BIODIVERSITY_PARAMS } from './biodiversityEstimation';

const makeBiomassData = (overrides = {}) => [{
  biomass: 150,
  ndvi: 0.75,
  ndviMin: 0.5,
  ndviMax: 0.9,
  ndmi: 0.3,
  ndre: 0.4,
  date: '2024-07-15',
  ...overrides
}];

const makeTreeEstimate = (overrides = {}) => ({
  canopyCover: '72',
  meanCrownDiameter: '5.0',
  count: 800,
  treesPerHa: 400,
  ...overrides
});

const makeHealthEstimate = (overrides = {}) => ({
  healthScore: 85,
  ...overrides
});

describe('estimateBiodiversity', () => {
  test('null/empty biomass returns null', () => {
    expect(estimateBiodiversity(null, null, null, 'pine', 40, 10)).toBeNull();
    expect(estimateBiodiversity([], null, null, 'pine', 40, 10)).toBeNull();
  });

  test('score range 0-100 for all species', () => {
    ['pine', 'fir', 'birch', 'aspen'].forEach(type => {
      const result = estimateBiodiversity(makeBiomassData(), makeTreeEstimate(), makeHealthEstimate(), type, 40, 10);
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(result.structuralDiversity).toBeGreaterThanOrEqual(0);
      expect(result.structuralDiversity).toBeLessThanOrEqual(100);
      expect(result.ageFactor).toBeGreaterThanOrEqual(0);
      expect(result.ageFactor).toBeLessThanOrEqual(100);
    });
  });

  test('monoculture species score is 30', () => {
    const result = estimateBiodiversity(makeBiomassData(), makeTreeEstimate(), makeHealthEstimate(), 'pine', 40, 10);
    expect(result.speciesComposition).toBe(30);
  });

  test('old forest has higher age score than young forest', () => {
    const young = estimateBiodiversity(makeBiomassData(), makeTreeEstimate(), makeHealthEstimate(), 'pine', 15, 10);
    const old = estimateBiodiversity(makeBiomassData(), makeTreeEstimate(), makeHealthEstimate(), 'pine', 70, 10);
    expect(old.ageFactor).toBeGreaterThan(young.ageFactor);
  });

  test('deadwood potential for old forests', () => {
    // Pine deadwoodAge = 100
    const oldForest = estimateBiodiversity(
      makeBiomassData({ ndviMin: 0.2, ndviMax: 0.9 }),
      makeTreeEstimate(),
      makeHealthEstimate(),
      'pine', 105, 10
    );
    expect(oldForest.deadwood).toBe('Likely');

    const youngForest = estimateBiodiversity(makeBiomassData(), makeTreeEstimate(), makeHealthEstimate(), 'pine', 20, 10);
    expect(youngForest.deadwood).toBe('Unlikely');
  });

  test('works with null treeEstimate', () => {
    const result = estimateBiodiversity(makeBiomassData(), null, makeHealthEstimate(), 'pine', 40, 10);
    expect(result).not.toBeNull();
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
  });

  test('works with null healthEstimate', () => {
    const result = estimateBiodiversity(makeBiomassData(), makeTreeEstimate(), null, 'pine', 40, 10);
    expect(result).not.toBeNull();
    expect(result.healthFactor).toBe(70); // default
  });

  test('recommendations include species mix suggestion', () => {
    const result = estimateBiodiversity(makeBiomassData(), makeTreeEstimate(), makeHealthEstimate(), 'pine', 40, 10);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.some(r => r.toLowerCase().includes('birch') || r.toLowerCase().includes('understory') || r.toLowerCase().includes('mix'))).toBe(true);
  });

  test('higher NDVI variance gives higher structural score', () => {
    const lowVar = estimateBiodiversity(
      makeBiomassData({ ndviMin: 0.7, ndviMax: 0.75 }),
      makeTreeEstimate(),
      makeHealthEstimate(),
      'pine', 40, 10
    );
    const highVar = estimateBiodiversity(
      makeBiomassData({ ndviMin: 0.3, ndviMax: 0.9 }),
      makeTreeEstimate(),
      makeHealthEstimate(),
      'pine', 40, 10
    );
    expect(highVar.structuralDiversity).toBeGreaterThan(lowVar.structuralDiversity);
  });

  test('returns overall label', () => {
    const result = estimateBiodiversity(makeBiomassData(), makeTreeEstimate(), makeHealthEstimate(), 'pine', 40, 10);
    expect(['Good', 'Moderate', 'Low']).toContain(result.overallLabel);
  });

  test('defaults to pine for unknown forest type', () => {
    const result = estimateBiodiversity(makeBiomassData(), makeTreeEstimate(), makeHealthEstimate(), 'oak', 40, 10);
    expect(result).not.toBeNull();
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
  });
});
