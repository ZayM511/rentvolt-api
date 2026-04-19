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
const authRoutes = require('./routes/auth');
const { attachSession } = require('./middleware/session');
const { fetchListings } = require('./data');

const app = express();
const PORT = process.env.PORT || 3000;

const COMPANY = {
  name: 'Groundwork Labs LLC',
  type: 'California Limited Liability Company',
  entityId: 'B20260059957',
  jurisdiction: 'California, USA',
  address: 'California, USA',
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
      // Allow inline styles (marketing page) + Google Fonts stylesheet host.
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
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

// ─── Session (attaches req.user if cookie present; non-blocking) ─
app.use(attachSession);

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
app.get('/demo', servePublic('demo.html'));

// ─── Cache-Control for static-ish marketing pages ───────
app.use((req, res, next) => {
  const p = req.path;
  if (p === '/' || p === '/pricing' || p === '/api-docs' || p.startsWith('/legal/') || p === '/robots.txt' || p === '/sitemap.xml') {
    res.set('Cache-Control', 'public, max-age=300, must-revalidate');
  } else if (p === '/og.png' || p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.svg')) {
    res.set('Cache-Control', 'public, max-age=86400, immutable');
  }
  next();
});

// ─── On-site legal pages ────────────────────────────────
const LEGAL_DOCS = {
  tos: 'TermsOfService.md',
  privacy: 'PrivacyPolicy.md',
  disclaimer: 'LegalDisclaimer.md',
  compliance: 'Compliance.md',
  aup: 'AUP.md',
  refund: 'RefundPolicy.md',
  dmca: 'DMCA.md',
  'do-not-sell': 'DoNotSell.md',
  'api-versioning': 'API_VERSIONING.md'
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
    'do-not-sell': 'Do Not Sell or Share My Personal Information',
    'api-versioning': 'API Versioning & Deprecation Policy'
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
  © 2026 Groundwork Labs LLC · California · Entity B20260059957 · support@groundworklabs.io
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

// ─── Upstream data-source health ─────────────────────────
// Surfaces silent outages on RentCast / HUD / Census. No API key required.
app.get('/api/health/sources', async (req, res) => {
  const axios = require('axios');
  const check = async (name, url, headers = {}) => {
    const t0 = Date.now();
    try {
      const response = await axios.get(url, { headers, timeout: 5000, validateStatus: () => true });
      return { name, ok: response.status < 500, status: response.status, latencyMs: Date.now() - t0 };
    } catch (err) {
      return { name, ok: false, error: err.code || err.message, latencyMs: Date.now() - t0 };
    }
  };
  const [rentcast, hud, census] = await Promise.all([
    process.env.RENTCAST_API_KEY
      ? check('rentcast', 'https://api.rentcast.io/v1/listings/rental/long-term?city=Austin&state=TX&limit=1', { 'X-Api-Key': process.env.RENTCAST_API_KEY })
      : Promise.resolve({ name: 'rentcast', ok: false, error: 'RENTCAST_API_KEY not configured' }),
    process.env.HUD_API_TOKEN
      ? check('hud', 'https://www.huduser.gov/hudapi/public/fmr/data/78701?year=' + new Date().getFullYear(), { Authorization: `Bearer ${process.env.HUD_API_TOKEN}` })
      : Promise.resolve({ name: 'hud', ok: false, error: 'HUD_API_TOKEN not configured' }),
    check('census', 'https://api.census.gov/data/2023/acs/acs5?get=B25064_001E&for=zip%20code%20tabulation%20area:78701' + (process.env.CENSUS_API_KEY ? `&key=${process.env.CENSUS_API_KEY}` : ''))
  ]);
  const allOk = rentcast.ok && hud.ok && census.ok;
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    sources: { rentcast, hud, census },
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

    const results = await fetchListings(city, state, { limit: 50 });
    const sourcesPresent = Object.entries(results.sources || {}).filter(([, v]) => v > 0).map(([k]) => k);

    // Augment with HUD + Census context using the first listing's ZIP (if any).
    let marketContext = null;
    const firstZip = results.listings?.find((l) => l.zip)?.zip;
    if (firstZip) {
      const { fetchMarketTrends } = require('./data');
      try {
        const trends = await fetchMarketTrends(firstZip, state);
        if (trends.hud) sourcesPresent.push('hud');
        if (trends.census) sourcesPresent.push('census');
        marketContext = {
          zip: firstZip,
          hud: trends.hud || null,
          census: trends.census || null,
          ...(trends.hudError    ? { _debug_hudError:    trends.hudError }    : {}),
          ...(trends.censusError ? { _debug_censusError: trends.censusError } : {})
        };
        if (trends.hudError)    console.warn('[demo/listings] HUD unavailable:',    trends.hudError);
        if (trends.censusError) console.warn('[demo/listings] Census unavailable:', trends.censusError);
      } catch (err) {
        console.warn('[demo/listings] market context unavailable:', err.message);
        marketContext = { zip: firstZip, hud: null, census: null, error: err.message };
      }
    }

    res.set('X-Data-Sources', sourcesPresent.join(',') || 'none');
    if (sourcesPresent.length === 0) {
      return res.status(502).json({
        success: false,
        error: 'Upstream data sources unavailable',
        errors: results.errors || {},
        message: 'Check /api/health/sources for current status.'
      });
    }

    // Merge source counts for the response
    const sourcesMap = { ...(results.sources || {}) };
    if (marketContext?.hud)    sourcesMap.hud = 1;
    if (marketContext?.census) sourcesMap.census = 1;

    res.json({
      success: true,
      ...results,
      sources: sourcesMap,
      marketContext
    });
  } catch (err) {
    console.error('[demo/listings] error:', err.message, err.stack);
    res.status(500).json({
      error: 'Demo request failed. Please try again.',
      detail: err.message,
      code: err.code || null
    });
  }
});

// ─── Public stats (data freshness trust row) ───────────
app.get('/api/stats', async (req, res) => {
  try {
    const [u, k, l] = await Promise.all([
      db.query('SELECT count(*)::int AS n FROM users').catch(() => ({ rows: [{ n: 0 }] })),
      db.query('SELECT count(*)::int AS n FROM api_keys WHERE status = $1', ['active']).catch(() => ({ rows: [{ n: 0 }] })),
      db.query('SELECT max(created_at) AS ts FROM listings_cache').catch(() => ({ rows: [{ ts: null }] }))
    ]);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      propertiesCatalogued: '140M+',
      activeKeys: k.rows[0].n,
      users: u.rows[0].n,
      lastRefresh: l.rows[0].ts || new Date().toISOString(),
      sources: ['RentCast', 'HUD', 'US Census ACS'],
      note: 'Live listings flow from RentCast in real time. HUD FMR and Census ACS are refreshed per query (no stale caching).'
    });
  } catch (err) {
    console.error('[stats] error:', err.message);
    res.status(500).json({ error: 'Could not load stats' });
  }
});

// ─── Newsletter signup ──────────────────────────────────
app.post('/api/subscribe', async (req, res) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    const source = String(req.body?.source || 'homepage').slice(0, 32);
    if (!/.+@.+\..+/.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    const ins = await db.query(
      `INSERT INTO newsletter_subscribers (email, source, ip)
         VALUES ($1, $2, $3::inet)
       ON CONFLICT (email) DO UPDATE SET source = COALESCE(newsletter_subscribers.source, EXCLUDED.source)
       RETURNING (xmax = 0) AS is_new`,
      [email, source, req.ip]
    );
    // Send a confirmation email only on first subscription (not on re-subscribes)
    if (ins.rows[0]?.is_new) {
      const { sendSubscribeConfirmation } = require('./email');
      sendSubscribeConfirmation({ to: email }).catch((err) =>
        console.warn('[subscribe] confirmation email failed:', err.message)
      );
    }
    res.json({ success: true, message: 'Subscribed. Check your inbox for a welcome note.' });
  } catch (err) {
    console.error('[subscribe] error:', err.message);
    res.status(500).json({ error: 'Could not subscribe. Try again later.' });
  }
});

// ─── Enterprise demo request ────────────────────────────
app.post('/api/demo-request', async (req, res) => {
  try {
    const b = req.body || {};
    const email = String(b.email || '').toLowerCase().trim();
    if (!/.+@.+\..+/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
    const { send, sendDemoRequestConfirmation } = require('./email');
    await db.query(
      `INSERT INTO demo_requests (email, company, use_case, volume, notes, ip)
         VALUES ($1, $2, $3, $4, $5, $6::inet)`,
      [email, b.company || null, b.useCase || null, b.volume || null, b.notes || null, req.ip]
    );
    // Notify sales
    send({
      to: 'sales@groundworklabs.io',
      subject: `[RentVolt] Demo request from ${email}`,
      html: `<p>New enterprise demo request:</p>
        <ul>
          <li><b>Email:</b> ${email}</li>
          <li><b>Company:</b> ${(b.company || '—').replace(/[<>]/g, '')}</li>
          <li><b>Use case:</b> ${(b.useCase || '—').replace(/[<>]/g, '')}</li>
          <li><b>Volume:</b> ${(b.volume || '—').replace(/[<>]/g, '')}</li>
          <li><b>Notes:</b> ${(b.notes || '—').replace(/[<>]/g, '')}</li>
        </ul>`
    }).catch((err) => console.warn('[demo-request] sales email failed:', err.message));
    // Confirm to the requester
    sendDemoRequestConfirmation({ to: email, company: b.company || '' }).catch((err) =>
      console.warn('[demo-request] confirmation email failed:', err.message)
    );
    res.json({ success: true, message: 'Thanks — we sent you a confirmation email, and a human will reply within one business day.' });
  } catch (err) {
    console.error('[demo-request] error:', err.message);
    res.status(500).json({ error: 'Could not submit request' });
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

// ─── Auth routes (magic-link dashboard auth) ────────────
app.use('/api', authRoutes);

// ─── API key verify + terms acceptance endpoints ────────
app.use('/api', (req, res, next) => {
  const publicPaths = [
    '/stripe/checkout', '/stripe/plans', '/stripe/webhook', '/stripe/session',
    '/feedback', '/privacy-request', '/keys/free',
    '/auth/request-link', '/auth/consume-link', '/auth/signout',
    '/me', '/health/sources', '/stats', '/subscribe', '/demo-request'
  ];
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

// ─── Boot-time migration safety net ─────────────────────
// Ensures schema tables exist even if the separate `npm run migrate`
// step didn't run (e.g. Render build env lacks DATABASE_URL).
// Idempotent — the migration runner is gated on schema_migrations.
async function ensureSchema() {
  if (!process.env.DATABASE_URL) {
    console.warn('[boot] DATABASE_URL missing — skipping schema ensure');
    return;
  }
  try {
    const fs = require('fs');
    const p = require('path');
    const MIG = p.join(__dirname, '..', 'migrations');
    await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const { rows: applied } = await db.query('SELECT version FROM schema_migrations');
    const have = new Set(applied.map((r) => r.version));
    const files = fs.readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      const v = f.replace(/\.sql$/, '');
      if (have.has(v)) continue;
      console.log(`[boot] applying migration ${v}…`);
      const sql = fs.readFileSync(p.join(MIG, f), 'utf8');
      await db.query('BEGIN');
      try {
        await db.query(sql);
        await db.query('COMMIT');
        console.log(`[boot] ✓ ${v}`);
      } catch (err) {
        await db.query('ROLLBACK').catch(() => {});
        console.error(`[boot] ✗ ${v}:`, err.message);
        throw err;
      }
    }
  } catch (err) {
    console.error('[boot] schema ensure failed:', err.message);
    // Do not crash the process — API can still serve static routes while ops fix the DB.
  }
}

// ─── Start (only when run directly, not when imported for tests) ─
if (require.main === module) {
  const server = app.listen(PORT, async () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║   RentVolt API  v2.0.0                        ║
║   © 2026 Groundwork Labs LLC                  ║
║   ${COMPANY.address.padEnd(43)}║
║   Port ${String(PORT).padEnd(6)} │ ${(process.env.NODE_ENV || 'development').padEnd(22)}║
╚═══════════════════════════════════════════════╝
  `);
    await ensureSchema();
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
