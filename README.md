# ⚡ RentVolt API

**Rental market intelligence API.** Live listings, HUD Fair Market Rents, and US Census demographics for 140M+ US properties — one normalized API.

Built for AI agents, indie builders, and property-tech teams.

© 2026 Groundwork Labs LLC · California (Entity B20260059957)

---

## Data sources

- **RentCast.io** — licensed rental-listings API (resale/redistribution permitted by their ToS)
- **HUD Fair Market Rents** — public-domain ZIP-level benchmarks
- **US Census ACS** — public-domain demographics (median rent, vacancy, income)

No scraping. No mocked data. See [`legal/LegalDisclaimer.md`](legal/LegalDisclaimer.md) for full provider list.

## Quick start

```bash
git clone https://github.com/ZayM511/rentvolt-api.git
cd rentvolt-api
npm install
cp .env.example .env         # fill in credentials (see .env.example for all keys)
npm run migrate              # applies migrations/*.sql against DATABASE_URL
npm start
```

Server: `http://localhost:3000` · Docs: `/api-docs` · Dashboard: `/dashboard`

## Plans

| Plan       | Price    | Requests/mo | Bulk | Market trends | Webhooks | Support     |
|------------|----------|-------------|------|---------------|----------|-------------|
| Starter    | Free     | 100         | —    | ✓             | —        | Community   |
| Growth     | $19/mo   | 1,000       | ✓    | ✓             | ✓        | Email       |
| Scale      | $49/mo   | 5,000       | ✓    | ✓             | ✓        | Priority    |
| Enterprise | $149/mo  | 25,000      | ✓    | ✓             | ✓        | Dedicated   |

All paid plans auto-renew monthly until cancelled. Cancel anytime at `/dashboard`. See [`legal/RefundPolicy.md`](legal/RefundPolicy.md).

## Endpoints

| Method | Path                            | Auth | Description |
|--------|---------------------------------|------|-------------|
| GET    | `/health`                       | —    | Service + DB status |
| GET    | `/legal` · `/legal/:doc`        | —    | Legal document bundle |
| POST   | `/api/keys/free`                | —    | Issue free-plan key (1/day/IP) |
| GET    | `/api/verify`                   | Key  | Check key + usage |
| POST   | `/api/terms/accept`             | Key  | Record ToS acceptance |
| GET    | `/demo/listings?city=…&state=…` | —    | Unauthenticated demo (3/day/IP) |
| POST   | `/api/scrape/listings`          | Key  | Listings for a city |
| POST   | `/api/scrape/bulk`              | Key+ | Listings for up to 10 cities (paid) |
| GET    | `/api/scrape/locations`         | Key  | Supported coverage info |
| GET    | `/api/market/trends/:zip`       | Key  | HUD + Census trends for ZIP |
| GET    | `/api/market/briefing/:zip`     | Key  | One-paragraph LLM-ready market briefing |
| GET    | `/api/stripe/plans`             | —    | Plan catalog |
| POST   | `/api/stripe/checkout`          | —    | Start Stripe checkout |
| POST   | `/api/stripe/manage`            | Key  | Open Stripe billing portal |
| POST   | `/api/stripe/webhook`           | Sig. | Stripe event receiver |
| POST   | `/api/privacy-request`          | —    | CCPA/CPRA request form |

See [`API_USAGE.md`](API_USAGE.md) and the live [`/api-docs`](https://rentvolt.io/api-docs) for full request/response details.

## Example

```bash
curl -X POST https://rentvolt.io/api/scrape/listings \
  -H "Content-Type: application/json" \
  -H "x-api-key: $RENTVOLT_API_KEY" \
  -d '{"city":"oakland","state":"ca","filters":{"maxPrice":3000,"minBeds":2,"limit":20}}'
```

## Architecture

```
Express app
├── src/
│   ├── index.js              app entry + routes mount
│   ├── db/                   Postgres pool + helpers
│   ├── data/                 RentCast + HUD + Census + cache + normalization
│   ├── middleware/           apiKeyAuth, termsAcceptance, validation, requestLogger
│   ├── routes/               stripe, scrape, market
│   ├── email/                Resend templates
│   └── public/               marketing site, dashboard, success/cancel, pricing
├── legal/                    ToS, Privacy, AUP, Refund, DMCA, etc.
├── migrations/               SQL migrations (run by scripts/migrate.js)
└── openapi.json              Swagger UI source
```

State is stored in Postgres (never in-memory). Scraper modules have been deprecated to `src/scrapers/legacy/`.

## Deployment

Runs on Render. `render.yaml` defines the web service; attach a Render Postgres instance and set env vars from `.env.example` in the Render dashboard. `postdeploy` or `buildCommand` runs migrations automatically.

## Legal

- [Terms of Service](legal/TermsOfService.md)
- [Privacy Policy](legal/PrivacyPolicy.md)
- [Acceptable Use Policy](legal/AUP.md)
- [Refund Policy](legal/RefundPolicy.md)
- [DMCA Policy](legal/DMCA.md)
- [Legal Disclaimer](legal/LegalDisclaimer.md)
- [Compliance](legal/Compliance.md)
- [Do Not Sell or Share (CCPA)](legal/DoNotSell.md)

---

**RentVolt** — A Groundwork Labs LLC product · California · support@groundworklabs.io
