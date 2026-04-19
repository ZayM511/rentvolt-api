require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const swaggerUi = require('swagger-ui-express');

const openApiSpec = require('../openapi.json');
const db = require('./db');
const apiKeyAuth = require('./middleware/apiKeyAuth');
const termsAcceptance = require('./middleware/termsAcceptance');
const { acceptTerms, CURRENT_TERMS_VERSION } = require('./middleware/termsAcceptance');
const requestLogger = require('./middleware/requestLogger');
const { validate, schemas } = require('./middleware/validation');
const stripeRoutes = require('./routes/stripe');
const scrapeRoutes = require('./routes/scrape');
const marketRoutes = require('./routes/market');
const { fetchListings } = require('./data');

const app = express();
const PORT = process.env.PORT || 3000;

const COMPANY = {
  name: 'Groundwork Labs LLC',
  type: 'California Limited Liability Company',
  entityId: 'B20260059957',
  jurisdiction: 'California, USA',
  address: '2108 N St Ste N, Sacramento, CA 95816, USA',
  supportEmail: 'support@groundworklabs.io',
  privacyEmail: 'support@groundworklabs.io',
  legalEmail: 'legal@groundworklabs.io'
};

// Trust Render's reverse proxy so req.ip reflects real client IPs.
app.set('trust proxy', 1);

// ─── Security headers ───────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Allow inline styles for now (marketing page uses them heavily).
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"], // block inline event handlers (onclick="...")
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production'
    ? 'https://rentvolt-api.onrender.com'
    : '*'),
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'x-api-key']
}));

// Preserve raw body for Stripe webhook signature verification
app.use((req, res, next) => {
  if (req.originalUrl === '/api/stripe/webhook') return next();
  express.json({ limit: '1mb' })(req, res, next);
});

// ─── Logging + request-ID ───────────────────────────────
app.use(requestLogger);

// ─── Global rate limiter ────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', retryAfter: '15 minutes' }
});
app.use(limiter);

// ─── Company headers ────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Company', COMPANY.name);
  res.setHeader('X-Jurisdiction', COMPANY.jurisdiction);
  res.setHeader('X-Terms-Version', CURRENT_TERMS_VERSION);
  next();
});

// ─── Static assets ──────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ─── Swagger UI ─────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'RentVolt API Docs'
}));

// ─── Landing / marketing ────────────────────────────────
app.get('/', (req, res) => {
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  res.json({
    service: 'RentVolt API',
    company: COMPANY.name,
    version: '2.0.0',
    docs: '/api-docs',
    endpoints: {
      health: 'GET /health',
      legal: 'GET /legal',
      verify: 'GET /api/verify',
      listings: 'POST /api/scrape/listings',
      bulk: 'POST /api/scrape/bulk',
      locations: 'GET /api/scrape/locations',
      marketTrends: 'GET /api/market/trends/:zip',
      marketBriefing: 'GET /api/market/briefing/:zip',
      plans: 'GET /api/stripe/plans',
      checkout: 'POST /api/stripe/checkout'
    }
  });
});

// ─── Pricing, success, cancel, dashboard pages ─────────
const servePublic = (file) => (req, res) =>
  res.sendFile(path.join(__dirname, 'public', file));

app.get('/pricing', servePublic('pricing.html'));
app.get('/success', servePublic('success.html'));
app.get('/cancel',  servePublic('cancel.html'));
app.get('/dashboard', servePublic('dashboard.html'));
app.get('/privacy-request', servePublic('privacy-request.html'));

// ─── On-site legal pages ────────────────────────────────
const LEGAL_DOCS = {
  tos: 'TermsOfService.md',
  privacy: 'PrivacyPolicy.md',
  disclaimer: 'LegalDisclaimer.md',
  compliance: 'Compliance.md',
  aup: 'AUP.md',
  refund: 'RefundPolicy.md',
  dmca: 'DMCA.md',
  'do-not-sell': 'DoNotSell.md'
};

app.get('/legal/:doc', (req, res) => {
  const filename = LEGAL_DOCS[req.params.doc];
  if (!filename) return res.status(404).json({ error: 'Unknown legal document' });
  const filepath = path.join(__dirname, '..', 'legal', filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Document not found' });

  const md = fs.readFileSync(filepath, 'utf8');
  const html = markdownToHtml(md);
  res.type('html').send(renderLegalPage(req.params.doc, html));
});

function markdownToHtml(md) {
  try {
    const { marked } = require('marked');
    return marked.parse(md);
  } catch {
    // Fallback: minimal markdown if the module isn't installed yet
    return `<pre style="white-space: pre-wrap">${md.replace(/[<>]/g, (c) => ({ '<': '&lt;', '>': '&gt;' }[c]))}</pre>`;
  }
}

function renderLegalPage(slug, bodyHtml) {
  const title = {
    tos: 'Terms of Service',
    privacy: 'Privacy Policy',
    disclaimer: 'Legal Disclaimer',
    compliance: 'Compliance & Regulatory',
    aup: 'Acceptable Use Policy',
    refund: 'Refund Policy',
    dmca: 'DMCA Policy',
    'do-not-sell': 'Do Not Sell or Share My Personal Information'
  }[slug] || 'Legal';

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — RentVolt</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; max-width: 780px; margin: 0 auto; padding: 40px 24px; color: #111; line-height: 1.6; }
  a { color: #0066cc; }
  nav { margin-bottom: 24px; }
  nav a { margin-right: 16px; font-size: 14px; }
  h1, h2, h3 { color: #0a0a1a; }
  code, pre { background: #f4f4f7; padding: 2px 6px; border-radius: 4px; }
  pre { padding: 12px; overflow-x: auto; }
  footer { margin-top: 64px; padding-top: 24px; border-top: 1px solid #eee; font-size: 13px; color: #666; }
</style></head><body>
<nav>
  <a href="/">← Home</a>
  <a href="/legal/tos">Terms</a>
  <a href="/legal/privacy">Privacy</a>
  <a href="/legal/aup">AUP</a>
  <a href="/legal/refund">Refunds</a>
  <a href="/legal/dmca">DMCA</a>
  <a href="/legal/disclaimer">Disclaimer</a>
  <a href="/legal/do-not-sell">Do Not Sell</a>
</nav>
<article>${bodyHtml}</article>
<footer>
  © 2026 Groundwork Labs LLC · California · Entity B20260059957 · 2108 N St Ste N, Sacramento, CA 95816 · support@groundworklabs.io
</footer>
</body></html>`;
}

// ─── Legal JSON endpoint (unchanged surface) ────────────
app.get('/legal', (req, res) => {
  res.json({
    company: COMPANY,
    termsOfServiceUrl: '/legal/tos',
    privacyPolicyUrl: '/legal/privacy',
    legalDisclaimerUrl: '/legal/disclaimer',
    complianceUrl: '/legal/compliance',
    aupUrl: '/legal/aup',
    refundPolicyUrl: '/legal/refund',
    dmcaUrl: '/legal/dmca',
    doNotSellUrl: '/legal/do-not-sell',
    currentTermsVersion: CURRENT_TERMS_VERSION
  });
});

// ─── Health ─────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const checks = { api: 'ok' };
  try {
    await db.ping();
    checks.db = 'ok';
  } catch (err) {
    checks.db = `error: ${err.message}`;
  }
  const allOk = Object.values(checks).every((v) => v === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    service: 'RentVolt API',
    version: '2.0.0',
    uptime: Math.floor(process.uptime()),
    checks,
    timestamp: new Date().toISOString()
  });
});

// ─── Free API key generation ────────────────────────────
const FREE_KEY_COOLDOWN_HOURS = 24;

app.post('/api/keys/free', validate(schemas.freeKey), async (req, res) => {
  try {
    const ip = req.ip;
    const { rows: recent } = await db.query(
      `SELECT 1 FROM free_key_issuance WHERE ip = $1::inet AND issued_at > now() - interval '${FREE_KEY_COOLDOWN_HOURS} hours' LIMIT 1`,
      [ip]
    );
    if (recent.length > 0) {
      return res.status(429).json({
        error: 'One free key per day.',
        message: 'You already claimed a free key today. Check your email, or upgrade at /pricing.',
        retryAfterHours: FREE_KEY_COOLDOWN_HOURS
      });
    }

    const email = (req.validated?.email) ||
                  `anon+${crypto.randomBytes(6).toString('hex')}@rentvolt.anonymous`;
    const user = await apiKeyAuth.findOrCreateUser(email);
    const key = await apiKeyAuth.generateKey({ plan: 'free', userId: user.id });

    await db.query(
      `INSERT INTO free_key_issuance (ip) VALUES ($1::inet)`,
      [ip]
    );

    res.json({
      success: true,
      apiKey: key,
      plan: 'free',
      monthlyRequests: 100,
      message: 'Save this key securely — we cannot retrieve it again. Store it in your env vars and use the x-api-key header.',
      docs: '/api-docs',
      upgrade: '/pricing'
    });
  } catch (err) {
    console.error('[keys/free] error:', err.message);
    res.status(500).json({ error: 'Could not issue free key. Please try again.' });
  }
});

// ─── Demo endpoint (unauthenticated, rate-limited) ──────
const DEMO_MAX_REQUESTS = 3;

app.get('/demo/listings', async (req, res) => {
  const city = String(req.query.city || '').toLowerCase().trim();
  const state = String(req.query.state || '').toLowerCase().trim() || 'ca';
  if (!city || !/^[a-z-]{2,50}$/.test(city)) {
    return res.status(400).json({ error: 'Invalid city', example: '?city=oakland&state=ca' });
  }
  if (!/^[a-z]{2}$/.test(state)) {
    return res.status(400).json({ error: 'Invalid state', example: '?city=oakland&state=ca' });
  }

  const ip = req.ip;
  try {
    const { rows } = await db.query(
      `SELECT count, first_used FROM demo_usage WHERE ip = $1::inet`,
      [ip]
    );
    if (rows[0] && rows[0].count >= DEMO_MAX_REQUESTS &&
        (Date.now() - new Date(rows[0].first_used).getTime()) < 24 * 60 * 60 * 1000) {
      return res.status(429).json({
        error: 'Demo limit reached',
        message: "You've used all 3 demo requests today. Get a free API key for 100 req/mo at /pricing.",
        freeKey: 'POST /api/keys/free'
      });
    }
    await db.query(
      `INSERT INTO demo_usage (ip, count, first_used, last_used)
       VALUES ($1::inet, 1, now(), now())
       ON CONFLICT (ip) DO UPDATE
         SET count = CASE WHEN demo_usage.first_used < now() - interval '24 hours' THEN 1 ELSE demo_usage.count + 1 END,
             first_used = CASE WHEN demo_usage.first_used < now() - interval '24 hours' THEN now() ELSE demo_usage.first_used END,
             last_used = now()`,
      [ip]
    );

    const results = await fetchListings(city, state, { limit: 5 });
    res.json({ success: true, ...results });
  } catch (err) {
    console.error('[demo/listings] error:', err.message);
    res.status(500).json({ error: 'Demo request failed. Please try again.' });
  }
});

// ─── Feedback (cancel-page) ─────────────────────────────
app.post('/api/feedback', validate(schemas.feedback), async (req, res) => {
  try {
    const { email, reason, message } = req.validated;
    await db.query(
      `INSERT INTO feedback (email, reason, message) VALUES ($1, $2, $3)`,
      [email || null, reason || null, message || null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[feedback] error:', err.message);
    res.status(500).json({ error: 'Could not save feedback' });
  }
});

// ─── Privacy request (CCPA/CPRA) ────────────────────────
app.post('/api/privacy-request', async (req, res) => {
  try {
    const { email, requestType, notes } = req.body || {};
    const VALID = ['access', 'delete', 'correct', 'opt_out', 'limit_sensitive', 'appeal'];
    if (!email || !VALID.includes(requestType)) {
      return res.status(400).json({
        error: 'Invalid request',
        required: { email: 'string', requestType: VALID }
      });
    }
    const token = crypto.randomBytes(24).toString('hex');
    await db.query(
      `INSERT INTO privacy_requests (email, request_type, verification_token, notes)
       VALUES ($1, $2, $3, $4)`,
      [email, requestType, token, notes || null]
    );
    res.json({
      success: true,
      message: 'Request received. We will verify your identity and respond within 45 days as required by CPRA.',
      contact: 'support@groundworklabs.io'
    });
  } catch (err) {
    console.error('[privacy-request] error:', err.message);
    res.status(500).json({ error: 'Could not submit request' });
  }
});

// ─── API key verify + terms acceptance endpoints ────────
app.use('/api', (req, res, next) => {
  const publicPaths = ['/stripe/checkout', '/stripe/plans', '/stripe/webhook', '/stripe/session', '/feedback', '/privacy-request', '/keys/free'];
  if (publicPaths.some((p) => req.path === p || req.path.startsWith(`${p}/`))) return next();
  return apiKeyAuth(req, res, next);
});

app.get('/api/verify', (req, res) => {
  res.json({
    valid: true,
    plan: req.apiKey.plan,
    remaining: req.apiKey.remaining,
    monthlyRequests: req.apiKey.monthlyRequests,
    used: req.apiKey.used
  });
});

app.post('/api/terms/accept', validate(schemas.acceptTerms), acceptTerms);

// ─── Stripe ─────────────────────────────────────────────
// public paths on the /stripe router (checkout/plans/webhook/session) skip termsAcceptance
app.use('/api/stripe', (req, res, next) => {
  const skipTerms = ['/checkout', '/plans', '/webhook'];
  if (skipTerms.includes(req.path) || req.path.startsWith('/session/')) return next();
  return termsAcceptance(req, res, next);
}, stripeRoutes);

// ─── Market intelligence (terms + auth enforced by /api middleware above) ─
app.use('/api/market', termsAcceptance, marketRoutes);

// ─── Scrape / listings ──────────────────────────────────
app.use('/api/scrape', termsAcceptance, scrapeRoutes);

// ─── 404 ────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    hint: 'GET / for available endpoints'
  });
});

// ─── Global error handler ───────────────────────────────
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${err.stack || err.message}`);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    requestId: req.requestId
  });
});

// ─── Start (only when run directly, not when imported for tests) ─
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║   RentVolt API  v2.0.0                        ║
║   © 2026 Groundwork Labs LLC                  ║
║   ${COMPANY.address.padEnd(43)}║
║   Port ${String(PORT).padEnd(6)} │ ${(process.env.NODE_ENV || 'development').padEnd(22)}║
╚═══════════════════════════════════════════════╝
  `);
  });

  const shutdown = (signal) => {
    console.log(`\n[${signal}] Shutting down gracefully...`);
    server.close(async () => {
      try { await db.pool.end(); } catch {}
      console.log('Server closed.');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

module.exports = app;
