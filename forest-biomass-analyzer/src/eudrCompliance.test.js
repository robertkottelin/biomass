import {
  assessDeforestationRisk,
  generateComplianceReport,
  formatGeoReference
} from './eudrCompliance';

function makeTimeSeries(startYear, endYear, baseNdvi = 0.75) {
  const data = [];
  for (let year = startYear; year <= endYear; year++) {
    for (const month of [5, 6, 7, 8]) {
      data.push({
        date: `${year}-${String(month).padStart(2, '0')}-15`,
        year,
        month,
        ndvi: baseNdvi + (Math.random() * 0.04 - 0.02),
        ndmi: 0.4,
        ndre: 0.45,
        biomass: 150 + (year - startYear) * 2
      });
    }
  }
  return data;
}

function makeDecliningSeries(startYear, endYear) {
  const data = [];
  for (let year = startYear; year <= endYear; year++) {
    const yearFactor = year <= 2020 ? 0.75 : 0.75 * (1 - (year - 2020) * 0.08);
    for (const month of [5, 7]) {
      data.push({
        date: `${year}-${String(month).padStart(2, '0')}-15`,
        year,
        month,
        ndvi: Math.max(0.2, yearFactor),
        ndmi: 0.35,
        ndre: 0.40,
        biomass: 100
      });
    }
  }
  return data;
}

describe('assessDeforestationRisk', () => {
  test('returns null for null/empty input', () => {
    expect(assessDeforestationRisk(null)).toBeNull();
    expect(assessDeforestationRisk([])).toBeNull();
  });

  test('returns Negligible for stable forest', () => {
    const data = makeTimeSeries(2018, 2024, 0.78);
    const result = assessDeforestationRisk(data);
    expect(result.riskLevel).toBe('Negligible');
    expect(result.continuityRatio).toBeGreaterThanOrEqual(90);
    expect(result.riskColor).toBe('#27ae60');
  });

  test('returns Unknown when no pre-2020 data', () => {
    const data = makeTimeSeries(2021, 2024);
    const result = assessDeforestationRisk(data);
    expect(result.riskLevel).toBe('Unknown');
    expect(result.continuityRatio).toBeNull();
  });

  test('returns elevated risk for significant decline', () => {
    const data = makeDecliningSeries(2018, 2024);
    const result = assessDeforestationRisk(data);
    expect(result.riskLevel).not.toBe('Negligible');
    expect(result.continuityRatio).toBeLessThan(90);
  });

  test('includes pre/post data point counts', () => {
    const data = makeTimeSeries(2018, 2024);
    const result = assessDeforestationRisk(data);
    expect(result.dataPoints.pre).toBeGreaterThan(0);
    expect(result.dataPoints.post).toBeGreaterThan(0);
  });

  test('baseline values are computed', () => {
    const data = makeTimeSeries(2018, 2024);
    const result = assessDeforestationRisk(data);
    expect(result.pre2020Baseline).toBeGreaterThan(0);
    expect(result.post2020Baseline).toBeGreaterThan(0);
  });

  test('returns Unknown when only pre-2020 data (no post-2020 evidence)', () => {
    const data = makeTimeSeries(2015, 2020);
    const result = assessDeforestationRisk(data);
    expect(result.riskLevel).toBe('Unknown');
    expect(result.continuityRatio).toBeNull();
    expect(result.pre2020Baseline).toBeGreaterThan(0);
    expect(result.post2020Baseline).toBeNull();
    expect(result.dataPoints.pre).toBeGreaterThan(0);
    expect(result.dataPoints.post).toBe(0);
  });
});

describe('generateComplianceReport', () => {
  test('returns null for null biomass data', () => {
    expect(generateComplianceReport(null, null, 'pine', 10)).toBeNull();
  });

  test('generates complete report for stable forest', () => {
    const data = makeTimeSeries(2018, 2024);
    const coords = [
      { lat: 61.5, lng: 24.0 },
      { lat: 61.5, lng: 24.1 },
      { lat: 61.6, lng: 24.1 },
      { lat: 61.6, lng: 24.0 }
    ];
    const report = generateComplianceReport(data, coords, 'pine', 50);

    expect(report.reportDate).toBeDefined();
    expect(report.eudrReferenceDate).toBe('2020-12-31');
    expect(report.riskAssessment).toBeDefined();
    expect(report.evidenceTimeline).toBeDefined();
    expect(report.evidenceTimeline.length).toBeGreaterThan(0);
    expect(report.geoReference).toBeDefined();
    expect(report.complianceStatus).toBeDefined();
    expect(report.recommendations).toBeDefined();
  });

  test('compliance status matches risk level', () => {
    const stableData = makeTimeSeries(2018, 2024);
    const stableReport = generateComplianceReport(stableData, null, 'pine', 50);
    expect(stableReport.complianceStatus).toBe('Compliant');
  });

  test('evidence timeline separates pre/post reference', () => {
    const data = makeTimeSeries(2018, 2024);
    const report = generateComplianceReport(data, null, 'pine', 50);
    const preRef = report.evidenceTimeline.filter(e => e.period === 'pre-reference');
    const postRef = report.evidenceTimeline.filter(e => e.period === 'post-reference');
    expect(preRef.length).toBeGreaterThan(0);
    expect(postRef.length).toBeGreaterThan(0);
  });

  test('works without coordinates', () => {
    const data = makeTimeSeries(2018, 2024);
    const report = generateComplianceReport(data, null, 'pine', 50);
    expect(report.geoReference).toBeNull();
    expect(report.riskAssessment).toBeDefined();
  });
});

describe('formatGeoReference', () => {
  test('returns null for invalid input', () => {
    expect(formatGeoReference(null)).toBeNull();
    expect(formatGeoReference([])).toBeNull();
  });

  test('formats polygon coordinates', () => {
    const coords = [
      { lat: 61.5, lng: 24.0 },
      { lat: 61.5, lng: 24.1 },
      { lat: 61.6, lng: 24.0 }
    ];
    const result = formatGeoReference(coords);
    expect(result.type).toBe('Polygon');
    expect(result.coordinates).toHaveLength(3);
    expect(result.centroid).toBeDefined();
    expect(result.coordinateSystem).toBe('WGS84 (EPSG:4326)');
  });

  test('calculates centroid correctly', () => {
    const coords = [
      { lat: 60.0, lng: 24.0 },
      { lat: 62.0, lng: 26.0 }
    ];
    const result = formatGeoReference(coords);
    expect(parseFloat(result.centroid.lat)).toBeCloseTo(61.0, 0);
    expect(parseFloat(result.centroid.lng)).toBeCloseTo(25.0, 0);
  });
});
