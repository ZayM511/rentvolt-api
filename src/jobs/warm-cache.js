// Proactive cache warming for top cities.
// Reduces cold-start latency on popular demo queries and smooths RentCast
// billing across the day. Runs once at boot, then every 6h.
// Top 20 US rental markets by demo-query volume. Down-sized from 50 to fit
// RentCast's Foundation plan (1,000 calls/mo): with 48h free-tier TTL,
// 20 cities × ~15 refreshes/mo ≈ 300 warm-cache RentCast calls/mo, leaving
// ~700 calls/mo for demo + paid-user traffic.
const TOP_CITIES = [
  ['oakland', 'ca'], ['san-francisco', 'ca'], ['san-jose', 'ca'],
  ['los-angeles', 'ca'], ['san-diego', 'ca'], ['sacramento', 'ca'],
  ['seattle', 'wa'], ['portland', 'or'],
  ['austin', 'tx'], ['dallas', 'tx'], ['houston', 'tx'],
  ['denver', 'co'], ['phoenix', 'az'], ['las-vegas', 'nv'],
  ['chicago', 'il'],
  ['new-york', 'ny'], ['boston', 'ma'], ['washington', 'dc'],
  ['miami', 'fl'], ['atlanta', 'ga']
];
const WARM_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const BATCH_SIZE = 3; // concurrent RentCast calls
const BATCH_DELAY_MS = 2000; // pause between batches so we don't burst

async function warmOnce() {
  if (!process.env.RENTCAST_API_KEY) {
    console.log('[warm-cache] skipping — RENTCAST_API_KEY not set');
    return { skipped: true };
  }
  const { fetchListings } = require('../data');
  const startedAt = Date.now();
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < TOP_CITIES.length; i += BATCH_SIZE) {
    const batch = TOP_CITIES.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(([city, state]) =>
        fetchListings(city, state, { limit: 50, plan: 'free' /* long TTL for warmups */ })
      )
    );
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') ok++; else {
        fail++;
        console.warn(`[warm-cache] failed for ${batch[idx].join(',')}:`, r.reason?.message);
      }
    });
    if (i + BATCH_SIZE < TOP_CITIES.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }
  console.log(`[warm-cache] done (${ok} ok, ${fail} fail, ${Math.round((Date.now() - startedAt) / 1000)}s)`);
  return { ok, fail, durationMs: Date.now() - startedAt };
}

function start() {
  // Delay initial warmup 45s past boot so /health comes up first and the
  // migration has completed.
  setTimeout(() => {
    warmOnce().catch((err) => console.error('[warm-cache] initial:', err.message));
    setInterval(() => {
      warmOnce().catch((err) => console.error('[warm-cache] cycle:', err.message));
    }, WARM_INTERVAL_MS);
  }, 45 * 1000);
}

module.exports = { start, warmOnce, TOP_CITIES };
