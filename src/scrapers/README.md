# Deprecated

The legacy site-specific scrapers previously located at `src/scrapers/*.js` have been moved to `src/scrapers/legacy/` and are no longer used by the RentVolt API.

As of 2026-04-17, all data fetching goes through `src/data/` which uses:

- **RentCast.io** — licensed rental listings API (resale/redistribution allowed by ToS)
- **HUD Fair Market Rents** — public domain
- **US Census ACS** — public domain

Reasons for deprecation:

1. Target sites (Zillow, Apartments.com, etc.) explicitly prohibit automated scraping and redistribution in their Terms of Service.
2. Zillow's scraper (`legacy/zillow.js`) short-circuited to mock data before any HTML parsing occurred, so it was returning synthesized listings rather than real data.
3. Several other scrapers fell back to mock data on any error, with no indication to callers that the results were fabricated.
4. Shipping randomized/mocked data to paying customers creates false-advertising exposure under CA Bus. & Prof. § 17500 and FTC Act § 5.

Do not re-enable these modules. If you need additional data coverage beyond RentCast, add a new licensed source under `src/data/`.
