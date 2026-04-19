const axios = require('axios');

const RENTCAST_BASE = 'https://api.rentcast.io/v1';
const TIMEOUT_MS = 15000;

const client = () => {
  const apiKey = process.env.RENTCAST_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('RENTCAST_API_KEY not configured'), { status: 503 });
  }
  return axios.create({
    baseURL: RENTCAST_BASE,
    headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
    timeout: TIMEOUT_MS
  });
};

// Map internal filter keys → RentCast query params.
// https://developers.rentcast.io/reference/rental-long-term-listings
const titleCase = (s) =>
  String(s || '')
    .trim()
    .split(/[\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

const buildParams = (city, state, filters = {}) => {
  const params = { city: titleCase(city), state: String(state).toUpperCase(), status: 'Active' };
  if (filters.maxPrice != null) params.maxRent = filters.maxPrice;
  if (filters.minBeds != null) params.bedrooms = filters.minBeds;
  // RentCast uses a single bedrooms value, not min/max. If a range is given,
  // prefer minBeds and filter maxBeds client-side after fetch.
  if (filters.limit != null) {
    params.limit = Math.min(Math.max(1, filters.limit), 500);
  } else {
    params.limit = 50;
  }
  return params;
};

const normalize = (rc) => ({
  source: 'rentcast',
  id: rc.id,
  price: rc.price ?? rc.rent ?? null,
  address: rc.formattedAddress || [rc.addressLine1, rc.city, rc.state, rc.zipCode].filter(Boolean).join(', '),
  zip: rc.zipCode,
  beds: rc.bedrooms != null ? `${rc.bedrooms} bed` : null,
  baths: rc.bathrooms != null ? `${rc.bathrooms} bath` : null,
  sqft: rc.squareFootage ?? null,
  propertyType: rc.propertyType ?? null,
  yearBuilt: rc.yearBuilt ?? null,
  daysOnMarket: rc.daysOnMarket ?? null,
  listingUrl: rc.listingUrl ?? null,
  latitude: rc.latitude ?? null,
  longitude: rc.longitude ?? null,
  fetchedAt: new Date().toISOString()
});

const fetchRentalListings = async (city, state, filters = {}) => {
  const api = client();
  const params = buildParams(city, state, filters);

  const { data } = await api.get('/listings/rental/long-term', { params });

  // RentCast returns an array of listing objects
  const raw = Array.isArray(data) ? data : data?.listings || [];
  let listings = raw.map(normalize);

  if (filters.maxBeds != null) {
    listings = listings.filter((l) => {
      const beds = parseInt(String(l.beds).replace(/[^0-9]/g, ''), 10);
      return Number.isFinite(beds) && beds <= filters.maxBeds;
    });
  }

  return listings;
};

const fetchPropertyAvm = async (address) => {
  const api = client();
  const { data } = await api.get('/avm/rent/long-term', { params: { address } });
  return data;
};

module.exports = { fetchRentalListings, fetchPropertyAvm, normalize };
