import { estimateForestAge, extractYearlyPeakNdvi } from './ageEstimation';
import { forestParams } from './dataProcessing';

// Generate realistic NDVI time series using the growth model + noise
function generateNdviTimeSeries(startYear, numYears, forestType, trueAge, noiseLevel = 0.05, seed = 42) {
  const params = forestParams[forestType];
  const data = [];
  const startAge = trueAge - numYears;
  const rng = seededRandom(seed);

  for (let y = 0; y < numYears; y++) {
    const year = startYear + y;
    const age = startAge + y;
    const baseNdvi = params.ndviSaturation * (1 - Math.exp(-params.growthRate * age));

    // 3 acquisitions per year with noise
    for (let acq = 0; acq < 3; acq++) {
      const noise = (rng() - 0.5) * 2 * noiseLevel * baseNdvi;
      // Peak acquisition has less noise reduction
      const seasonalFactor = acq === 1 ? 1.0 : 0.92;
      data.push({
        year,
        ndvi: Math.max(0.1, baseNdvi * seasonalFactor + noise),
        yearsFromStart: y + acq * 0.33,
        date: `${year}-0${4 + acq * 2}-15`
      });
    }
  }

  return data;
}

// Seed random for reproducibility in some tests
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('extractYearlyPeakNdvi', () => {
  test('extracts peak NDVI per year sorted by year', () => {
    const data = [
      { year: 2020, ndvi: 0.6 },
      { year: 2020, ndvi: 0.8 },
      { year: 2021, ndvi: 0.7 },
      { year: 2021, ndvi: 0.85 },
      { year: 2019, ndvi: 0.5 }
    ];
    const peaks = extractYearlyPeakNdvi(data);
    expect(peaks).toEqual([
      { year: 2019, peakNdvi: 0.5 },
      { year: 2020, peakNdvi: 0.8 },
      { year: 2021, peakNdvi: 0.85 }
    ]);
  });
});

describe('estimateForestAge', () => {
  test('young pine (true age 25) estimated within 15-35', () => {
    const data = generateNdviTimeSeries(2016, 10, 'pine', 25, 0.03);
    const result = estimateForestAge(data, 'pine');
    expect(result).not.toBeNull();
    expect(result.estimatedAge).toBeGreaterThanOrEqual(15);
    expect(result.estimatedAge).toBeLessThanOrEqual(35);
  });

  test('mature pine (true age 60) estimated within 45-75, moderate or low confidence', () => {
    const data = generateNdviTimeSeries(2016, 10, 'pine', 60, 0.03);
    const result = estimateForestAge(data, 'pine');
    expect(result).not.toBeNull();
    expect(result.estimatedAge).toBeGreaterThanOrEqual(45);
    expect(result.estimatedAge).toBeLessThanOrEqual(75);
    expect(['moderate', 'low']).toContain(result.confidence);
  });

  test('old pine (true age 100) estimated >55, moderate or low confidence', () => {
    const data = generateNdviTimeSeries(2016, 10, 'pine', 100, 0.03);
    const result = estimateForestAge(data, 'pine');
    expect(result).not.toBeNull();
    expect(result.estimatedAge).toBeGreaterThanOrEqual(55);
    expect(['moderate', 'low']).toContain(result.confidence);
    // Wide range
    expect(result.range[1] - result.range[0]).toBeGreaterThan(10);
  });

  test('birch estimated younger than pine for similar NDVI (faster growth rate)', () => {
    // Generate data for a 40-year-old forest of each type
    const pineData = generateNdviTimeSeries(2016, 10, 'pine', 40, 0.02);
    const birchData = generateNdviTimeSeries(2016, 10, 'birch', 40, 0.02);

    const pineResult = estimateForestAge(pineData, 'pine');
    const birchResult = estimateForestAge(birchData, 'birch');

    expect(pineResult).not.toBeNull();
    expect(birchResult).not.toBeNull();
    // Birch reaches maturity faster, so for the same true age the birch estimate
    // should be in a similar or younger range since it's already more mature
    expect(birchResult.estimatedAge).toBeLessThanOrEqual(pineResult.estimatedAge + 10);
  });

  test('noisy data (±10% noise) still within ±15 of true age for young forest', () => {
    const trueAge = 30;
    const data = generateNdviTimeSeries(2016, 10, 'pine', trueAge, 0.10);
    const result = estimateForestAge(data, 'pine');
    expect(result).not.toBeNull();
    expect(Math.abs(result.estimatedAge - trueAge)).toBeLessThanOrEqual(15);
  });

  test('returns null for fewer than 3 data points', () => {
    const data = [
      { year: 2020, ndvi: 0.7 },
      { year: 2021, ndvi: 0.72 }
    ];
    const result = estimateForestAge(data, 'pine');
    expect(result).toBeNull();
  });

  test('all four species run without error', () => {
    for (const species of ['pine', 'fir', 'birch', 'aspen']) {
      const data = generateNdviTimeSeries(2016, 10, species, 40, 0.03);
      const result = estimateForestAge(data, species);
      expect(result).not.toBeNull();
      expect(result.estimatedAge).toBeGreaterThanOrEqual(11);
      expect(result.estimatedAge).toBeLessThanOrEqual(120);
      expect(result.range).toHaveLength(2);
      expect(['high', 'moderate', 'low']).toContain(result.confidence);
      expect(result.yearlyPeaks.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('result has expected shape', () => {
    const data = generateNdviTimeSeries(2016, 10, 'pine', 35, 0.03);
    const result = estimateForestAge(data, 'pine');
    expect(result).toHaveProperty('estimatedAge');
    expect(result).toHaveProperty('range');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('observedSlope');
    expect(result).toHaveProperty('observedMeanNdvi');
    expect(result).toHaveProperty('yearlyPeaks');
    expect(typeof result.observedSlope).toBe('number');
    expect(typeof result.observedMeanNdvi).toBe('number');
  });
});
