const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const knex = require('knex');
const knexConfig = require('../db/knexfile');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

const db = knex(knexConfig);
const router = express.Router();

const JWT_EXPIRY = '7d';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

function getSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

function setTokenCookie(res, user) {
  const token = jwt.sign({ id: user.id, email: user.email }, getSecret(), {
    expiresIn: JWT_EXPIRY,
  });

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });

  return token;
}

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const existing = await db('users').where('email', email.toLowerCase().trim()).first();
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const [userId] = await db('users').insert({
      email: email.toLowerCase().trim(),
      password_hash,
      name: name || null,
    });

    await db('subscriptions').insert({
      user_id: userId,
      plan: 'free',
      status: 'active',
    });

    const user = { id: userId, email: email.toLowerCase().trim(), name: name || null };
    setTokenCookie(res, user);

    res.status(201).json({
      user: {
        id: userId,
        email: user.email,
        name: user.name,
        plan: 'free',
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await db('users').where('email', email.toLowerCase().trim()).first();
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const sub = await db('subscriptions')
      .where({ user_id: user.id, status: 'active' })
      .first();

    setTokenCookie(res, user);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: sub ? sub.plan : 'free',
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await db('users')
      .leftJoin('subscriptions', function () {
        this.on('subscriptions.user_id', '=', 'users.id')
          .andOn('subscriptions.status', '=', db.raw('?', ['active']));
      })
      .where('users.id', req.user.id)
      .select(
        'users.id',
        'users.email',
        'users.name',
        'users.stripe_customer_id',
        'subscriptions.plan',
        'subscriptions.status as subscription_status',
        'subscriptions.current_period_end'
      )
      .first();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan || 'free',
        subscriptionStatus: user.subscription_status || 'active',
        currentPeriodEnd: user.current_period_end,
        hasStripeCustomer: !!user.stripe_customer_id,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
