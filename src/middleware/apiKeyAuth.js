const API_KEYS = {
  // Free tier keys for testing
  'sk_test_free_001': { plan: 'free', monthlyRequests: 100 },
  'sk_test_basic_002': { plan: 'basic', monthlyRequests: 1000 },
  'sk_test_pro_003': { plan: 'pro', monthlyRequests: 10000 }
};

const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required. Include x-api-key header.' });
  }
  
  const keyData = API_KEYS[apiKey];
  if (!keyData) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  req.apiKey = keyData;
  next();
};

module.exports = apiKeyAuth;
