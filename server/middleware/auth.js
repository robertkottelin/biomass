const jwt = require('jsonwebtoken');
const knex = require('knex');
const knexConfig = require('../db/knexfile');
const logger = require('../lib/logger');

const db = knex(knexConfig);

function getSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

async function resolveUser(token) {
  const payload = jwt.verify(token, getSecret());

  const row = await db('users')
    .leftJoin('subscriptions', function () {
      this.on('subscriptions.user_id', '=', 'users.id')
        .andOn('subscriptions.status', '=', db.raw('?', ['active']));
    })
    .where('users.id', payload.id)
    .select('users.id', 'users.email', 'users.name', 'subscriptions.plan')
    .first();

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    plan: row.plan || 'free',
  };
}

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies && req.cookies.token;
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await resolveUser(token);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      logger.debug('Auth token rejected', { reason: err.name, path: req.originalUrl });
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    next(err);
  }
}

async function optionalAuth(req, res, next) {
  try {
    const token = req.cookies && req.cookies.token;
    if (token) {
      const user = await resolveUser(token);
      if (user) req.user = user;
    }
    next();
  } catch (_) {
    // Token invalid — continue without auth
    next();
  }
}

module.exports = { requireAuth, optionalAuth };
