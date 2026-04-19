# Changelog

All notable RentVolt API changes. Newest first.

Change tags: `added` · `changed` · `deprecated` · `removed` · `fixed` · `security`.
See our [API Versioning & Deprecation Policy](/legal/api-versioning) for the contract behind breaking changes.

---

## 2026-04-19 · Launch

**Added**
- Custom domain live at `rentvolt.io` with Let's Encrypt TLS.
- Live rental-listings endpoint (`POST /api/scrape/listings`) aggregating **RentCast** (140M+ properties, MLS + agents + owners + public records).
- Market-context overlay from **HUD Fair Market Rent** (Small Area FMR with MSA-level fallback) and **US Census ACS** (median gross rent, median household income, vacancy rate, total housing units).
- LLM-friendly **briefing endpoint**: `GET /api/market/briefing/:zip?state=xx` returns a single sourced paragraph summarizing a ZIP's rental market.
- AI-agent helpers: function-calling JSON schema in every response, MCP-server-ready shape.
- Pricing tiers self-serve via Stripe: **Starter** (free, 100 req/mo), **Growth** ($19/mo, 1,000), **Scale** ($49/mo, 5,000), **Enterprise** ($149/mo, 25,000).
- Magic-link dashboard auth at `/dashboard` with per-session cookies (HMAC-signed, 30-day).
- Newsletter widget on the homepage with double-opt-in-style confirmation email.
- `/api/health/sources` upstream probe for RentCast / HUD / Census.
- Admin endpoints behind `x-admin-token`: `/api/admin/costs` (per-source/per-plan monthly cost rollup) and `/api/admin/retention` (DAU/WAU/MAU + churn).
- Full legal suite: Terms of Service, Privacy Policy, Refund Policy, Acceptable Use, DMCA, Compliance, Legal Disclaimer, Do Not Sell or Share, API Versioning.

**Infrastructure**
- RentCast Foundation plan (1,000 included calls) with 6¢ marginal overage rate.
- Per-tier cache TTL (free 48h / growth 12h / scale 6h / business 3h) to protect unit economics.
- Proactive warm-cache job refreshes top 20 US metros every 6h.
- Resend-delivered transactional email with verified SPF/DKIM/DMARC on `groundworklabs.io`.
- Boot-time database migrations so schema is always up to date before serving.

**Security**
- Helmet CSP: `script-src 'self'`, `frame-ancestors 'none'`, strict `Content-Security-Policy`.
- API-key storage as `sha256(raw_key)` — raw keys are never persisted.
- Stripe webhook signature verification with idempotency-keyed replay protection.
- HttpOnly / Secure / SameSite=Lax session cookies with HMAC integrity.

---

Have a feature request or bug report? Email **[support@groundworklabs.io](mailto:support@groundworklabs.io)**.
