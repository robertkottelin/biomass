const knex = require('knex');
const knexConfig = require('../db/knexfile');
const logger = require('../lib/logger');

const db = knex(knexConfig);

const FOREST_LIMITS = {
  free: 0,
  pro: 10,
  business: Infinity,
};

function requirePlan(...plans) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!plans.includes(req.user.plan)) {
      return res.status(403).json({
        error: 'Plan upgrade required',
        message: `This feature requires one of the following plans: ${plans.join(', ')}. Your current plan is "${req.user.plan}".`,
        requiredPlans: plans,
        currentPlan: req.user.plan,
      });
    }

    next();
  };
}

async function checkForestLimit(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const plan = req.user.plan || 'free';
  const limit = FOREST_LIMITS[plan];

  if (limit === Infinity) {
    return next();
  }

  const count = await db('forests').where('user_id', req.user.id).count('id as cnt').first();
  const currentCount = count ? count.cnt : 0;

  if (currentCount >= limit) {
    logger.warn('Forest limit reached', { userId: req.user.id, plan, limit, currentCount });
    const msg =
      limit === 0
        ? 'Free plan users can only access the demo forest. Upgrade to Pro to save your own forests.'
        : `You have reached the forest limit for your plan (${limit}). Upgrade to add more forests.`;

    return res.status(403).json({
      error: 'Forest limit reached',
      message: msg,
      currentCount,
      limit,
      currentPlan: plan,
    });
  }

  next();
}

module.exports = { requirePlan, checkForestLimit };
