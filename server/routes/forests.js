const express = require('express');
const path = require('path');
const knex = require('knex');
const knexConfig = require('../db/knexfile');
const { requireAuth } = require('../middleware/auth');
const { checkForestLimit } = require('../middleware/tierCheck');
const logger = require('../lib/logger');

const db = knex(knexConfig);
const router = express.Router();

// GET /api/forests/demo/sample — no auth required
router.get('/demo/sample', (req, res, next) => {
  try {
    const demoData = require('../fixtures/demo-forest.json');
    res.json(demoData);
  } catch (err) {
    next(err);
  }
});

// GET /api/forests — list user's forests
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const forests = await db('forests')
      .where('user_id', req.user.id)
      .select('id', 'name', 'polygon_geojson', 'forest_type', 'forest_age', 'area_hectares', 'created_at')
      .orderBy('created_at', 'desc');

    res.json({ forests });
  } catch (err) {
    next(err);
  }
});

// POST /api/forests — create forest
router.post('/', requireAuth, checkForestLimit, async (req, res, next) => {
  try {
    const { name, polygon_geojson, forest_type, forest_age, area_hectares } = req.body;

    if (!polygon_geojson) {
      return res.status(400).json({ error: 'polygon_geojson is required' });
    }

    const geojsonStr =
      typeof polygon_geojson === 'string' ? polygon_geojson : JSON.stringify(polygon_geojson);

    const [id] = await db('forests').insert({
      user_id: req.user.id,
      name: name || 'Unnamed Forest',
      polygon_geojson: geojsonStr,
      forest_type: forest_type || 'pine',
      forest_age: forest_age || null,
      area_hectares: area_hectares || null,
    });

    const forest = await db('forests').where('id', id).first();
    logger.info('Forest created', { forestId: id, userId: req.user.id, name: forest.name });
    res.status(201).json({ forest });
  } catch (err) {
    next(err);
  }
});

// GET /api/forests/:id — get forest with latest analysis
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const forest = await db('forests')
      .where({ id: req.params.id, user_id: req.user.id })
      .first();

    if (!forest) {
      return res.status(404).json({ error: 'Forest not found' });
    }

    const latestAnalysis = await db('analyses')
      .where('forest_id', forest.id)
      .orderBy('created_at', 'desc')
      .first();

    res.json({
      forest,
      analysis: latestAnalysis
        ? {
            id: latestAnalysis.id,
            ndvi_data: latestAnalysis.ndvi_data_json
              ? JSON.parse(latestAnalysis.ndvi_data_json)
              : null,
            biomass_data: latestAnalysis.biomass_data_json
              ? JSON.parse(latestAnalysis.biomass_data_json)
              : null,
            created_at: latestAnalysis.created_at,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/forests/:id — delete forest
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const forest = await db('forests')
      .where({ id: req.params.id, user_id: req.user.id })
      .first();

    if (!forest) {
      return res.status(404).json({ error: 'Forest not found' });
    }

    await db('analyses').where('forest_id', forest.id).del();
    await db('forests').where('id', forest.id).del();
    logger.info('Forest deleted', { forestId: forest.id, userId: req.user.id });

    res.json({ message: 'Forest deleted' });
  } catch (err) {
    next(err);
  }
});

// POST /api/forests/:id/analyses — save analysis results
router.post('/:id/analyses', requireAuth, async (req, res, next) => {
  try {
    const forest = await db('forests')
      .where({ id: req.params.id, user_id: req.user.id })
      .first();

    if (!forest) {
      return res.status(404).json({ error: 'Forest not found' });
    }

    const { ndvi_data_json, biomass_data_json } = req.body;

    const ndviStr =
      typeof ndvi_data_json === 'string' ? ndvi_data_json : JSON.stringify(ndvi_data_json);
    const biomassStr =
      typeof biomass_data_json === 'string'
        ? biomass_data_json
        : JSON.stringify(biomass_data_json);

    const [id] = await db('analyses').insert({
      forest_id: forest.id,
      ndvi_data_json: ndviStr,
      biomass_data_json: biomassStr,
    });
    logger.info('Analysis saved', { analysisId: id, forestId: forest.id, userId: req.user.id });

    res.status(201).json({
      analysis: { id, forest_id: forest.id, created_at: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
