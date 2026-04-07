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

const ALL_SOURCES = Object.keys(scrapers);

const scrapeAll = async (city, state, options = {}) => {
  const {
    sources = ALL_SOURCES,
    maxPrice,
    minBeds,
    maxBeds,
    sortBy = 'price',
    sortOrder = 'asc',
    limit
  } = options;

  const validSources = sources.filter(s => scrapers[s]);
  if (validSources.length === 0) {
    throw new Error(`No valid sources. Choose from: ${ALL_SOURCES.join(', ')}`);
  }

  // Scrape all sources in parallel for speed
  const settled = await Promise.allSettled(
    validSources.map(source => scrapers[source](city, state))
  );

  const results = [];
  const sourceCounts = {};
  const errors = {};

  settled.forEach((result, i) => {
    const source = validSources[i];
    if (result.status === 'fulfilled') {
      const data = result.value || [];
      results.push(...data);
      sourceCounts[source] = data.length;
    } else {
      console.error(`[SCRAPER] ${source} failed:`, result.reason?.message);
      sourceCounts[source] = 0;
      errors[source] = result.reason?.message || 'Unknown error';
    }
  });

  // Apply filters
  let filtered = results;

  if (maxPrice != null) filtered = filtered.filter(l => l.price <= maxPrice);
  if (minBeds != null) {
    filtered = filtered.filter(l => {
      const beds = parseInt(String(l.beds).replace(/[^0-9]/g, '')) || 0;
      return beds >= minBeds;
    });
  }
  if (maxBeds != null) {
    filtered = filtered.filter(l => {
      const beds = parseInt(String(l.beds).replace(/[^0-9]/g, '')) || 0;
      return beds <= maxBeds;
    });
  }

  // Deduplicate by address (keep cheapest)
  const seen = new Map();
  for (const listing of filtered) {
    const key = listing.address?.toLowerCase().replace(/\s+/g, ' ').trim();
    if (key && (!seen.has(key) || listing.price < seen.get(key).price)) {
      seen.set(key, listing);
    }
  }
  filtered = [...seen.values()];

  // Sort
  filtered.sort((a, b) => {
    const mul = sortOrder === 'desc' ? -1 : 1;
    if (sortBy === 'price') return (a.price - b.price) * mul;
    return 0;
  });

  // Limit
  if (limit && limit > 0) filtered = filtered.slice(0, limit);

  return {
    listings: filtered,
    total: filtered.length,
    sources: sourceCounts,
    ...(Object.keys(errors).length > 0 && { errors }),
    query: { city, state },
    scrapedAt: new Date().toISOString()
  };
};

module.exports = { scrapeAll, scrapers, ALL_SOURCES };
