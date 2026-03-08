/**
 * Integration tests for API connectivity with CDSE OAuth2.
 * These tests require real credentials and network access.
 * Skip in CI with: SKIP_INTEGRATION=true
 */

import { analyzeForestHealth } from './healthEstimation';

const SKIP = process.env.SKIP_INTEGRATION === 'true' ||
             (!process.env.CDSE_CLIENT_ID && !process.env.REACT_APP_CDSE_CLIENT_ID);

const CLIENT_ID = process.env.CDSE_CLIENT_ID || process.env.REACT_APP_CDSE_CLIENT_ID;
const CLIENT_SECRET = process.env.CDSE_CLIENT_SECRET || process.env.REACT_APP_CDSE_CLIENT_SECRET;

// Finnish boreal forest test polygon near Jyväskylä
const TEST_POLYGON = [
  [62.25, 25.75],
  [62.25, 25.76],
  [62.26, 25.76],
  [62.26, 25.75],
];

// Convert [lat,lng] to [lng,lat] for WKT/API
const bboxFromPolygon = (coords) => {
  const lats = coords.map(c => c[0]);
  const lngs = coords.map(c => c[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
};

async function authenticateCDSE() {
  const response = await fetch(
    'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Auth failed: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  return data.access_token;
}

const conditionalDescribe = SKIP ? describe.skip : describe;

conditionalDescribe('CDSE API Integration Tests', () => {
  let accessToken;

  beforeAll(async () => {
    accessToken = await authenticateCDSE();
  }, 30000);

  it('authenticates successfully and receives a token', () => {
    expect(accessToken).toBeDefined();
    expect(typeof accessToken).toBe('string');
    expect(accessToken.length).toBeGreaterThan(0);
  });

  it('fetches available dates for test polygon', async () => {
    const bbox = bboxFromPolygon(TEST_POLYGON);
    const catalogUrl = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=Collection/Name eq 'SENTINEL-2' and OData.CSC.Intersects(area=geography'SRID=4326;POLYGON((${bbox[0]} ${bbox[1]},${bbox[2]} ${bbox[1]},${bbox[2]} ${bbox[3]},${bbox[0]} ${bbox[3]},${bbox[0]} ${bbox[1]}))')&$top=5&$orderby=ContentDate/Start desc`;

    const response = await fetch(catalogUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data).toHaveProperty('value');
    expect(Array.isArray(data.value)).toBe(true);
  }, 30000);

  it('verify returned data structure has expected fields', async () => {
    const bbox = bboxFromPolygon(TEST_POLYGON);
    const catalogUrl = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=Collection/Name eq 'SENTINEL-2' and OData.CSC.Intersects(area=geography'SRID=4326;POLYGON((${bbox[0]} ${bbox[1]},${bbox[2]} ${bbox[1]},${bbox[2]} ${bbox[3]},${bbox[0]} ${bbox[3]},${bbox[0]} ${bbox[1]}))')&$top=1&$orderby=ContentDate/Start desc`;

    const response = await fetch(catalogUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json();

    if (data.value && data.value.length > 0) {
      const product = data.value[0];
      expect(product).toHaveProperty('Id');
      expect(product).toHaveProperty('Name');
      expect(product).toHaveProperty('ContentDate');
    }
  }, 30000);
});

// Non-integration test: verify health analysis pipeline with synthetic data
describe('End-to-end pipeline with synthetic data', () => {
  it('synthetic spectral data → health analysis → valid output', () => {
    const timeSeriesData = [];
    for (let year = 2018; year <= 2024; year++) {
      for (let month = 5; month <= 9; month++) {
        timeSeriesData.push({
          date: `${year}-${String(month).padStart(2, '0')}-15`,
          year,
          ndvi: 0.65 + Math.random() * 0.15,
          ndmi: 0.35 + Math.random() * 0.10,
          ndre: 0.40 + Math.random() * 0.12,
        });
      }
    }

    const result = analyzeForestHealth(timeSeriesData, 'pine', 40);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('healthScore');
    expect(result).toHaveProperty('healthLabel');
    expect(result).toHaveProperty('currentStatus');
    expect(result).toHaveProperty('anomalies');
    expect(result).toHaveProperty('disturbanceEvents');
    expect(result).toHaveProperty('baselines');
    expect(result).toHaveProperty('yearlyPeaks');
    expect(result.healthScore).toBeGreaterThanOrEqual(0);
    expect(result.healthScore).toBeLessThanOrEqual(100);
    expect(['Good', 'Fair', 'Poor', 'Critical']).toContain(result.healthLabel);
  });
});
