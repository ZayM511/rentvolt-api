#!/usr/bin/env node
/**
 * Production smoke test.
 * Usage: BASE_URL=https://your-domain node scripts/smoke-test.js
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';

const checks = [
  { name: 'Health endpoint',       path: '/health',                   expect: 200 },
  { name: 'Landing page',          path: '/',                         expect: 200 },
  { name: 'Pricing page',          path: '/pricing',                  expect: 200 },
  { name: 'Dashboard page',        path: '/dashboard',                expect: 200 },
  { name: 'API docs',              path: '/api-docs',                 expect: [200, 301, 302] },
  { name: 'robots.txt',            path: '/robots.txt',               expect: 200 },
  { name: 'sitemap.xml',           path: '/sitemap.xml',              expect: 200 },
  { name: 'Terms',                 path: '/legal/tos',                expect: 200 },
  { name: 'Privacy',               path: '/legal/privacy',            expect: 200 },
  { name: 'OG image',              path: '/og.png',                   expect: 200 },
  { name: 'Scrape w/o API key',    path: '/api/scrape/listings',      expect: 401, method: 'POST' },
  { name: 'Stripe unauth checkout',path: '/api/stripe/checkout',      expect: [400, 401, 403], method: 'POST' },
  { name: 'Auth request-link (no body)', path: '/api/auth/request-link', expect: 400, method: 'POST' },
  { name: 'Consume-link bad token',path: '/api/auth/consume-link?token=deadbeef', expect: 400 },
  { name: '/api/me no session',    path: '/api/me',                   expect: 401 },
  { name: 'Upstream sources health', path: '/api/health/sources',     expect: [200, 503] },
  { name: 'Demo endpoint Oakland', path: '/demo/listings?city=oakland&state=ca', expect: [200, 429, 502] },
  { name: 'Book-a-demo page',      path: '/demo',                     expect: 200 },
  { name: 'API versioning doc',    path: '/legal/api-versioning',     expect: 200 },
  { name: 'Changelog',             path: '/changelog',                expect: 200 },
  { name: '/api/stats',            path: '/api/stats',                expect: 200 },
  { name: 'Subscribe bad email',   path: '/api/subscribe',            expect: 400, method: 'POST' },
  { name: 'Demo request bad body', path: '/api/demo-request',         expect: 400, method: 'POST' },
];

(async () => {
  let pass = 0, fail = 0;
  for (const c of checks) {
    try {
      const res = await fetch(`${BASE}${c.path}`, { method: c.method || 'GET' });
      const ok = Array.isArray(c.expect) ? c.expect.includes(res.status) : res.status === c.expect;
      console.log(`${ok ? '✓' : '✗'} ${c.name.padEnd(28)} [${res.status}] ${c.path}`);
      ok ? pass++ : fail++;
    } catch (e) {
      console.log(`✗ ${c.name.padEnd(28)} [ERROR] ${e.message}`);
      fail++;
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
