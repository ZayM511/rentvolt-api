# Real Estate Scraper API

**© 2026 Groundwork Labs LLC** — A California Limited Liability Company

## About

**Groundwork Labs LLC** provides APIs for real estate data aggregation and pricing intelligence.

This API aggregates rental listing data from multiple sources for investors, researchers, and businesses requiring rental market data.

## ⚠️ Legal Notice

**IMPORTANT:** By using this API, you agree to the following:

1. **Terms of Service** — You must agree to our [Terms of Service](legal/TermsOfService.md)
2. **Privacy Policy** — View our [Privacy Policy](legal/PrivacyPolicy.md)
3. **Legal Disclaimer** — Review our [Legal Disclaimer](legal/LegalDisclaimer.md)
4. **Compliance** — See [Compliance Information](legal/Compliance.md)

Unauthorized use is prohibited. All users must comply with applicable laws and the terms of service of underlying data sources.

## Company Information

**Groundwork Labs LLC**  
California Limited Liability Company  
Email: support@groundworklabs.com

## Supported Sources

- rentals.com ✓
- zillow.com ✓
- apartments.com ✓
- rentcafe.com ✓
- hotpads.com ✓
- zumper.com ✓

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Add your Stripe keys to .env
# STRIPE_SECRET_KEY=sk_test_...

# Start the server
npm start
```

## API Endpoints

### Health Check
```
GET /health
```

### Verify API Key
```
GET /api/verify
Headers: x-api-key: YOUR_API_KEY
```

### Create Stripe Checkout
```
POST /api/stripe/checkout
Headers: x-api-key: YOUR_API_KEY
Body: { "plan": "basic" | "pro" }
```

### Get Listings
```
POST /api/scrape/listings
Headers: x-api-key: YOUR_API_KEY
Body: {
  "city": "oakland",
  "state": "ca",
  "filters": {
    "maxPrice": 3000,
    "minBeds": 2
  }
}
```

### Get Supported Locations
```
GET /api/scrape/locations
```

## Subscription Plans

| Plan | Price | Requests/Month |
|------|-------|----------------|
| Free | $0 | 100 |
| Basic | $9.99/mo | 1,000 |
| Pro | $29.99/mo | 10,000 |

## Legal & Compliance

This product is provided by **Groundwork Labs LLC**, a California limited liability company. All users must:

- Comply with California Consumer Privacy Laws (CCPA/CPRA)
- Not use data for unlawful purposes
- Respect third-party data source terms of service
- Obtain necessary consents for data use

For questions: legal@groundworklabs.com

---

© 2026 Groundwork Labs LLC — All Rights Reserved
