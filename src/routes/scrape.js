const express = require('express');
const router = express.Router();
const { fetchListings } = require('../data');
const { validate, schemas } = require('../middleware/validation');

// ─── POST /api/scrape/listings ─────────────────────────
router.post('/listings', validate(schemas.scrapeListings), async (req, res) => {
  try {
    const { city, state, filters } = req.validated;
    const results = await fetchListings(city, state, filters);
    res.json({
      success: true,
      ...results,
      meta: {
        requestId: req.requestId,
        plan: req.apiKey.plan,
        remaining: req.apiKey.remaining
      }
    });
  } catch (error) {
    console.error('[scrape/listings] error:', error.message);
    res.status(error.status || 500).json({
      success: false,
      error: 'Fetch failed',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal error',
      requestId: req.requestId
    });
  }
});

// ─── POST /api/scrape/bulk ─────────────────────────────
// Paid-plans only (Growth / Scale / Enterprise)
router.post('/bulk', validate(schemas.scrapeBulk), async (req, res) => {
  try {
    if (req.apiKey.plan === 'free') {
      return res.status(403).json({
        error: 'Bulk endpoint requires a paid plan',
        currentPlan: 'free',
        upgrade: '/pricing'
      });
    }

    const { locations, filters } = req.validated;

    const settled = await Promise.allSettled(
      locations.map(({ city, state }) => fetchListings(city, state, filters))
    );

    const results = locations.map((loc, i) => {
      const r = settled[i];
      if (r.status === 'fulfilled') return { city: loc.city, state: loc.state, success: true, ...r.value };
      return { city: loc.city, state: loc.state, success: false, error: r.reason?.message || 'Unknown error' };
    });

    res.json({
      success: true,
      results,
      totalLocations: locations.length,
      meta: {
        requestId: req.requestId,
        plan: req.apiKey.plan,
        remaining: req.apiKey.remaining
      }
    });
  } catch (error) {
    console.error('[scrape/bulk] error:', error.message);
    res.status(500).json({ success: false, error: error.message, requestId: req.requestId });
  }
});

// ─── GET /api/scrape/locations ─────────────────────────
router.get('/locations', (req, res) => {
  res.json({
    note: 'Any US city/state can be queried. Coverage provided by RentCast (140M+ properties) with HUD + Census context.',
    sources: ['rentcast', 'hud', 'census'],
    recommendedStateCodes: ['CA', 'NY', 'TX', 'FL', 'IL', 'WA', 'OR', 'CO', 'MA', 'AZ']
  });
});

module.exports = router;
