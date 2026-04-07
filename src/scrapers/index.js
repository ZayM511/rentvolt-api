const { scrapeRentals } = require('./rentals');
const { scrapeZillow } = require('./zillow');
const { scrapeApartments } = require('./apartments');
const { scrapeRentCafe } = require('./rentcafe');
const { scrapeHotpads } = require('./hotpads');
const { scrapeZumper } = require('./zumper');

const scrapers = {
  rentals: scrapeRentals,
  zillow: scrapeZillow,
  apartments: scrapeApartments,
  rentcafe: scrapeRentCafe,
  hotpads: scrapeHotpads,
  zumper: scrapeZumper
};

const scrapeAll = async (city, state, options = {}) => {
  const { sources = ['rentals', 'zillow', 'apartments', 'rentcafe', 'hotpads', 'zumper'], maxPrice, minBeds } = options;
  const results = [];
  const sourceCounts = {};
  
  for (const source of sources) {
    if (scrapers[source]) {
      try {
        const data = await scrapers[source](city, state);
        results.push(...data);
        sourceCounts[source] = data.length;
      } catch (error) {
        console.error(`Error scraping ${source}:`, error.message);
        sourceCounts[source] = 0;
      }
    }
  }
  
  // Apply filters
  let filtered = results;
  
  if (maxPrice) {
    filtered = filtered.filter(l => l.price <= maxPrice);
  }
  
  if (minBeds) {
    filtered = filtered.filter(l => {
      const beds = parseInt(l.beds?.replace(/[^0-9]/g, '')) || 0;
      return beds >= minBeds;
    });
  }
  
  return {
    listings: filtered,
    total: filtered.length,
    sources: sourceCounts,
    scrapedAt: new Date().toISOString()
  };
};

module.exports = { scrapeAll, scrapers };
