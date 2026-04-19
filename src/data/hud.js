const axios = require('axios');

// HUD User API (free; requires a token registered at huduser.gov).
// Fair Market Rents by ZIP / metro. No rate limit documented; be polite.
const HUD_BASE = 'https://www.huduser.gov/hudapi/public/fmr';
const TIMEOUT_MS = 10000;

const client = () => {
  const token = process.env.HUD_API_TOKEN;
  if (!token) {
    throw Object.assign(new Error('HUD_API_TOKEN not configured'), { status: 503 });
  }
  return axios.create({
    baseURL: HUD_BASE,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    timeout: TIMEOUT_MS
  });
};

const fetchFmrByZip = async (zip, year) => {
  const api = client();
  const y = year || new Date().getFullYear();
  const { data } = await api.get(`/data/${zip}?year=${y}`);
  return data;
};

const fetchFmrByStateCounty = async (state, county, year) => {
  const api = client();
  const y = year || new Date().getFullYear();
  const { data } = await api.get(`/data/${state}${county}?year=${y}`);
  return data;
};

// Normalized "market context" shape — what we return to callers
const summarizeFmr = (raw) => {
  const d = raw?.data?.basicdata || raw?.data || {};
  return {
    source: 'hud.fmr',
    zip: d.zip_code || d.zipcode || null,
    year: d.year || null,
    fmr: {
      efficiency: d.Efficiency ?? d.efficiency ?? null,
      oneBr: d['One-Bedroom'] ?? d.onebedroom ?? null,
      twoBr: d['Two-Bedroom'] ?? d.twobedroom ?? null,
      threeBr: d['Three-Bedroom'] ?? d.threebedroom ?? null,
      fourBr: d['Four-Bedroom'] ?? d.fourbedroom ?? null
    }
  };
};

module.exports = { fetchFmrByZip, fetchFmrByStateCounty, summarizeFmr };
