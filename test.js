const { scrapeAll } = require('./src/scrapers');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const assert = (condition, msg) => { if (!condition) throw new Error(msg); };

test('scrapeAll returns listings array', async () => {
  const result = await scrapeAll('oakland', 'ca');
  assert(Array.isArray(result.listings), 'listings should be an array');
  assert(typeof result.total === 'number', 'total should be a number');
  assert(result.scrapedAt, 'should have scrapedAt timestamp');
  assert(result.query.city === 'oakland', 'query.city should be oakland');
});

test('scrapeAll respects maxPrice filter', async () => {
  const result = await scrapeAll('oakland', 'ca', { maxPrice: 2000 });
  for (const listing of result.listings) {
    assert(listing.price <= 2000, `Price ${listing.price} exceeds maxPrice 2000`);
  }
});

test('scrapeAll respects source filter', async () => {
  const result = await scrapeAll('oakland', 'ca', { sources: ['zillow'] });
  assert(result.sources.zillow !== undefined, 'should have zillow source');
  assert(Object.keys(result.sources).length === 1, 'should only have 1 source');
});

test('scrapeAll respects limit', async () => {
  const result = await scrapeAll('oakland', 'ca', { limit: 5 });
  assert(result.listings.length <= 5, `Expected <=5 listings, got ${result.listings.length}`);
});

test('scrapeAll handles invalid source gracefully', async () => {
  const result = await scrapeAll('oakland', 'ca', { sources: ['zillow', 'invalid_source'] });
  assert(result.listings.length >= 0, 'should return valid response');
});

(async () => {
  console.log('\n🧪 Running tests...\n');
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${name}: ${err.message}`);
      failed++;
    }
  }
  console.log(`\n📊 ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
