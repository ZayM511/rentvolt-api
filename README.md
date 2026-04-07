# realestate-scraper-api
API for scraping real estate rental listings - pricing data for investors

## Setup
```bash
npm install
cp .env.example .env
# Add your Stripe keys to .env
npm start
```

## API Endpoints

### Authentication
All requests require `x-api-key` header.

### Stripe
- `POST /api/stripe/checkout` - Create subscription checkout
- `POST /api/stripe/webhook` - Handle subscription events

### Scrape
- `POST /api/scrape/listings` - Get listings for a location
- `GET /api/scrape/locations` - List supported locations

## Plans
- **Basic**: $9.99/month - 1,000 requests
- **Pro**: $29.99/month - 10,000 requests
