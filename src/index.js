require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const apiKeyAuth = require('./middleware/apiKeyAuth');
const termsAcceptance = require('./middleware/termsAcceptance');
const requestLogger = require('./middleware/requestLogger');
const { validate, schemas } = require('./middleware/validation');
const stripeRoutes = require('./routes/stripe');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const openApiSpec = require('../openapi.json');
const scrapeRoutes = require('./routes/scrape');
const { scrapeAll } = require('./scrapers');

const app = express();
const PORT = process.env.PORT || 3000;
const COMPANY = {
  name: 'Groundwork Labs LLC',
  type: 'Limited Liability Company',
  jurisdiction: 'California, USA'
};

// ── Demo Rate Limiting ──────────────────────────
const DEMO_CITIES = {
  'oakland': 'ca', 'san-francisco': 'ca', 'los-angeles': 'ca', 'san-jose': 'ca',
  'seattle': 'wa', 'portland': 'or', 'austin': 'tx', 'denver': 'co',
  'chicago': 'il', 'new-york': 'ny', 'boston': 'ma', 'miami': 'fl'
};
const demoRateLimits = new Map();
const DEMO_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DEMO_MAX_REQUESTS = 3;

// Cleanup stale demo entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of demoRateLimits) {
    if (now - entry.firstUsed > DEMO_COOLDOWN_MS) demoRateLimits.delete(ip);
  }
}, 60 * 60 * 1000);

// ── Security ─────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"]
    }
  }
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'x-terms-accepted']
}));
app.use(express.json({ limit: '1mb' }));

// ── Logging ──────────────────────────────────────
app.use(requestLogger);

// ── Rate Limiting ────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', retryAfter: '15 minutes' }
});
app.use(limiter);

// ── Company Headers ──────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Company', COMPANY.name);
  res.setHeader('X-Jurisdiction', COMPANY.jurisdiction);
  res.setHeader('X-Terms-Version', '2026.04.07');
  next();
});

// ── Docs ─────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'RentVolt API Docs'
}));

// ── Public Routes ────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'RentVolt API',
    version: '1.1.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.get('/legal', (req, res) => {
  res.json({
    company: COMPANY.name,
    type: COMPANY.type,
    jurisdiction: COMPANY.jurisdiction,
    termsOfService: 'https://github.com/ZayM511/realestate-scraper-api/blob/main/legal/TermsOfService.md',
    privacyPolicy: 'https://github.com/ZayM511/realestate-scraper-api/blob/main/legal/PrivacyPolicy.md',
    disclaimer: 'https://github.com/ZayM511/realestate-scraper-api/blob/main/legal/LegalDisclaimer.md'
  });
});

app.get('/', (req, res) => {
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  res.json({
    service: 'RentVolt API',
    company: COMPANY.name,
    version: '1.1.0',
    website: '/',
    docs: '/api-docs',
    endpoints: {
      health: 'GET /health',
      legal: 'GET /legal',
      verify: 'GET /api/verify',
      locations: 'GET /api/scrape/locations',
      listings: 'POST /api/scrape/listings',
      bulk: 'POST /api/scrape/bulk',
      plans: 'GET /api/stripe/plans',
      checkout: 'POST /api/stripe/checkout'
    }
  });
});

// ── Demo Endpoint (unauthenticated, rate-limited) ─
app.get('/demo/listings', async (req, res) => {
  const city = (req.query.city || '').toLowerCase().trim();
  const state = DEMO_CITIES[city];

  if (!state) {
    return res.status(400).json({
      error: 'Invalid city',
      validCities: Object.keys(DEMO_CITIES)
    });
  }

  const ip = req.ip || req.connection.remoteAddress;
  const entry = demoRateLimits.get(ip);
  if (entry && (Date.now() - entry.firstUsed) < DEMO_COOLDOWN_MS && entry.count >= DEMO_MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Demo limit reached',
      message: "You've used all 3 demo requests. Sign up for a free API key to continue.",
      docs: '/api-docs'
    });
  }

  if (!entry || (Date.now() - entry.firstUsed) >= DEMO_COOLDOWN_MS) {
    demoRateLimits.set(ip, { firstUsed: Date.now(), count: 1 });
  } else {
    entry.count++;
  }

  try {
    const results = await scrapeAll(city, state, { limit: 5, sortBy: 'price' });
    res.json({ success: true, ...results });
  } catch (err) {
    console.error('[DEMO] Scrape error:', err.message);
    res.status(500).json({ error: 'Demo request failed. Please try again.' });
  }
});

// ── Authenticated Routes ─────────────────────────
app.use('/api', apiKeyAuth);

app.get('/api/verify', (req, res) => {
  res.json({
    valid: true,
    plan: req.apiKey.plan,
    remaining: req.apiKey.remaining
  });
});

// Stripe (needs terms acceptance + validation)
app.use('/api/stripe', termsAcceptance, stripeRoutes);

// Scrape (terms acceptance; validation applied per-route inside scrape router)
app.use('/api/scrape', termsAcceptance, scrapeRoutes);

// ── 404 ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    hint: 'GET / for available endpoints'
  });
});

// ── Global Error Handler ─────────────────────────
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${err.stack || err.message}`);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    requestId: req.requestId
  });
});

// ── Start ────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║   RentVolt API  v1.1.0              ║
║   © 2026 Groundwork Labs LLC                  ║
║   California, USA                             ║
║   Port ${PORT} │ ${process.env.NODE_ENV || 'development'}                     ║
╚═══════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
