const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Default test keys (override with KEYS_FILE env var for production)
const DEFAULT_KEYS = {
  'sk_test_free_001': { plan: 'free', monthlyRequests: 100, used: 0, resetAt: null },
  'sk_test_basic_002': { plan: 'basic', monthlyRequests: 1000, used: 0, resetAt: null },
  'sk_test_pro_003': { plan: 'pro', monthlyRequests: 10000, used: 0, resetAt: null }
};

// In-memory store with periodic file persistence
let apiKeys = { ...DEFAULT_KEYS };
const KEYS_FILE = process.env.KEYS_FILE || path.join(__dirname, '../../data/api-keys.json');

// Load keys from file if available
const loadKeys = () => {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      const data = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
      apiKeys = { ...DEFAULT_KEYS, ...data };
    }
  } catch (err) {
    console.warn('[AUTH] Could not load keys file, using defaults:', err.message);
  }
};

const saveKeys = () => {
  try {
    const dir = path.dirname(KEYS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(KEYS_FILE, JSON.stringify(apiKeys, null, 2));
  } catch (err) {
    console.warn('[AUTH] Could not save keys file:', err.message);
  }
};

// Reset monthly counters if needed
const checkMonthlyReset = (keyData) => {
  const now = new Date();
  const resetDate = keyData.resetAt ? new Date(keyData.resetAt) : null;
  if (!resetDate || now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
    keyData.used = 0;
    keyData.resetAt = now.toISOString();
  }
};

// Generate a new API key
const generateKey = (plan = 'free') => {
  const plans = {
    free: { monthlyRequests: 100 },
    basic: { monthlyRequests: 1000 },
    pro: { monthlyRequests: 10000 }
  };
  const prefix = process.env.NODE_ENV === 'production' ? 'sk_live_' : 'sk_test_';
  const key = prefix + crypto.randomBytes(24).toString('hex');
  apiKeys[key] = { plan, ...plans[plan], used: 0, resetAt: new Date().toISOString() };
  saveKeys();
  return key;
};

// Initialize
loadKeys();

const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Include your API key via x-api-key header or api_key query parameter.',
      docs: '/api-docs'
    });
  }

  const keyData = apiKeys[apiKey];
  if (!keyData) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  // Check and reset monthly usage
  checkMonthlyReset(keyData);

  // Track usage
  keyData.used = (keyData.used || 0) + 1;

  // Enforce monthly limits
  if (keyData.used > keyData.monthlyRequests) {
    return res.status(429).json({
      error: 'Monthly request limit exceeded',
      limit: keyData.monthlyRequests,
      used: keyData.used,
      plan: keyData.plan,
      upgrade: 'POST /api/stripe/checkout'
    });
  }

  // Persist periodically (every 50 requests)
  if (keyData.used % 50 === 0) saveKeys();

  req.apiKey = { ...keyData, remaining: keyData.monthlyRequests - keyData.used };
  next();
};

module.exports = apiKeyAuth;
module.exports.generateKey = generateKey;
module.exports.apiKeys = apiKeys;
