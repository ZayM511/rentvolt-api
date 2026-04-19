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
  { name: 'Terms',                 path: '/legal/TermsOfService',     expect: 200 },
  { name: 'Privacy',               path: '/legal/PrivacyPolicy',      expect: 200 },
  { name: 'Scrape w/o API key',    path: '/api/scrape/listings',      expect: 401, method: 'POST' },
  { name: 'Stripe unauth checkout',path: '/api/stripe/checkout',      expect: [400, 401, 403], method: 'POST' },
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
