// Lightweight smoke test. Runs without a DB — focuses on module loads and static routing.
// Full integration tests live in /tests and use jest + supertest.

const assert = require('assert');
const http = require('http');

const PORT = 3099;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'test';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder';

const app = require('./src/index');

const server = app.listen(PORT, async () => {
  try {
    const health = await get('/health');
    console.log(`[test] health → ${health.status}`);

    const legal = await get('/legal');
    assert.strictEqual(legal.status, 200, '/legal should return 200');
    assert.ok(legal.json.company, 'legal response should have company info');
    console.log('[test] legal: ok');

    const unknown = await get('/api/does-not-exist');
    assert.strictEqual(unknown.status, 401, 'unknown /api/* route should hit apiKeyAuth and 401 without key');
    console.log('[test] api auth required: ok');

    const checkout = await postJson('/api/stripe/checkout', { plan: 'not-a-real-plan' });
    assert.strictEqual(checkout.status, 400, 'invalid plan should 400');
    console.log('[test] checkout rejects invalid plan: ok');

    const webhookNoSig = await postJson('/api/stripe/webhook', { fake: true });
    assert.strictEqual(webhookNoSig.status, 400, 'webhook without stripe-signature header should 400');
    console.log('[test] webhook rejects unsigned events: ok');

    const plans = await get('/api/stripe/plans');
    assert.strictEqual(plans.status, 200, '/api/stripe/plans should be public');
    assert.ok(plans.json.paid, 'plans response should include paid tier list');
    assert.ok(plans.json.disclosure, 'plans should include CA ARL disclosure string');
    console.log('[test] stripe plans endpoint + ARL disclosure: ok');

    console.log('\n✓ All smoke tests passed.');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('[test] FAILED:', err && err.stack || err);
    server.close();
    process.exit(1);
  }
});

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}${path}`, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, json, body: data });
      });
    }).on('error', reject);
  });
}

function postJson(path, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch {}
          resolve({ status: res.statusCode, json, body: data });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
