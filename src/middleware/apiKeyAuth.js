const crypto = require('crypto');
const { query, tx } = require('../db');

const PLANS = {
  free:       { monthlyRequests: 100 },
  growth:     { monthlyRequests: 1000 },
  scale:      { monthlyRequests: 5000 },
  enterprise: { monthlyRequests: 25000 }
};

const hashKey = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const prefix = (raw) => raw.slice(0, 16);

const generateKey = async ({ plan = 'free', userId, stripeSubscriptionId = null } = {}) => {
  if (!PLANS[plan]) throw new Error(`Unknown plan: ${plan}`);
  if (!userId) throw new Error('userId is required to provision a key');

  const keyPrefix = process.env.NODE_ENV === 'production' ? 'sk_live_' : 'sk_test_';
  const raw = keyPrefix + crypto.randomBytes(24).toString('hex');
  const { monthlyRequests } = PLANS[plan];

  await query(
    `INSERT INTO api_keys (user_id, key_hash, key_prefix, plan, monthly_requests, stripe_subscription_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, hashKey(raw), prefix(raw), plan, monthlyRequests, stripeSubscriptionId]
  );

  return raw;
};

const findOrCreateUser = async (email, stripeCustomerId = null) => {
  const res = await query(
    `INSERT INTO users (email, stripe_customer_id)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE
       SET stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, users.stripe_customer_id),
           updated_at = now()
     RETURNING *`,
    [email, stripeCustomerId]
  );
  return res.rows[0];
};

const apiKeyAuth = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    if (!apiKey) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Include your API key via x-api-key header or api_key query parameter.',
        docs: '/api-docs'
      });
    }

    const keyHash = hashKey(apiKey);

    // Atomic: reset counter if past due, increment usage, check quota — all in one transaction.
    const row = await tx(async (c) => {
      // Reset if we've rolled into a new calendar month
      await c.query(
        `UPDATE api_keys
         SET used = 0, reset_at = now()
         WHERE key_hash = $1
           AND date_trunc('month', reset_at) <> date_trunc('month', now())`,
        [keyHash]
      );

      // Atomically increment only if under quota and active
      const { rows } = await c.query(
        `UPDATE api_keys
         SET used = used + 1, last_used_at = now()
         WHERE key_hash = $1
           AND status = 'active'
           AND used < monthly_requests
         RETURNING id, user_id, plan, monthly_requests, used, status`,
        [keyHash]
      );
      if (rows[0]) return { ok: true, key: rows[0] };

      // Fell through — figure out why
      const { rows: existing } = await c.query(
        'SELECT id, plan, status, used, monthly_requests FROM api_keys WHERE key_hash = $1',
        [keyHash]
      );
      if (existing.length === 0) return { ok: false, reason: 'invalid' };
      const k = existing[0];
      if (k.status !== 'active') return { ok: false, reason: 'inactive', key: k };
      return { ok: false, reason: 'quota', key: k };
    });

    if (!row.ok) {
      if (row.reason === 'invalid') {
        return res.status(403).json({ error: 'Invalid API key' });
      }
      if (row.reason === 'inactive') {
        return res.status(403).json({
          error: 'API key is not active',
          status: row.key.status,
          message: row.key.status === 'past_due'
            ? 'Your subscription has a payment issue. Update payment at /dashboard.'
            : 'Your API key has been revoked or the subscription was cancelled.'
        });
      }
      if (row.reason === 'quota') {
        return res.status(429).json({
          error: 'Monthly request limit exceeded',
          limit: row.key.monthly_requests,
          used: row.key.used,
          plan: row.key.plan,
          upgrade: '/pricing'
        });
      }
    }

    req.apiKey = {
      id: row.key.id,
      userId: row.key.user_id,
      plan: row.key.plan,
      used: row.key.used,
      monthlyRequests: row.key.monthly_requests,
      remaining: row.key.monthly_requests - row.key.used
    };
    next();
  } catch (err) {
    console.error('[apiKeyAuth] error:', err.message);
    res.status(500).json({ error: 'Authentication service error' });
  }
};

module.exports = apiKeyAuth;
module.exports.generateKey = generateKey;
module.exports.findOrCreateUser = findOrCreateUser;
module.exports.hashKey = hashKey;
module.exports.PLANS = PLANS;
