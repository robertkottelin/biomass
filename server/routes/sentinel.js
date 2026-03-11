const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requirePlan } = require('../middleware/tierCheck');
const { sentinelLimiter } = require('../middleware/rateLimit');
const logger = require('../lib/logger');

const router = express.Router();

// Token cache
let cachedToken = null;
let tokenExpiresAt = 0;

const TOKEN_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const PROCESS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/process';
const CATALOG_URL = 'https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search';

async function getAccessToken() {
  const now = Date.now();

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && tokenExpiresAt - 60000 > now) {
    return cachedToken;
  }

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
  tokenExpiresAt = now + data.expires_in * 1000;
  logger.info('Sentinel token obtained', { expiresIn: data.expires_in });

  return cachedToken;
}

// All sentinel routes require auth and pro/business plan
router.use(requireAuth, requirePlan('pro', 'business'));

// POST /api/sentinel/process — rate-limited (counts against daily quota)
router.post('/process', sentinelLimiter, async (req, res, next) => {
  try {
    const token = await getAccessToken();
    const userId = req.user ? req.user.id : '-';
    logger.debug('Sentinel process request', { userId });

    const response = await fetch(PROCESS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: req.headers.accept || 'application/octet-stream',
      },
      body: JSON.stringify(req.body),
    });

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

    const response = await fetch(CATALOG_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

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

module.exports = router;
