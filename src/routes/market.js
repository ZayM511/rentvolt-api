const express = require('express');
const router = express.Router();
const { fetchMarketTrends, fetchBriefing } = require('../data');
const { validateParam, schemas } = require('../middleware/validation');

// ─── GET /api/market/trends/:zip ───────────────────────
router.get('/trends/:zip', validateParam('zip', schemas.zip), async (req, res) => {
  try {
    const state = typeof req.query.state === 'string' ? req.query.state.trim() : null;
    const data = await fetchMarketTrends(req.params.zip, state);
    res.json({
      success: true,
      ...data,
      meta: {
        requestId: req.requestId,
        plan: req.apiKey.plan,
        remaining: req.apiKey.remaining
      }
    });
  } catch (error) {
    console.error('[market/trends] error:', error.message);
    res.status(error.status || 500).json({
      success: false,
      error: error.message,
      requestId: req.requestId
    });
  }
});

// ─── GET /api/market/briefing/:zip ─────────────────────
// One-paragraph, LLM-friendly market briefing (Lever 3: AI-agent DX)
router.get('/briefing/:zip', validateParam('zip', schemas.zip), async (req, res) => {
  try {
    const state = typeof req.query.state === 'string' ? req.query.state.trim() : null;
    const data = await fetchBriefing(req.params.zip, state);
    res.json({
      success: true,
      ...data,
      meta: {
        requestId: req.requestId,
        plan: req.apiKey.plan,
        remaining: req.apiKey.remaining
      }
    });
  } catch (error) {
    console.error('[market/briefing] error:', error.message);
    res.status(error.status || 500).json({
      success: false,
      error: error.message,
      requestId: req.requestId
    });
  }
});

module.exports = router;
