const express = require('express');
const router = express.Router();
const { scrapeAll } = require('../scrapers');
const { validate, schemas } = require('../middleware/validation');

// Single city lookup
router.post('/listings', validate(schemas.scrapeListings), async (req, res) => {
  try {
    const { city, state, filters = {} } = req.validated || req.body;
    const { sources, maxPrice, minBeds } = filters;
    const results = await scrapeAll(city, state, { sources, maxPrice, minBeds });

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
    console.error('Scrape error:', error);
    res.status(500).json({
      success: false,
      error: 'Scrape failed',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal error',
      requestId: req.requestId
    });
  }
});

// Bulk: scrape multiple cities in one request (Pro plan only)
router.post('/bulk', async (req, res) => {
  try {
    const { locations, filters = {} } = req.body;

    if (!Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({ error: 'locations must be a non-empty array of { city, state }' });
    }

    if (locations.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 locations per bulk request' });
    }

    if (req.apiKey.plan === 'free') {
      return res.status(403).json({ error: 'Bulk endpoint requires a paid plan (Growth, Scale, or Enterprise)', upgrade: 'POST /api/stripe/checkout' });
    }

    const results = await Promise.allSettled(
      locations.map(({ city, state }) => scrapeAll(city, state, filters))
    );

    const response = locations.map((loc, i) => ({
      city: loc.city,
      state: loc.state,
      ...(results[i].status === 'fulfilled'
        ? { success: true, ...results[i].value }
        : { success: false, error: results[i].reason?.message || 'Unknown error' })
    }));

    res.json({
      success: true,
      results: response,
      totalLocations: locations.length,
      meta: { requestId: req.requestId, plan: req.apiKey.plan, remaining: req.apiKey.remaining }
    });
  } catch (error) {
    console.error('Bulk scrape error:', error);
    res.status(500).json({ success: false, error: error.message, requestId: req.requestId });
  }
});

// Supported locations & sources
router.get('/locations', (req, res) => {
  res.json({
    locations: [
      { city: 'oakland', state: 'ca', region: 'Bay Area' },
      { city: 'san-francisco', state: 'ca', region: 'Bay Area' },
      { city: 'los-angeles', state: 'ca', region: 'Southern California' },
      { city: 'san-jose', state: 'ca', region: 'Bay Area' },
      { city: 'seattle', state: 'wa', region: 'Pacific Northwest' },
      { city: 'portland', state: 'or', region: 'Pacific Northwest' },
      { city: 'austin', state: 'tx', region: 'Texas' },
      { city: 'denver', state: 'co', region: 'Mountain West' },
      { city: 'chicago', state: 'il', region: 'Midwest' },
      { city: 'new-york', state: 'ny', region: 'Northeast' },
      { city: 'boston', state: 'ma', region: 'Northeast' },
      { city: 'miami', state: 'fl', region: 'Southeast' }
    ],
    sources: ['rentals', 'zillow', 'apartments', 'rentcafe', 'hotpads', 'zumper'],
    note: 'Any US city can be queried; listed locations have optimized coverage.'
  });
});

module.exports = router;
