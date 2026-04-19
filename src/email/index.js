const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || 'RentVolt <noreply@groundworklabs.io>';
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'support@groundworklabs.io';

const send = async ({ to, subject, html }) => {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping send to', to);
    return { skipped: true };
  }
  return resend.emails.send({ from: FROM, to, subject, html, replyTo: REPLY_TO });
};

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const welcomeTemplate = ({ plan, apiKey }) => `
  <!doctype html>
  <html><body style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #111;">
    <h1 style="color: #0a0a1a;">Welcome to RentVolt ⚡</h1>
    <p>Your <strong>${escape(plan)}</strong> plan is active. Here's your API key:</p>
    <pre style="background: #f4f4f7; padding: 16px; border-radius: 8px; word-break: break-all; font-size: 13px;">${escape(apiKey)}</pre>
    <p><strong>Keep this safe.</strong> It grants full access to your RentVolt quota. You can view usage and rotate keys at <a href="${process.env.BASE_URL || 'https://rentvolt-api.onrender.com'}/dashboard">/dashboard</a>.</p>
    <h3>Quickstart</h3>
    <pre style="background: #f4f4f7; padding: 16px; border-radius: 8px; font-size: 12px; overflow-x: auto;">curl -X POST ${process.env.BASE_URL || 'https://rentvolt-api.onrender.com'}/api/scrape/listings \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${escape(apiKey)}" \\
  -d '{"city":"oakland","state":"ca"}'</pre>
    <p>Full docs: <a href="${process.env.BASE_URL || 'https://rentvolt-api.onrender.com'}/api-docs">/api-docs</a></p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">
    <p style="font-size: 12px; color: #666;">
      Your subscription auto-renews monthly. Cancel anytime at
      <a href="${process.env.BASE_URL || 'https://rentvolt-api.onrender.com'}/dashboard">/dashboard</a>
      or by replying to this email.<br><br>
      Groundwork Labs LLC · 2108 N St Ste N, Sacramento, CA 95816 · support@groundworklabs.io
    </p>
  </body></html>
`;

const magicLinkTemplate = ({ link }) => `
  <!doctype html>
  <html><body style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #111;">
    <h1 style="color: #0a0a1a;">Sign in to RentVolt</h1>
    <p>Click below to access your dashboard. This link expires in 15 minutes.</p>
    <p><a href="${link}" style="display: inline-block; background: #00d4ff; color: #000; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open Dashboard</a></p>
    <p style="font-size: 12px; color: #666;">If you didn't request this, you can safely ignore this email.</p>
  </body></html>
`;

const usageAlertTemplate = ({ plan, used, limit, pct }) => `
  <!doctype html>
  <html><body style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
    <h2>Heads up — you're at ${escape(pct)}% of your monthly quota</h2>
    <p>You've used <strong>${escape(used)}</strong> of <strong>${escape(limit)}</strong> requests on your <strong>${escape(plan)}</strong> plan this month.</p>
    <p>Upgrade to keep building without interruption: <a href="${process.env.BASE_URL || 'https://rentvolt-api.onrender.com'}/pricing">View plans</a></p>
  </body></html>
`;

const sendWelcomeEmail = ({ to, plan, apiKey }) =>
  send({ to, subject: 'Welcome to RentVolt — your API key is ready', html: welcomeTemplate({ plan, apiKey }) });

const sendMagicLinkEmail = ({ to, link }) =>
  send({ to, subject: 'Sign in to RentVolt', html: magicLinkTemplate({ link }) });

const sendUsageAlertEmail = ({ to, plan, used, limit, pct }) =>
  send({ to, subject: `RentVolt: ${pct}% of monthly quota used`, html: usageAlertTemplate({ plan, used, limit, pct }) });

module.exports = { send, sendWelcomeEmail, sendMagicLinkEmail, sendUsageAlertEmail };
