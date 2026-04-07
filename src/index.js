require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const apiKeyAuth = require('./middleware/apiKeyAuth');
const termsAcceptance = require('./middleware/termsAcceptance');
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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // Limit each IP to 100 requests per windowMs
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

// API Routes
app.use('/api/stripe', stripeRoutes);
app.use('/api/scrape', scrapeRoutes);

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
    legal: '/legal',
    health: '/health'
  });
});

app.listen(PORT, () => {
  console.log(`Real Estate Scraper API running on port ${PORT}`);
  console.log(`Company: Groundwork Labs LLC (California)`);
});

module.exports = app;
