const { query } = require('../db');

const CURRENT_TERMS_VERSION = '2026.04.17';

// For paid plans, confirm the user has recorded acceptance of the current ToS.
const termsAcceptance = async (req, res, next) => {
  try {
    if (!req.apiKey) return next(); // only runs after apiKeyAuth
    if (req.apiKey.plan === 'free') return next();

    const { rows } = await query(
      `SELECT terms_accepted_version, terms_accepted_at
       FROM users WHERE id = $1`,
      [req.apiKey.userId]
    );
    const u = rows[0];

    if (!u || u.terms_accepted_version !== CURRENT_TERMS_VERSION) {
      return res.status(403).json({
        error: 'Terms of Service must be accepted',
        currentVersion: CURRENT_TERMS_VERSION,
        acceptedVersion: u?.terms_accepted_version || null,
        acceptEndpoint: 'POST /api/terms/accept',
        termsUrl: '/legal/tos'
      });
    }
    next();
  } catch (err) {
    console.error('[termsAcceptance] error:', err.message);
    res.status(500).json({ error: 'Terms check failed' });
  }
};

const acceptTerms = async (req, res) => {
  try {
    if (!req.apiKey) return res.status(401).json({ error: 'API key required' });
    const { version } = req.body || {};
    if (version !== CURRENT_TERMS_VERSION) {
      return res.status(400).json({
        error: 'Version mismatch',
        currentVersion: CURRENT_TERMS_VERSION
      });
    }
    await query(
      `UPDATE users
       SET terms_accepted_version = $1,
           terms_accepted_at = now(),
           terms_accepted_ip = $2::inet,
           terms_accepted_ua = $3,
           updated_at = now()
       WHERE id = $4`,
      [version, req.ip, req.headers['user-agent'] || null, req.apiKey.userId]
    );
    res.json({ success: true, version, acceptedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[acceptTerms] error:', err.message);
    res.status(500).json({ error: 'Could not record acceptance' });
  }
};

module.exports = termsAcceptance;
module.exports.acceptTerms = acceptTerms;
module.exports.CURRENT_TERMS_VERSION = CURRENT_TERMS_VERSION;
