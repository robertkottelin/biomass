const express = require('express');
const knex = require('knex');
const knexConfig = require('../db/knexfile');
const { requireAuth } = require('../middleware/auth');
const logger = require('../lib/logger');

const db = knex(knexConfig);
const router = express.Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return require('stripe')(key);
}

// Map price IDs to plan names
function getPlanFromPriceId(priceId) {
  const proPriceId = process.env.STRIPE_PRO_PRICE_ID;
  const businessPriceId = process.env.STRIPE_BUSINESS_PRICE_ID;

  if (priceId === proPriceId) return 'pro';
  if (priceId === businessPriceId) return 'business';
  return null;
}

// GET /api/stripe/config — public price IDs
router.get('/config', (req, res) => {
  res.json({
    proPriceId: process.env.STRIPE_PRO_PRICE_ID,
    businessPriceId: process.env.STRIPE_BUSINESS_PRICE_ID,
  });
});

// POST /api/stripe/create-checkout-session
router.post('/create-checkout-session', requireAuth, async (req, res, next) => {
  try {
    const stripe = getStripe();
    const { priceId } = req.body;

    if (!priceId) {
      return res.status(400).json({ error: 'priceId is required' });
    }

    const user = await db('users').where('id', req.user.id).first();
    let customerId = user.stripe_customer_id;

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { userId: String(user.id) },
      });
      customerId = customer.id;
      await db('users').where('id', user.id).update({ stripe_customer_id: customerId });
    }

    // Schedule cancellation of existing subscription (if upgrading)
    const existingSub = await db('subscriptions')
      .where({ user_id: user.id, status: 'active' })
      .whereNotNull('stripe_subscription_id')
      .first();

    if (existingSub) {
      await stripe.subscriptions.update(existingSub.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
    }

    const origin = process.env.APP_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/app?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${origin}/app?status=cancelled`,
      metadata: { userId: String(user.id) },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/stripe/webhook
// NOTE: This route needs raw body — handled specially in index.js
router.post('/webhook', async (req, res, next) => {
  try {
    const stripe = getStripe();
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error('STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook not configured' });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      logger.warn('Webhook signature verification failed', err);
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        // Find user by stripe_customer_id
        const user = await db('users').where('stripe_customer_id', customerId).first();
        if (!user) {
          logger.error('No user found for Stripe customer', { customerId });
          break;
        }

        // Retrieve subscription to get price info
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = sub.items.data[0]?.price?.id;
        const plan = getPlanFromPriceId(priceId) || 'pro';

        // Upsert subscription record
        const existing = await db('subscriptions').where('user_id', user.id).first();
        if (existing) {
          await db('subscriptions').where('user_id', user.id).update({
            stripe_subscription_id: subscriptionId,
            plan,
            status: 'active',
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          });
        } else {
          await db('subscriptions').insert({
            user_id: user.id,
            stripe_subscription_id: subscriptionId,
            plan,
            status: 'active',
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const subscriptionId = sub.id;
        const priceId = sub.items.data[0]?.price?.id;
        const plan = getPlanFromPriceId(priceId) || 'pro';
        const status = sub.status === 'active' ? 'active' : sub.status;

        await db('subscriptions').where('stripe_subscription_id', subscriptionId).update({
          plan,
          status,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const subscriptionId = sub.id;

        await db('subscriptions').where('stripe_subscription_id', subscriptionId).update({
          plan: 'free',
          status: 'cancelled',
        });
        break;
      }

      default:
        // Unhandled event type
        break;
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/stripe/create-portal-session
router.post('/create-portal-session', requireAuth, async (req, res, next) => {
  try {
    const stripe = getStripe();
    const user = await db('users').where('id', req.user.id).first();

    if (!user.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found. Please subscribe first.' });
    }

    const origin = process.env.APP_URL || 'http://localhost:3000';

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${origin}/app`,
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
