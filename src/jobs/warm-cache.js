// Proactive cache warming for top cities.
// Reduces cold-start latency on popular demo queries and smooths RentCast
// billing across the day. Runs once at boot, then every 6h.
// Top ~50 US rental markets by population + demand. Expanded from 30 so
// non-coastal demo queries hit warm cache instead of paying a cold-start.
const TOP_CITIES = [
  // West coast
  ['oakland', 'ca'], ['san-francisco', 'ca'], ['san-jose', 'ca'],
  ['los-angeles', 'ca'], ['san-diego', 'ca'], ['sacramento', 'ca'],
  ['long-beach', 'ca'], ['fresno', 'ca'], ['bakersfield', 'ca'],
  ['seattle', 'wa'], ['portland', 'or'], ['boise', 'id'],
  // Southwest / mountain
  ['austin', 'tx'], ['dallas', 'tx'], ['houston', 'tx'],
  ['san-antonio', 'tx'], ['fort-worth', 'tx'], ['el-paso', 'tx'],
  ['denver', 'co'], ['colorado-springs', 'co'],
  ['salt-lake-city', 'ut'], ['phoenix', 'az'], ['tucson', 'az'],
  ['las-vegas', 'nv'], ['albuquerque', 'nm'],
  // Midwest
  ['chicago', 'il'], ['minneapolis', 'mn'],
  ['columbus', 'oh'], ['cleveland', 'oh'], ['cincinnati', 'oh'],
  ['indianapolis', 'in'], ['milwaukee', 'wi'], ['detroit', 'mi'],
  ['kansas-city', 'mo'], ['st-louis', 'mo'],
  // Northeast
  ['new-york', 'ny'], ['boston', 'ma'], ['philadelphia', 'pa'],
  ['pittsburgh', 'pa'], ['washington', 'dc'], ['baltimore', 'md'],
  ['newark', 'nj'],
  // Southeast
  ['miami', 'fl'], ['tampa', 'fl'], ['orlando', 'fl'], ['jacksonville', 'fl'],
  ['atlanta', 'ga'], ['charlotte', 'nc'], ['raleigh', 'nc'],
  ['nashville', 'tn'], ['memphis', 'tn'], ['louisville', 'ky'],
  ['new-orleans', 'la']
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
