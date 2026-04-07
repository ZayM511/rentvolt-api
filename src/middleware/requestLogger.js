const crypto = require('crypto');

const requestLogger = (req, res, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID().slice(0, 12);

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Log request (skip health checks in production)
  if (req.path !== '/health' || process.env.NODE_ENV !== 'production') {
    console.log(`[${requestId}] ${req.method} ${req.path} ${req.ip}`);
  }

  res.on('finish', () => {
    const duration = Date.now() - start;
    const icon = res.statusCode >= 500 ? '🔴' : res.statusCode >= 400 ? '🟡' : '🟢';
    console.log(`[${requestId}] ${icon} ${res.statusCode} (${duration}ms)`);
  });

  next();
};

module.exports = requestLogger;
