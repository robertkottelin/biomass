const express = require('express');
const path = require('path');

const router = express.Router();

// GET /api/sample-data/forest — public demo data
router.get('/forest', (req, res, next) => {
  try {
    const demoData = require('../fixtures/demo-forest.json');
    res.json(demoData);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
