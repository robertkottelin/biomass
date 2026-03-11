const path = require('path');
const fs = require('fs');

// Load environment variables from project root .env
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const knex = require('knex');
const knexConfig = require('./db/knexfile');

const logger = require('./lib/logger');
const authRoutes = require('./routes/auth');
const sentinelRoutes = require('./routes/sentinel');
const stripeRoutes = require('./routes/stripe');
const forestRoutes = require('./routes/forests');
const sampleRoutes = require('./routes/sample');
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security ──────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // Let the React app handle CSP
  })
);

// ── CORS ──────────────────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (server-to-server, curl, etc.)
      if (!origin) return callback(null, true);
      // In development, allow all local origins (localhost and LAN IPs)
      if (!isProduction) {
        return callback(null, true);
      }
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// ── Cookie parser ─────────────────────────────────────────────────────
app.use(cookieParser());

// ── Stripe webhook route (needs raw body — MUST come before JSON parser) ──
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// ── JSON body parser for all other routes ─────────────────────────────
app.use(express.json({ limit: '10mb' }));

// ── Request logging ──────────────────────────────────────────────────
app.use('/api/', (req, res, next) => {
  const start = Date.now();
  const { method, originalUrl } = req;
  const userId = req.user ? req.user.id : '-';

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${method} ${originalUrl} ${res.statusCode} ${duration}ms`, { userId });
  });
  next();
});

// ── General rate limiter (sentinel has its own dedicated limiter) ─────
app.use(/\/api\/(?!sentinel)/, apiLimiter);

// ── API Routes ────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/sentinel', sentinelRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/forests', forestRoutes);
app.use('/api/sample-data', sampleRoutes);

// ── Serve React build ─────────────────────────────────────────────────
const buildPath = path.resolve(__dirname, '..', 'forest-biomass-analyzer', 'build');
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));

  // Catch-all: serve index.html for React Router
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

// ── Error handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ── Database migration & server start ─────────────────────────────────
async function start() {
  try {
    // Ensure data directory exists
    const dataDir = path.resolve(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Run migrations
    const db = knex(knexConfig);
    logger.info('Running database migrations...');
    await db.migrate.latest();
    logger.info('Migrations complete.');
    await db.destroy();

    app.listen(PORT, () => {
      logger.info(`Biomass server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

start();
