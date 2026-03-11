const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Plan-based Sentinel API rate limiter
const SENTINEL_LIMITS = {
  free: 0,
  pro: 100,
  business: 500,
};

// Store for per-user daily counts
const dailyCounts = new Map();

function resetDailyCounts() {
  dailyCounts.clear();
}

// Reset daily counts at midnight
setInterval(resetDailyCounts, 24 * 60 * 60 * 1000);

function sentinelLimiter(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const plan = req.user.plan || 'free';
  const limit = SENTINEL_LIMITS[plan];

  if (limit === 0) {
    return res.status(403).json({
      error: 'Sentinel API access not available',
      message: 'Free plan does not include Sentinel API access. Please upgrade to Pro or Business.',
      currentPlan: plan,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const key = `${req.user.id}:${today}`;
  const current = dailyCounts.get(key) || 0;

  if (current >= limit) {
    return res.status(429).json({
      error: 'Daily Sentinel API limit reached',
      message: `You have used all ${limit} Sentinel API requests for today. ${plan === 'pro' ? 'Upgrade to Business for 500/day.' : 'Limit resets at midnight.'}`,
      limit,
      used: current,
      currentPlan: plan,
    });
  }

  dailyCounts.set(key, current + 1);
  next();
}

module.exports = { authLimiter, apiLimiter, sentinelLimiter };
