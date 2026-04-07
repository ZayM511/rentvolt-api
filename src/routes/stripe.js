const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// RentVolt Plans
const PLANS = {
  growth: {
    priceId: 'price_1TJL7JK6Cynlh5jwmqOxriKO',
    name: 'RentVolt Growth',
    monthlyRequests: 1000,
    price: 1900
  },
  scale: {
    priceId: 'price_1TJL7oK6Cynlh5jwlCq47L5v',
    name: 'RentVolt Scale',
    monthlyRequests: 5000,
    price: 4900
  },
  enterprise: {
    priceId: 'price_1TJWZqK6Cynlh5jwzfSBOov1',
    name: 'RentVolt Enterprise',
    monthlyRequests: 25000,
    price: 14900
  }
};

// List available plans
router.get('/plans', (req, res) => {
  const plans = Object.entries(PLANS).map(([key, plan]) => ({
    id: key,
    name: plan.name,
    price: `$${(plan.price / 100).toFixed(0)}/mo`,
    monthlyRequests: plan.monthlyRequests
  }));
  res.json({
    free: { name: 'RentVolt Starter', price: 'Free', monthlyRequests: 50 },
    paid: plans
  });
});

// Create checkout session
router.post('/checkout', async (req, res) => {
  try {
    const { plan } = req.body;

    const selectedPlan = PLANS[plan];
    if (!selectedPlan) {
      return res.status(400).json({
        error: 'Invalid plan',
        validPlans: Object.keys(PLANS),
        hint: 'GET /api/stripe/plans to see all options'
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: selectedPlan.priceId,
        quantity: 1
      }],
      mode: 'subscription',
      success_url: `${process.env.BASE_URL || 'http://localhost:3000'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL || 'http://localhost:3000'}/cancel`,
      metadata: {
        product: 'rentvolt',
        plan: plan,
        monthlyRequests: selectedPlan.monthlyRequests.toString()
      }
    });

    res.json({
      sessionId: session.id,
      url: session.url,
      plan: {
        name: selectedPlan.name,
        price: `$${(selectedPlan.price / 100).toFixed(0)}/mo`,
        monthlyRequests: selectedPlan.monthlyRequests
      }
    });
  } catch (error) {
    console.error('[STRIPE] Checkout error:', error.message);
    res.status(500).json({ error: 'Checkout failed', message: error.message });
  }
});

// Manage subscription (cancel/update)
router.post('/manage', async (req, res) => {
  try {
    const { customerId } = req.body;
    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.BASE_URL || 'http://localhost:3000'}/`
    });

    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook for subscription events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  try {
    let event;

    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log(`[STRIPE] ✅ New subscription: ${session.metadata?.plan} plan`);
        // TODO: Provision API key for customer
        // generateKey(session.metadata?.plan || 'growth');
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        console.log(`[STRIPE] 🔄 Subscription updated: ${sub.id} → ${sub.status}`);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        console.log(`[STRIPE] ❌ Subscription cancelled: ${sub.id}`);
        // TODO: Downgrade to free tier
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.log(`[STRIPE] ⚠️ Payment failed: ${invoice.customer}`);
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[STRIPE] Webhook error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
