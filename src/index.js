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
const scrapeRoutes = require('./routes/scrape');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    }
  }
}));
app.use(cors({ origin: '*' }));
app.use(express.json());

// Request logging
app.use(requestLogger);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Legal headers
app.use((req, res, next) => {
  res.setHeader('X-Company', 'Groundwork Labs LLC');
  res.setHeader('X-Jurisdiction', 'California, USA');
  res.setHeader('X-Terms-Version', '2026.04.07');
  next();
});

// API Key required for all /api routes
app.use('/api', apiKeyAuth);

// Terms acceptance required for paid plans
app.use('/api/stripe', termsAcceptance);
app.use('/api/scrape', termsAcceptance);

// API Routes with validation
app.use('/api/stripe', validate(schemas.stripeCheckout, 'body'), stripeRoutes);
app.use('/api/scrape', validate(schemas.scrapeListings, 'body'), scrapeRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    company: 'Groundwork Labs LLC',
    jurisdiction: 'California, USA',
    timestamp: new Date().toISOString() 
  });
});

// Legal info endpoint
app.get('/legal', (req, res) => {
  res.json({
    company: 'Groundwork Labs LLC',
    type: 'Limited Liability Company',
    jurisdiction: 'California, USA',
    termsOfService: 'https://github.com/ZayM511/realestate-scraper-api/blob/main/legal/TermsOfService.md',
    privacyPolicy: 'https://github.com/ZayM511/realestate-scraper-api/blob/main/legal/PrivacyPolicy.md',
    disclaimer: 'https://github.com/ZayM511/realestate-scraper-api/blob/main/legal/LegalDisclaimer.md'
  });
});

// API Key check
app.get('/api/verify', termsAcceptance, (req, res) => {
  res.json({ valid: true, plan: req.apiKey.plan });
});

// Root
app.get('/', (req, res) => {
  res.json({
    service: 'Real Estate Scraper API',
    company: 'Groundwork Labs LLC',
    version: '1.0.0',
    docs: '/api-docs',
    legal: '/legal',
    health: '/health'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║   Real Estate Scraper API                     ║
║   © 2026 Groundwork Labs LLC                  ║
║   California, USA                             ║
║   Running on port ${PORT}                        ║
╚═══════════════════════════════════════════════╝
  `);
});

module.exports = app;
