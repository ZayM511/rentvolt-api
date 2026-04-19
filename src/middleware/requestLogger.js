const crypto = require('crypto');
const { query } = require('../db');

const requestLogger = (req, res, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID().slice(0, 12);
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  if (req.path !== '/health' || process.env.NODE_ENV !== 'production') {
    console.log(`[${requestId}] ${req.method} ${req.path} ${req.ip}`);
  }

  res.on('finish', () => {
    const duration = Date.now() - start;
    const icon = res.statusCode >= 500 ? '🔴' : res.statusCode >= 400 ? '🟡' : '🟢';
    console.log(`[${requestId}] ${icon} ${res.statusCode} (${duration}ms)`);

    // Persist usage events for authenticated API calls (fire-and-forget)
    if (req.apiKey?.id && req.path.startsWith('/api/') && req.path !== '/api/stripe/webhook') {
      query(
        `INSERT INTO usage_events (api_key_id, endpoint, status_code, ms, ip)
         VALUES ($1, $2, $3, $4, $5::inet)`,
        [req.apiKey.id, req.path, res.statusCode, duration, req.ip]
      ).catch((err) => console.warn('[usage_events] write failed:', err.message));
    }
  });

  next();
};

module.exports = requestLogger;
