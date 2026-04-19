const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { query } = require('../db');
const { generateKey, findOrCreateUser, PLANS: KEY_PLANS } = require('../middleware/apiKeyAuth');
const { sendWelcomeEmail } = require('../email');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

// Plan → Stripe Price ID. Prefer env vars so test/live flips without code change.
const PLANS = {
  growth: {
    priceId: process.env.STRIPE_PRICE_GROWTH || 'price_1TJL7JK6Cynlh5jwmqOxriKO',
    name: 'RentVolt Growth',
    monthlyRequests: 1000,
    price: 1900
  },
  scale: {
    priceId: process.env.STRIPE_PRICE_SCALE || 'price_1TJL7oK6Cynlh5jwlCq47L5v',
    name: 'RentVolt Scale',
    monthlyRequests: 5000,
    price: 4900
  },
  enterprise: {
    priceId: process.env.STRIPE_PRICE_ENTERPRISE || 'price_1TJWZqK6Cynlh5jwzfSBOov1',
    name: 'RentVolt Business',
    monthlyRequests: 25000,
    price: 14900
  }
};

// ─── GET /api/stripe/plans ─────────────────────────────
router.get('/plans', (req, res) => {
  const paid = Object.entries(PLANS).map(([key, p]) => ({
    id: key,
    name: p.name,
    price: `$${(p.price / 100).toFixed(0)}/mo`,
    monthlyRequests: p.monthlyRequests
  }));
  res.json({
    free: { name: 'RentVolt Starter', price: 'Free', monthlyRequests: 100 },
    paid,
    disclosure: 'All paid plans auto-renew monthly at the listed price until you cancel. Cancel anytime at /dashboard or by emailing support@groundworklabs.io.'
  });
});

// ─── POST /api/stripe/checkout ─────────────────────────
router.post('/checkout', async (req, res) => {
  try {
    const { plan, email } = req.body || {};
    const selected = PLANS[plan];
    if (!selected) {
      return res.status(400).json({
        error: 'Invalid plan',
        validPlans: Object.keys(PLANS),
        hint: 'GET /api/stripe/plans to see all options'
      });
    }

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: selected.priceId, quantity: 1 }],
      customer_email: email || undefined,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      // NB: Stripe account is shared across Groundwork Labs products, so the
      // account-level ToS URL is generic. RentVolt-specific ToS acceptance
      // is captured by the submit message below + pricing-page disclosure.
      custom_text: {
        submit: {
          message: 'By subscribing, you agree to RentVolt\'s Terms of Service (rentvolt-api.onrender.com/legal/tos) and authorize RentVolt to automatically charge your card each month at the listed price until you cancel. Cancel anytime at /dashboard or via support@groundworklabs.io.'
        }
      },
      metadata: {
        product: 'rentvolt',
        plan,
        monthlyRequests: String(selected.monthlyRequests)
      },
      subscription_data: {
        metadata: { plan, source: 'rentvolt-web' }
      },
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel`
    });

    res.json({
      sessionId: session.id,
      url: session.url,
      plan: {
        name: selected.name,
        price: `$${(selected.price / 100).toFixed(0)}/mo`,
        monthlyRequests: selected.monthlyRequests
      }
    });
  } catch (error) {
    console.error('[stripe/checkout] error:', error.message);
    res.status(500).json({ error: 'Checkout failed', message: error.message });
  }
});

// ─── POST /api/stripe/manage ───────────────────────────
router.post('/manage', async (req, res) => {
  try {
    if (!req.apiKey) return res.status(401).json({ error: 'API key required' });
    const { rows } = await query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [req.apiKey.userId]
    );
    const customerId = rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: 'No Stripe customer on file' });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.BASE_URL || 'http://localhost:3000'}/dashboard`
    });
    res.json({ url: session.url });
  } catch (error) {
    console.error('[stripe/manage] error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/stripe/session/:id (post-checkout key reveal) ─
// Rate-limited, one-time key display on /success page.
router.get('/session/:id', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.id);
    if (!session || session.payment_status !== 'paid') {
      return res.status(404).json({ error: 'Session not found or not paid' });
    }
    const { rows } = await query(
      `SELECT ak.key_prefix, ak.plan, ak.monthly_requests, u.email
       FROM api_keys ak
       JOIN users u ON u.id = ak.user_id
       WHERE ak.stripe_subscription_id = $1`,
      [session.subscription]
    );
    const key = rows[0];
    if (!key) {
      return res.status(202).json({
        pending: true,
        message: 'Your key is being provisioned. Refresh in a moment, or check your email.'
      });
    }
    res.json({
      email: key.email,
      plan: key.plan,
      monthlyRequests: key.monthly_requests,
      apiKeyPrefix: key.key_prefix,
      message: 'A full API key has been emailed to you. Check your inbox (and spam folder).'
    });
  } catch (error) {
    console.error('[stripe/session] error:', error.message);
    res.status(500).json({ error: 'Could not retrieve session' });
  }
});

// ─── POST /api/stripe/webhook ──────────────────────────
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET not configured — rejecting webhook');
    return res.status(500).json({ error: 'Webhook signing not configured on server' });
  }
  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('[stripe/webhook] signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Idempotency: skip if we've already processed this event
  try {
    const ins = await query(
      `INSERT INTO webhook_events (stripe_event_id, event_type)
       VALUES ($1, $2)
       ON CONFLICT (stripe_event_id) DO NOTHING
       RETURNING stripe_event_id`,
      [event.id, event.type]
    );
    if (ins.rowCount === 0) {
      console.log(`[stripe/webhook] duplicate ${event.id} skipped`);
      return res.json({ received: true, duplicate: true });
    }
  } catch (err) {
    console.error('[stripe/webhook] idempotency check failed:', err.message);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutCompleted(session);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        await handleSubscriptionUpdated(sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await handleSubscriptionDeleted(sub);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await handlePaymentFailed(invoice);
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        await handlePaymentSucceeded(invoice);
        break;
      }
      default:
        // Acknowledged but not handled
        break;
    }
    await query(
      'UPDATE webhook_events SET processed_at = now() WHERE stripe_event_id = $1',
      [event.id]
    );
    res.json({ received: true });
  } catch (err) {
    console.error(`[stripe/webhook] handler error for ${event.type}:`, err.message);
    await query(
      'UPDATE webhook_events SET error = $2 WHERE stripe_event_id = $1',
      [event.id, err.message]
    ).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// ─── Webhook handlers ──────────────────────────────────

async function handleCheckoutCompleted(session) {
  const email = session.customer_details?.email || session.customer_email;
  const plan = session.metadata?.plan;
  const stripeCustomerId = session.customer;
  const stripeSubscriptionId = session.subscription;

  if (!email || !plan || !KEY_PLANS[plan]) {
    throw new Error(`checkout.session.completed missing email/plan or plan invalid: email=${email} plan=${plan}`);
  }

  const user = await findOrCreateUser(email, stripeCustomerId);
  const rawKey = await generateKey({
    plan,
    userId: user.id,
    stripeSubscriptionId
  });

  // Fire-and-forget welcome email
  sendWelcomeEmail({ to: email, plan, apiKey: rawKey }).catch((err) =>
    console.error('[email] welcome send failed:', err.message)
  );

  console.log(`[stripe] ✅ provisioned ${plan} key for ${email} (sub ${stripeSubscriptionId})`);
}

async function handleSubscriptionUpdated(sub) {
  const plan = sub.metadata?.plan;
  const newMonthlyRequests = plan && KEY_PLANS[plan]?.monthlyRequests;
  if (!plan || !newMonthlyRequests) return;

  await query(
    `UPDATE api_keys
     SET plan = $1,
         monthly_requests = $2,
         status = CASE WHEN $3 IN ('active','trialing') THEN 'active'
                       WHEN $3 = 'past_due' THEN 'past_due'
                       ELSE status END
     WHERE stripe_subscription_id = $4`,
    [plan, newMonthlyRequests, sub.status, sub.id]
  );
  console.log(`[stripe] 🔄 subscription ${sub.id} → ${plan} (${sub.status})`);
}

async function handleSubscriptionDeleted(sub) {
  await query(
    `UPDATE api_keys
     SET status = 'cancelled',
         plan = 'free',
         monthly_requests = 100
     WHERE stripe_subscription_id = $1`,
    [sub.id]
  );
  console.log(`[stripe] ❌ subscription ${sub.id} cancelled → downgraded to free`);
}

async function handlePaymentFailed(invoice) {
  if (!invoice.subscription) return;
  await query(
    `UPDATE api_keys SET status = 'past_due' WHERE stripe_subscription_id = $1`,
    [invoice.subscription]
  );
  console.log(`[stripe] ⚠️  payment failed for ${invoice.customer} (sub ${invoice.subscription})`);
}

async function handlePaymentSucceeded(invoice) {
  if (!invoice.subscription) return;
  await query(
    `UPDATE api_keys SET status = 'active' WHERE stripe_subscription_id = $1 AND status = 'past_due'`,
    [invoice.subscription]
  );
}

module.exports = router;
module.exports.PLANS = PLANS;
