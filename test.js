const { scrapeAll } = require('./src/scrapers');

async function test() {
  console.log('Testing scraper...');
  const results = await scrapeAll('oakland', 'ca');
  console.log('Found:', results.total, 'listings');
  console.log('Sources:', results.sources);
}

test().catch(console.error);
