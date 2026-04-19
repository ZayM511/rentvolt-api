const axios = require('axios');

// Census ACS 5-Year API — free, no key required for light use
// (but a key is recommended; register at api.census.gov/data/key_signup.html).
// Variables:
//   B25064_001E — Median gross rent
//   B25002_003E — Vacant housing units
//   B25002_001E — Total housing units
//   B19013_001E — Median household income
const ACS_BASE = 'https://api.census.gov/data';
const TIMEOUT_MS = 10000;

const axClient = axios.create({ timeout: TIMEOUT_MS, headers: { Accept: 'application/json' } });

const fetchAcsByZip = async (zip, year) => {
  const y = year || 2023; // ACS 5-year lags ~2 years
  const vars = 'B25064_001E,B25002_001E,B25002_003E,B19013_001E';
  const key = process.env.CENSUS_API_KEY ? `&key=${process.env.CENSUS_API_KEY}` : '';
  const url = `${ACS_BASE}/${y}/acs/acs5?get=${vars}&for=zip%20code%20tabulation%20area:${zip}${key}`;
  const { data } = await axClient.get(url);
  // Response: [[headers...], [values...]]
  const [headers, values] = data;
  if (!values) return null;
  const row = {};
  headers.forEach((h, i) => { row[h] = values[i]; });
  return {
    source: 'census.acs',
    zip,
    year: y,
    medianGrossRent: row.B25064_001E ? parseInt(row.B25064_001E, 10) : null,
    totalHousingUnits: row.B25002_001E ? parseInt(row.B25002_001E, 10) : null,
    vacantHousingUnits: row.B25002_003E ? parseInt(row.B25002_003E, 10) : null,
    vacancyRate: row.B25002_001E && row.B25002_003E
      ? Math.round((parseInt(row.B25002_003E, 10) / parseInt(row.B25002_001E, 10)) * 10000) / 100
      : null,
    medianHouseholdIncome: row.B19013_001E ? parseInt(row.B19013_001E, 10) : null
  };
};

module.exports = { fetchAcsByZip };
