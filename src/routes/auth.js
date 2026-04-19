const express = require('express');
const crypto = require('crypto');
const Joi = require('joi');
const router = express.Router();
const { query } = require('../db');
const { findOrCreateUser } = require('../middleware/apiKeyAuth');
const { sendMagicLinkEmail } = require('../email');
const { issueCookie, clearCookie, requireSession } = require('../middleware/session');

const REQUEST_SCHEMA = Joi.object({
  email: Joi.string().email().max(254).required()
});

const THROTTLE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const THROTTLE_MAX = 3;
const LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes

// ─── POST /api/auth/request-link ────────────────────────
router.post('/auth/request-link', async (req, res) => {
  const { error, value } = REQUEST_SCHEMA.validate(req.body, { stripUnknown: true });
  if (error) {
    return res.status(400).json({ error: 'Validation failed', details: error.details.map((d) => d.message) });
  }
  const email = value.email.toLowerCase();

  try {
    const { rows: recent } = await query(
      `SELECT count(*)::int AS n FROM magic_links
       WHERE email = $1 AND created_at > now() - interval '10 minutes'`,
      [email]
    );
    if (recent[0].n >= THROTTLE_MAX) {
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Try again in 10 minutes. Previous links may still be valid — check your inbox and spam folder.'
      });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + LINK_TTL_MS);

    await query(
      `INSERT INTO magic_links (token, email, expires_at, ip)
       VALUES ($1, $2, $3, $4::inet)`,
      [rawToken, email, expiresAt.toISOString(), req.ip]
    );

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const link = `${baseUrl}/api/auth/consume-link?token=${rawToken}`;

    // Fire-and-forget; we've already committed the row.
    sendMagicLinkEmail({ to: email, link }).catch((err) =>
      console.error('[auth] magic-link email failed:', err.message)
    );

    res.json({
      success: true,
      message: 'Sign-in link sent. It expires in 15 minutes.'
    });
  } catch (err) {
    console.error('[auth/request-link] error:', err.message);
    res.status(500).json({ error: 'Could not send sign-in link' });
  }
});

// ─── GET /api/auth/consume-link?token=... ───────────────
router.get('/auth/consume-link', async (req, res) => {
  const token = String(req.query.token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).send(errorPage('Invalid sign-in link', 'The link is malformed. Request a new one from the dashboard.'));
  }

  try {
    const { rows } = await query(
      `UPDATE magic_links
       SET consumed_at = now()
       WHERE token = $1
         AND consumed_at IS NULL
         AND expires_at > now()
       RETURNING email`,
      [token]
    );
    if (rows.length === 0) {
      return res.status(410).send(errorPage('Link expired or already used', 'Request a fresh sign-in link from the dashboard. Links expire after 15 minutes and can only be used once.'));
    }

    const email = rows[0].email;
    const user = await findOrCreateUser(email);
    issueCookie(res, { userId: user.id, email: user.email });
    res.redirect(302, '/dashboard');
  } catch (err) {
    console.error('[auth/consume-link] error:', err.message);
    res.status(500).send(errorPage('Sign-in failed', 'Something went wrong. Please try again or contact support@groundworklabs.io.'));
  }
});

// ─── POST /api/auth/signout ─────────────────────────────
router.post('/auth/signout', (req, res) => {
  clearCookie(res);
  res.json({ success: true });
});

// ─── GET /api/me ─────────────────────────────────────────
router.get('/me', requireSession, async (req, res) => { // mounted at /api

  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.stripe_customer_id,
              ak.id AS key_id, ak.key_prefix, ak.plan, ak.monthly_requests, ak.used,
              ak.status, ak.reset_at
         FROM users u
    LEFT JOIN api_keys ak
           ON ak.user_id = u.id
          AND ak.status IN ('active','past_due')
        WHERE u.id = $1
     ORDER BY ak.created_at DESC NULLS LAST
        LIMIT 1`,
      [req.user.id]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'User not found' });

    res.json({
      email: row.email,
      stripeCustomerId: row.stripe_customer_id,
      key: row.key_id
        ? {
            prefix: row.key_prefix,
            plan: row.plan,
            status: row.status,
            used: row.used,
            monthlyRequests: row.monthly_requests,
            remaining: Math.max(0, row.monthly_requests - row.used),
            resetAt: row.reset_at
          }
        : null
    });
  } catch (err) {
    console.error('[auth/me] error:', err.message);
    res.status(500).json({ error: 'Could not load account' });
  }
});

// ─── POST /api/me/key/rotate ────────────────────────────
router.post('/me/key/rotate', requireSession, async (req, res) => {
  try {
    const { generateKey } = require('../middleware/apiKeyAuth');
    // Find current active key (preserve plan + Stripe sub link)
    const { rows } = await query(
      `SELECT id, plan, stripe_subscription_id
         FROM api_keys
        WHERE user_id = $1 AND status = 'active'
     ORDER BY created_at DESC
        LIMIT 1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No active API key to rotate' });
    const old = rows[0];

    const newRaw = await generateKey({
      plan: old.plan,
      userId: req.user.id,
      stripeSubscriptionId: old.stripe_subscription_id
    });
    await query(`UPDATE api_keys SET status = 'revoked' WHERE id = $1`, [old.id]);

    res.json({
      success: true,
      apiKey: newRaw,
      message: 'Key rotated. The previous key is revoked immediately. Save this new key — we cannot show it again.'
    });
  } catch (err) {
    console.error('[auth/rotate] error:', err.message);
    res.status(500).json({ error: 'Could not rotate key' });
  }
});

// ─── POST /api/me/stripe/manage ─────────────────────────
router.post('/me/stripe/manage', requireSession, async (req, res) => {
  try {
    const Stripe = require('stripe');
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
    const { rows } = await query(
      `SELECT stripe_customer_id FROM users WHERE id = $1`,
      [req.user.id]
    );
    const customerId = rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: 'No Stripe customer on file. Subscribe first via /pricing.' });
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[auth/stripe/manage] error:', err.message);
    res.status(500).json({ error: 'Could not open billing portal' });
  }
});

function errorPage(title, body) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} — RentVolt</title>
<style>body{font-family:-apple-system,Segoe UI,sans-serif;background:#0a0a1a;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
.card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:32px;max-width:480px}
h1{margin:0 0 12px;color:#00d4ff}p{margin:0 0 16px;color:rgba(255,255,255,0.78);line-height:1.6}
a{color:#00d4ff}</style></head><body><div class="card"><h1>${esc(title)}</h1><p>${esc(body)}</p><p><a href="/dashboard">← Back to dashboard</a></p></div></body></html>`;
}

module.exports = router;
