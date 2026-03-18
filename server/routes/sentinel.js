const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requirePlan } = require('../middleware/tierCheck');
const { sentinelLimiter } = require('../middleware/rateLimit');
const logger = require('../lib/logger');

const router = express.Router();

// Token cache
let cachedToken = null;
let tokenExpiresAt = 0;
let refreshPromise = null;

const TOKEN_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const PROCESS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/process';
const CATALOG_URL = 'https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search';
const STATISTICS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/statistics';

async function getAccessToken() {
  const now = Date.now();

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && tokenExpiresAt - 60000 > now) {
    return cachedToken;
  }

  // If a refresh is already in flight, wait for it
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const clientId = process.env.SENTINEL_CLIENT_ID;
      const clientSecret = process.env.SENTINEL_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error('Sentinel Hub credentials not configured');
      }

      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);

      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error('Failed to obtain Sentinel token', { status: response.status, body: text });
        throw new Error(`Failed to obtain Sentinel token: ${response.status} ${text}`);
      }

      const data = await response.json();
      cachedToken = data.access_token;
      tokenExpiresAt = Date.now() + data.expires_in * 1000;
      logger.info('Sentinel token obtained', { expiresIn: data.expires_in });

      return cachedToken;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// All sentinel routes require auth and pro/business plan
router.use(requireAuth, requirePlan('pro', 'business'));

// POST /api/sentinel/process — rate-limited (counts against daily quota)
router.post('/process', sentinelLimiter, async (req, res, next) => {
  try {
    const token = await getAccessToken();
    const userId = req.user ? req.user.id : '-';
    logger.debug('Sentinel process request', { userId });

    const bodyStr = JSON.stringify(req.body);
    const maxRetries = 3;
    let response;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      response = await fetch(PROCESS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: req.headers.accept || 'application/octet-stream',
        },
        body: bodyStr,
      });

      if (response.status !== 429 || attempt === maxRetries) break;

      // Respect Retry-After header, fallback to exponential backoff
      const retryAfter = response.headers.get('retry-after');
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.min(1000 * Math.pow(2, attempt), 8000);
      logger.info('Sentinel 429, retrying', { attempt: attempt + 1, waitMs, userId });
      await new Promise(r => setTimeout(r, waitMs));
    }

    if (!response.ok) {
      const text = await response.text();
      logger.warn('Sentinel process request failed', { status: response.status, userId, details: text.substring(0, 500) });
      return res.status(response.status).json({
        error: 'Sentinel Hub process request failed',
        details: text,
      });
    }

    // Forward content-type header
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    // Stream binary response
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// POST /api/sentinel/catalog
router.post('/catalog', async (req, res, next) => {
  try {
    const token = await getAccessToken();
    const bodyStr = JSON.stringify(req.body);
    const maxRetries = 3;
    let response;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      response = await fetch(CATALOG_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: bodyStr,
      });

      if (response.status !== 429 || attempt === maxRetries) break;

      const retryAfter = response.headers.get('retry-after');
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.min(1000 * Math.pow(2, attempt), 8000);
      logger.info('Sentinel catalog 429, retrying', { attempt: attempt + 1, waitMs });
      await new Promise(r => setTimeout(r, waitMs));
    }

    if (!response.ok) {
      const text = await response.text();
      logger.warn('Sentinel catalog request failed', { status: response.status, details: text.substring(0, 500) });
      return res.status(response.status).json({
        error: 'Sentinel Hub catalog request failed',
        details: text,
      });
    }

    const data = await response.json();
    logger.debug('Sentinel catalog response', { features: data.features ? data.features.length : 0 });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/sentinel/statistics — Statistical API (rate-limited, 1 request)
router.post('/statistics', sentinelLimiter, async (req, res, next) => {
  try {
    const token = await getAccessToken();
    const userId = req.user ? req.user.id : '-';
    const { geometry, dateFrom, dateTo } = req.body;

    if (!geometry || !dateFrom || !dateTo) {
      return res.status(400).json({ error: 'geometry, dateFrom, and dateTo are required' });
    }

    logger.debug('Sentinel statistics request', { userId, dateFrom, dateTo });

    const evalscript = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "B11", "B05", "SCL"], units: "DN" }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "ndmi", bands: 1, sampleType: "FLOAT32" },
      { id: "ndre", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}

function evaluatePixel(sample) {
  let scl = sample.SCL;
  if (scl === 3 || scl === 8 || scl === 9 || scl === 10 || scl === 11) {
    return { ndvi: [NaN], ndmi: [NaN], ndre: [NaN], dataMask: [0] };
  }
  let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04 + 0.0001);
  let ndmi = (sample.B08 - sample.B11) / (sample.B08 + sample.B11 + 0.0001);
  let ndre = (sample.B08 - sample.B05) / (sample.B08 + sample.B05 + 0.0001);
  return { ndvi: [ndvi], ndmi: [ndmi], ndre: [ndre], dataMask: [1] };
}`;

    // Compute bbox from geometry for resolution calculation
    const allCoords = geometry.coordinates[0];
    const lngs = allCoords.map(c => c[0]);
    const lats = allCoords.map(c => c[1]);
    const bbox = [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];

    const requestBody = {
      input: {
        bounds: {
          geometry,
          properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
        },
        data: [{
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: { from: `${dateFrom}T00:00:00Z`, to: `${dateTo}T23:59:59Z` },
            mosaickingOrder: 'leastCC',
            maxCloudCoverage: 30,
          },
        }],
      },
      aggregation: {
        timeRange: { from: `${dateFrom}T00:00:00Z`, to: `${dateTo}T23:59:59Z` },
        aggregationInterval: { of: 'P1D' },
        resx: 0.0002,
        resy: 0.0002,
        evalscript,
      },
      calculations: {
        ndvi: {
          statistics: { default: { percentiles: { k: [5, 25, 50, 75, 95] } } },
          histograms: { default: { nBins: 10 } },
        },
        ndmi: {
          statistics: { default: { percentiles: { k: [5, 25, 50, 75, 95] } } },
          histograms: { default: { nBins: 10 } },
        },
        ndre: {
          statistics: { default: { percentiles: { k: [5, 25, 50, 75, 95] } } },
          histograms: { default: { nBins: 10 } },
        },
      },
    };

    const bodyStr = JSON.stringify(requestBody);
    const maxRetries = 3;
    let response;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      response = await fetch(STATISTICS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: bodyStr,
      });

      if (response.status !== 429 || attempt === maxRetries) break;

      const retryAfter = response.headers.get('retry-after');
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.min(1000 * Math.pow(2, attempt), 8000);
      logger.info('Sentinel statistics 429, retrying', { attempt: attempt + 1, waitMs, userId });
      await new Promise(r => setTimeout(r, waitMs));
    }

    if (!response.ok) {
      const text = await response.text();
      logger.warn('Sentinel statistics request failed', { status: response.status, userId, details: text.substring(0, 500) });
      return res.status(response.status).json({
        error: 'Sentinel Hub statistics request failed',
        details: text,
      });
    }

    const data = await response.json();
    logger.debug('Sentinel statistics response', { entries: data.data ? data.data.length : 0, userId });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/sentinel/imagery — Process API with PNG output (rate-limited)
router.post('/imagery', sentinelLimiter, async (req, res, next) => {
  try {
    const token = await getAccessToken();
    const userId = req.user ? req.user.id : '-';
    const { geometry, bbox, date, vizType } = req.body;

    if (!bbox || !date || !vizType) {
      return res.status(400).json({ error: 'bbox, date, and vizType are required' });
    }

    logger.debug('Sentinel imagery request', { userId, date, vizType });

    const evalscripts = {
      trueColor: `
//VERSION=3
function setup() {
  return { input: ["B04", "B03", "B02", "SCL"], output: { bands: 4 } };
}
function evaluatePixel(s) {
  if (s.SCL === 3 || s.SCL === 8 || s.SCL === 9 || s.SCL === 10 || s.SCL === 11) return [0,0,0,0];
  return [s.B04*3.5, s.B03*3.5, s.B02*3.5, 1];
}`,
      ndviColored: `
//VERSION=3
function setup() {
  return { input: ["B04", "B08", "SCL"], output: { bands: 4 } };
}
function evaluatePixel(s) {
  if (s.SCL === 3 || s.SCL === 8 || s.SCL === 9 || s.SCL === 10 || s.SCL === 11) return [0,0,0,0];
  let ndvi = (s.B08 - s.B04) / (s.B08 + s.B04 + 0.0001);
  if (ndvi < 0.0) return [0.5, 0.0, 0.0, 1];
  if (ndvi < 0.2) return [0.8, 0.2, 0.1, 1];
  if (ndvi < 0.4) return [0.9, 0.6, 0.2, 1];
  if (ndvi < 0.6) return [0.7, 0.9, 0.3, 1];
  if (ndvi < 0.8) return [0.2, 0.7, 0.2, 1];
  return [0.0, 0.5, 0.0, 1];
}`,
      falseColor: `
//VERSION=3
function setup() {
  return { input: ["B08", "B04", "B03", "SCL"], output: { bands: 4 } };
}
function evaluatePixel(s) {
  if (s.SCL === 3 || s.SCL === 8 || s.SCL === 9 || s.SCL === 10 || s.SCL === 11) return [0,0,0,0];
  return [s.B08*2.5, s.B04*3.5, s.B03*3.5, 1];
}`,
      ndmiMoisture: `
//VERSION=3
function setup() {
  return { input: ["B08", "B11", "SCL"], output: { bands: 4 } };
}
function evaluatePixel(s) {
  if (s.SCL === 3 || s.SCL === 8 || s.SCL === 9 || s.SCL === 10 || s.SCL === 11) return [0,0,0,0];
  let ndmi = (s.B08 - s.B11) / (s.B08 + s.B11 + 0.0001);
  if (ndmi < 0.0) return [0.8, 0.4, 0.1, 1];
  if (ndmi < 0.1) return [0.9, 0.7, 0.3, 1];
  if (ndmi < 0.2) return [0.7, 0.9, 0.7, 1];
  if (ndmi < 0.3) return [0.3, 0.7, 0.9, 1];
  if (ndmi < 0.4) return [0.1, 0.5, 0.8, 1];
  return [0.0, 0.3, 0.6, 1];
}`,
    };

    const evalscript = evalscripts[vizType];
    if (!evalscript) {
      return res.status(400).json({ error: `Invalid vizType: ${vizType}. Must be one of: trueColor, ndviColored, falseColor, ndmiMoisture` });
    }

    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    // Calculate pixel dimensions from bbox at ~10m native Sentinel-2 resolution
    const [west, south, east, north] = bbox;
    const midLat = (south + north) / 2;
    const cosLat = Math.cos(midLat * Math.PI / 180);
    const widthMeters = Math.abs(east - west) * 111320 * cosLat;
    const heightMeters = Math.abs(north - south) * 110540;
    // 10m per pixel, capped at 2500px (Sentinel Hub limit)
    const pixelWidth = Math.min(2500, Math.max(256, Math.round(widthMeters / 10)));
    const pixelHeight = Math.min(2500, Math.max(256, Math.round(heightMeters / 10)));

    logger.info('Imagery resolution', { widthMeters: Math.round(widthMeters), heightMeters: Math.round(heightMeters), pixelWidth, pixelHeight });

    const requestBody = {
      input: {
        bounds: {
          bbox,
          properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
        },
        data: [{
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: { from: `${date}T00:00:00Z`, to: nextDay.toISOString().split('T')[0] + 'T23:59:59Z' },
            mosaickingOrder: 'leastCC',
          },
        }],
      },
      output: {
        width: pixelWidth,
        height: pixelHeight,
        responses: [{ identifier: 'default', format: { type: 'image/png' } }],
      },
      evalscript,
    };

    const bodyStr = JSON.stringify(requestBody);
    const maxRetries = 3;
    let response;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      response = await fetch(PROCESS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'image/png',
        },
        body: bodyStr,
      });

      if (response.status !== 429 || attempt === maxRetries) break;

      const retryAfter = response.headers.get('retry-after');
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.min(1000 * Math.pow(2, attempt), 8000);
      logger.info('Sentinel imagery 429, retrying', { attempt: attempt + 1, waitMs, userId });
      await new Promise(r => setTimeout(r, waitMs));
    }

    if (!response.ok) {
      const text = await response.text();
      logger.warn('Sentinel imagery request failed', { status: response.status, userId, details: text.substring(0, 500) });
      return res.status(response.status).json({
        error: 'Sentinel Hub imagery request failed',
        details: text,
      });
    }

    res.setHeader('Content-Type', 'image/png');
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
