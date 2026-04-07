const express = require('express');
const router = express.Router();
const { scrapeAll } = require('../scrapers');

router.post('/listings', async (req, res) => {
  try {
    const { city, state, filters = {} } = req.body;
    
    if (!city || !state) {
      return res.status(400).json({ error: 'City and state are required' });
    }
    
    // Rate limit check for free tier
    if (req.apiKey.plan === 'free' && req.apiKey.used >= req.apiKey.monthlyRequests) {
      return res.status(429).json({ error: 'Monthly limit reached. Upgrade to continue.' });
    }
    
    const results = await scrapeAll(city, state, filters);
    
    // Mark API key usage
    if (req.apiKey.plan !== 'free') {
      // Track usage in production DB
    }
    
    res.json(results);
  } catch (error) {
    console.error('Scrape error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/locations', (req, res) => {
  res.json({
    locations: [
      { city: 'oakland', state: 'ca' },
      { city: 'san-francisco', state: 'ca' },
      { city: 'los-angeles', state: 'ca' },
      { city: 'seattle', state: 'wa' },
      { city: 'portland', state: 'or' },
      { city: 'austin', state: 'tx' },
      { city: 'denver', state: 'co' }
    ],
    sources: ['rentals.com', 'zillow.com']
  });
});

module.exports = router;
