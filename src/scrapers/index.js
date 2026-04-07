const { scrapeRentals } = require('./rentals');
const { scrapeZillow } = require('./zillow');

const scrapeAll = async (city, state, options = {}) => {
  const { sources = ['rentals', 'zillow'], maxPrice, minBeds } = options;
  const results = [];
  
  if (sources.includes('rentals')) {
    const rentals = await scrapeRentals(city, state);
    results.push(...rentals);
  }
  
  if (sources.includes('zillow')) {
    const zillow = await scrapeZillow(city, state);
    results.push(...zillow);
  }
  
  // Apply filters
  let filtered = results;
  
  if (maxPrice) {
    filtered = filtered.filter(l => l.price <= maxPrice);
  }
  
  if (minBeds) {
    filtered = filtered.filter(l => parseInt(l.beds) >= minBeds);
  }
  
  return {
    listings: filtered,
    total: filtered.length,
    sources: results.reduce((acc, r) => {
      acc[r.source] = (acc[r.source] || 0) + 1;
      return acc;
    }, {}),
    scrapedAt: new Date().toISOString()
  };
};

module.exports = { scrapeAll };
