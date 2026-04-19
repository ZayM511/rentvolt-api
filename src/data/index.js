const { fetchRentalListings } = require('./rentcast');
const { summarizeFmr, fetchFmrByZip } = require('./hud');
const { fetchAcsByZip } = require('./census');
const { query } = require('../db');

// Per-plan cache TTL (seconds). Longer TTL = fewer RentCast calls = better
// unit economics. Free-tier users don't need real-time data; enterprise
// customers usually do.
const CACHE_TTL_BY_PLAN = {
  free:       24 * 60 * 60, // 24h
  growth:     12 * 60 * 60, // 12h
  scale:       6 * 60 * 60, // 6h
  enterprise:  3 * 60 * 60  // 3h
};
const DEFAULT_CACHE_TTL = 12 * 60 * 60;
const ttlFor = (plan) => CACHE_TTL_BY_PLAN[plan] || DEFAULT_CACHE_TTL;

const cacheKey = (city, state, filters) => {
  const norm = {
    city: String(city || '').toLowerCase().trim(),
    state: String(state || '').toLowerCase().trim(),
    maxPrice: filters?.maxPrice ?? null,
    minBeds: filters?.minBeds ?? null,
    maxBeds: filters?.maxBeds ?? null,
    limit: filters?.limit ?? null
  };
  return `listings:${JSON.stringify(norm)}`;
};

const getCached = async (key) => {
  try {
    const { rows } = await query(
      'SELECT payload FROM listings_cache WHERE cache_key = $1 AND expires_at > now()',
      [key]
    );
    return rows[0]?.payload || null;
  } catch {
    return null; // DB unavailable — proceed without cache
  }
};

const setCached = async (key, payload, ttlSeconds) => {
  try {
    await query(
      `INSERT INTO listings_cache (cache_key, payload, expires_at)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval)
       ON CONFLICT (cache_key) DO UPDATE SET payload = EXCLUDED.payload, expires_at = EXCLUDED.expires_at`,
      [key, payload, String(ttlSeconds)]
    );
  } catch (err) {
    console.warn('[data] cache write failed:', err.message);
  }
};

const applyFilters = (listings, filters = {}) => {
  let out = listings;
  if (filters.maxPrice != null) out = out.filter((l) => l.price != null && l.price <= filters.maxPrice);
  if (filters.minBeds != null) {
    out = out.filter((l) => {
      const beds = parseInt(String(l.beds).replace(/[^0-9]/g, ''), 10);
      return Number.isFinite(beds) && beds >= filters.minBeds;
    });
  }
  if (filters.maxBeds != null) {
    out = out.filter((l) => {
      const beds = parseInt(String(l.beds).replace(/[^0-9]/g, ''), 10);
      return Number.isFinite(beds) && beds <= filters.maxBeds;
    });
  }
  return out;
};

const sortListings = (listings, { sortBy = 'price', sortOrder = 'asc' } = {}) => {
  const mul = sortOrder === 'desc' ? -1 : 1;
  return [...listings].sort((a, b) => {
    if (sortBy === 'price') return ((a.price ?? Infinity) - (b.price ?? Infinity)) * mul;
    return 0;
  });
};

const dedupe = (listings) => {
  const seen = new Map();
  for (const l of listings) {
    const key = l.address?.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key) continue;
    const prev = seen.get(key);
    if (!prev || (l.price ?? Infinity) < (prev.price ?? Infinity)) seen.set(key, l);
  }
  return [...seen.values()];
};

const fetchListings = async (city, state, options = {}) => {
  const key = cacheKey(city, state, options);
  const plan = options.plan || null;
  const cached = await getCached(key);
  if (cached) {
    // Fire-and-forget upstream-call log for cache-hit accounting
    try {
      const { logUpstreamCall } = require('./cost-tracker');
      logUpstreamCall({ source: 'rentcast', endpoint: 'listings/rental/long-term', plan, cacheHit: true, costCents: 0 });
    } catch {}
    return { ...cached, cached: true };
  }

  let listings = [];
  const sources = { rentcast: 0 };
  const errors = {};
  const upstreamStart = Date.now();

  try {
    listings = await fetchRentalListings(city, state, options);
    sources.rentcast = listings.length;
    try {
      const { logUpstreamCall } = require('./cost-tracker');
      logUpstreamCall({
        source: 'rentcast',
        endpoint: 'listings/rental/long-term',
        plan, cacheHit: false,
        durationMs: Date.now() - upstreamStart
      });
    } catch {}
  } catch (err) {
    console.error('[data] rentcast fetch failed:', err.message);
    errors.rentcast = err.message;
  }

  const filtered = applyFilters(listings, options);
  const deduped = dedupe(filtered);
  const sorted = sortListings(deduped, options);
  const limited = options.limit ? sorted.slice(0, options.limit) : sorted;

  const payload = {
    listings: limited,
    total: limited.length,
    sources,
    ...(Object.keys(errors).length > 0 && { errors }),
    query: { city, state },
    fetchedAt: new Date().toISOString()
  };

  if (limited.length > 0) await setCached(key, payload, ttlFor(plan));
  return payload;
};

const fetchMarketTrends = async (zip, state) => {
  const out = { zip, sources: [] };
  try {
    const acs = await fetchAcsByZip(zip);
    if (acs) {
      out.census = acs;
      out.sources.push('census');
    }
  } catch (err) {
    out.censusError = err.message;
  }
  if (state) {
    try {
      const fmr = await fetchFmrByZip(zip, state);
      out.hud = summarizeFmr(fmr);
      out.sources.push('hud');
    } catch (err) {
      out.hudError = err.message;
    }
  }
  return out;
};

const fetchBriefing = async (zip, state) => {
  const trends = await fetchMarketTrends(zip, state);
  const c = trends.census || {};
  const h = trends.hud?.fmr || {};
  const lines = [];
  if (c.medianGrossRent) lines.push(`Median gross rent in ZIP ${zip} is $${c.medianGrossRent}/mo (Census ACS).`);
  if (h.twoBr) lines.push(`HUD Fair Market Rent for a 2-bedroom is $${h.twoBr}/mo.`);
  if (c.vacancyRate != null) lines.push(`Rental vacancy rate is ${c.vacancyRate}%.`);
  if (c.medianHouseholdIncome) lines.push(`Median household income is $${c.medianHouseholdIncome.toLocaleString()}.`);
  return {
    zip,
    briefing: lines.join(' ') || `No data available for ZIP ${zip}.`,
    trends
  };
};

module.exports = { fetchListings, fetchMarketTrends, fetchBriefing };
