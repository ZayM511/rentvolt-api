const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Create checkout session
router.post('/checkout', async (req, res) => {
  try {
    const { plan } = req.body;
    
    const plans = {
      basic: { price: 999, name: 'Basic - 1,000 requests/month' },
      pro: { price: 2999, name: 'Pro - 10,000 requests/month' }
    };
    
    const selectedPlan = plans[plan];
    if (!selectedPlan) {
      return res.status(400).json({ error: 'Invalid plan' });
    }
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: selectedPlan.name },
          unit_amount: selectedPlan.price
        },
        quantity: 1
      }],
      mode: 'subscription',
      success_url: `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/cancel`
    });
    
    res.json({ sessionId: session.id, url: session.url });
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
      event = req.body;
    }
    
    switch (event.type) {
      case 'checkout.session.completed':
        // Grant API access
        console.log('Checkout completed:', event.data.object);
        break;
      case 'customer.subscription.deleted':
        // Revoke API access
        console.log('Subscription cancelled:', event.data.object);
        break;
    }
    
    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
