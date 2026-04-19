// Upstream-call cost tracking.
// Logs every call to RentCast/HUD/Census so we can reconcile monthly spend
// and monitor unit economics per tier.
const { query } = require('../db');

// Cost-per-call in USD cents. Override via env var without a redeploy.
const COST_CENTS = {
  rentcast: parseInt(process.env.RENTCAST_COST_CENTS_PER_CALL || '5', 10), // default 5¢
  hud:      parseInt(process.env.HUD_COST_CENTS_PER_CALL      || '0', 10), // HUD is free
  census:   parseInt(process.env.CENSUS_COST_CENTS_PER_CALL   || '0', 10)  // Census is free
};

/**
 * Record one upstream API call. Fire-and-forget; errors are swallowed with a warning.
 * @param {Object} p
 * @param {'rentcast'|'hud'|'census'} p.source
 * @param {string}   p.endpoint       - short label, e.g. "listings/rental/long-term"
 * @param {string?}  p.plan           - 'free'|'growth'|'scale'|'enterprise' or null for demo
 * @param {string?}  p.apiKeyId       - UUID of api_keys row (for paid users)
 * @param {boolean?} p.cacheHit       - true if served from cache (free)
 * @param {number?}  p.durationMs
 * @param {number?}  p.costCentsOverride - skip per-source table (e.g. for cache hits → 0)
 */
function logUpstreamCall({ source, endpoint, plan = null, apiKeyId = null, cacheHit = false, durationMs = null, costCentsOverride = null }) {
  const cost = cacheHit ? 0 : (costCentsOverride != null ? costCentsOverride : (COST_CENTS[source] || 0));
  // DB insert is fire-and-forget; we never want this to break a user request.
  query(
    `INSERT INTO upstream_calls (source, endpoint, api_key_id, plan, cost_cents, cache_hit, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [source, endpoint || null, apiKeyId, plan, cost, !!cacheHit, durationMs]
  ).catch((err) => {
    // Table might not exist yet on first boot (before migration); log once.
    if (!logUpstreamCall._warned) {
      console.warn('[cost-tracker] insert failed:', err.message);
      logUpstreamCall._warned = true;
    }
  });
}

/**
 * Monthly summary. `month` is 'YYYY-MM'; defaults to current UTC month.
 * Returns { total_cost_cents, by_source, by_plan, total_calls, cache_hits, cache_hit_rate }.
 */
async function monthlySummary(month) {
  const when = month ? `to_char(created_at, 'YYYY-MM') = $1` : `date_trunc('month', created_at) = date_trunc('month', now())`;
  const params = month ? [month] : [];

  const [totals, bySource, byPlan] = await Promise.all([
    query(
      `SELECT count(*)::int AS total_calls,
              coalesce(sum(cost_cents),0)::int AS total_cents,
              count(*) FILTER (WHERE cache_hit)::int AS cache_hits
       FROM upstream_calls WHERE ${when}`,
      params
    ),
    query(
      `SELECT source, count(*)::int AS calls, coalesce(sum(cost_cents),0)::int AS cents, count(*) FILTER (WHERE cache_hit)::int AS cache_hits
       FROM upstream_calls WHERE ${when} GROUP BY source ORDER BY cents DESC`,
      params
    ),
    query(
      `SELECT coalesce(plan,'demo') AS plan, count(*)::int AS calls, coalesce(sum(cost_cents),0)::int AS cents
       FROM upstream_calls WHERE ${when} GROUP BY plan ORDER BY cents DESC`,
      params
    )
  ]);

  const t = totals.rows[0] || { total_calls: 0, total_cents: 0, cache_hits: 0 };
  return {
    month: month || new Date().toISOString().slice(0, 7),
    totalCalls: t.total_calls,
    totalCostUsd: (t.total_cents / 100).toFixed(2),
    cacheHits: t.cache_hits,
    cacheHitRate: t.total_calls ? Math.round((t.cache_hits / t.total_calls) * 1000) / 10 : 0,
    bySource: bySource.rows.map((r) => ({ source: r.source, calls: r.calls, costUsd: (r.cents / 100).toFixed(2), cacheHits: r.cache_hits })),
    byPlan:   byPlan.rows.map((r)   => ({ plan: r.plan, calls: r.calls, costUsd: (r.cents / 100).toFixed(2) }))
  };
}

module.exports = { logUpstreamCall, monthlySummary, COST_CENTS };
