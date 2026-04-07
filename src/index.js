require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const apiKeyAuth = require('./middleware/apiKeyAuth');
const stripeRoutes = require('./routes/stripe');
const scrapeRoutes = require('./routes/scrape');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

// API Routes
app.use('/api/stripe', apiKeyAuth, stripeRoutes);
app.use('/api/scrape', apiKeyAuth, scrapeRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Key check
app.get('/api/verify', apiKeyAuth, (req, res) => {
  res.json({ valid: true, plan: req.apiKey.plan });
});

app.listen(PORT, () => {
  console.log(`Real Estate Scraper API running on port ${PORT}`);
});

module.exports = app;
