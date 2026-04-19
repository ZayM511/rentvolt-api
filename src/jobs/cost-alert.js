// Soft cost alert — emails operator when month-to-date RentCast calls
// cross a threshold (default 70% of the included plan quota). Fires at most
// once per calendar month per threshold.
const { query } = require('../db');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // every hour
const alertedMonths = new Set(); // in-memory dedupe: `${month}:${threshold}`

function config() {
  return {
    includedCalls: parseInt(process.env.RENTCAST_MONTHLY_CALL_LIMIT || '1000', 10),
    thresholdPct: parseInt(process.env.COST_ALERT_THRESHOLD_PCT     || '70',   10),
    alertTo:      process.env.COST_ALERT_EMAIL || 'support@groundworklabs.io'
  };
}

async function checkOnce() {
  const { includedCalls, thresholdPct, alertTo } = config();
  if (!process.env.RESEND_API_KEY) return { skipped: 'RESEND_API_KEY not set' };
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const key = `${month}:${thresholdPct}`;
  if (alertedMonths.has(key)) return { skipped: 'already alerted this month' };

  let billedCalls = 0;
  try {
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM upstream_calls
         WHERE source = 'rentcast' AND cache_hit = false
           AND date_trunc('month', created_at) = date_trunc('month', now())`
    );
    billedCalls = rows[0]?.n || 0;
  } catch (err) {
    // Table might not exist yet (pre-migration boot); try again next cycle
    return { skipped: 'upstream_calls not available: ' + err.message };
  }

  const usedPct = Math.round((billedCalls / includedCalls) * 100);
  if (usedPct < thresholdPct) return { usedPct, alerted: false };

  const { send } = require('../email');
  const subject = `[RentVolt ops] ${usedPct}% of RentCast monthly quota used (${billedCalls}/${includedCalls})`;
  const html = `
    <!doctype html>
    <html><body style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #111;">
      <h2>Cost-alert: RentCast quota ${usedPct}% consumed</h2>
      <p>You've used <strong>${billedCalls}</strong> of <strong>${includedCalls}</strong> included RentCast calls for <strong>${month}</strong>.</p>
      <p>Each additional billed call is the overage rate configured in your RentCast plan (currently projecting $${((includedCalls * 0.06) / 100).toFixed(2)}+ if usage continues at this rate).</p>
      <p><strong>Next step</strong>: consider upgrading your RentCast tier at
        <a href="https://app.rentcast.io/app/api">app.rentcast.io/app/api</a>
        if you expect significant growth this month.</p>
      <p style="font-size: 12px; color: #666;">
        This alert fires once per calendar month when usage crosses ${thresholdPct}%.
        Tune <code>COST_ALERT_THRESHOLD_PCT</code> in Render to change the trigger.
      </p>
    </body></html>
  `;

  try {
    await send({ to: alertTo, subject, html });
    alertedMonths.add(key);
    console.log(`[cost-alert] sent to ${alertTo}: ${usedPct}% (${billedCalls}/${includedCalls}) for ${month}`);
    return { usedPct, alerted: true, to: alertTo };
  } catch (err) {
    console.error('[cost-alert] send failed:', err.message);
    return { usedPct, alerted: false, error: err.message };
  }
}

function start() {
  // First check ~2 min after boot (lets migrations + warm-cache finish first).
  setTimeout(() => {
    checkOnce().catch((e) => console.warn('[cost-alert] first check:', e.message));
    setInterval(() => {
      checkOnce().catch((e) => console.warn('[cost-alert] cycle:', e.message));
    }, CHECK_INTERVAL_MS);
  }, 2 * 60 * 1000);
}

module.exports = { start, checkOnce };
