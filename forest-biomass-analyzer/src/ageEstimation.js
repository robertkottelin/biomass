import { forestParams } from './dataProcessing';

function linearRegression(points) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (const { x, y } of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R² calculation
  const meanY = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (const { x, y } of points) {
    ssTot += (y - meanY) ** 2;
    ssRes += (y - (slope * x + intercept)) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

export function extractYearlyPeakNdvi(biomassData) {
  const byYear = {};
  for (const d of biomassData) {
    const year = d.year;
    if (year == null) continue;
    if (!byYear[year] || d.ndvi > byYear[year]) {
      byYear[year] = d.ndvi;
    }
  }

  return Object.entries(byYear)
    .map(([year, peakNdvi]) => ({ year: parseInt(year), peakNdvi }))
    .sort((a, b) => a.year - b.year);
}

export function estimateForestAge(biomassData, forestType) {
  const yearlyPeaks = extractYearlyPeakNdvi(biomassData);

  if (yearlyPeaks.length < 3) return null;

  const params = forestParams[forestType];
  if (!params) return null;

  const { growthRate, ndviSaturation } = params;

  // Observed trend from yearly peaks
  const points = yearlyPeaks.map((p, i) => ({ x: i, y: p.peakNdvi }));
  const { slope: rawSlope, r2: observedR2 } = linearRegression(points);
  const observedMeanNdvi = points.reduce((s, p) => s + p.y, 0) / points.length;
  const observedSlope = Math.max(0, rawSlope); // Clamp: growth model is monotonically increasing

  // Scale observed NDVI to model range so peaks above saturation don't chase upper bound
  const maxObserved = Math.max(...yearlyPeaks.map(p => p.peakNdvi));
  const scale = maxObserved > 0 ? ndviSaturation / maxObserved : 1;
  const scaledSlope = observedSlope * scale;
  const scaledMean = observedMeanNdvi * scale;

  // Compute stddev of NDVI
  const variance = points.reduce((s, p) => s + (p.y - observedMeanNdvi) ** 2, 0) / points.length;
  const stddev = Math.sqrt(variance);

  const numYears = yearlyPeaks.length;
  const maxSlope = ndviSaturation * growthRate; // Max possible model slope for normalization

  // Grid search candidate ages (capped at 120 to avoid unrealistic estimates)
  let bestAge = 30;
  let bestError = Infinity;

  for (let candidateAge = 11; candidateAge <= 120; candidateAge++) {
    const startAge = candidateAge - 10;
    const expectedPoints = [];
    for (let i = 0; i < numYears; i++) {
      const age = startAge + i;
      const expectedNdvi = ndviSaturation * (1 - Math.exp(-growthRate * age));
      expectedPoints.push({ x: i, y: expectedNdvi });
    }

    const { slope: expectedSlope } = linearRegression(expectedPoints);
    const expectedMean = expectedPoints.reduce((s, p) => s + p.y, 0) / expectedPoints.length;

    // Normalize error terms to 0-1 range so weights are meaningful
    const slopeErr = ((scaledSlope - expectedSlope) / maxSlope) ** 2;
    const meanErr = ((scaledMean - expectedMean) / ndviSaturation) ** 2;
    const error = 0.7 * slopeErr + 0.3 * meanErr;

    if (error < bestError) {
      bestError = error;
      bestAge = candidateAge;
    }
  }

  // Confidence margin
  const noiseMargin = stddev > 0.05 ? stddev * 100 : 0;
  const fitMargin = observedR2 < 0.5 ? 10 : observedR2 < 0.8 ? 5 : 0;
  const maturityMargin = bestAge > 60 ? (bestAge - 60) * 0.3 : 0;
  const margin = Math.round(5 + noiseMargin + fitMargin + maturityMargin);

  const low = Math.max(11, bestAge - margin);
  const high = bestAge + margin;

  let confidence;
  if (margin <= 10) confidence = 'high';
  else if (margin <= 20) confidence = 'moderate';
  else confidence = 'low';

  return {
    estimatedAge: bestAge,
    range: [low, high],
    confidence,
    observedSlope,
    observedMeanNdvi,
    yearlyPeaks
  };
}
