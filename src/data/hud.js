const axios = require('axios');

// HUD User API (free; requires a token at huduser.gov).
// Fair Market Rents. No rate limit documented; be polite and cache.
const HUD_BASE = 'https://www.huduser.gov/hudapi/public/fmr';
const TIMEOUT_MS = 15000;

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

// ─── Caches (in-process; survive within a single Render instance) ──────────
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const metroListCache = new Map();  // `${state}:${year}` → { metros, expiresAt }
const metroFmrCache  = new Map();  // metroId → { data, year, expiresAt }
const zipMetroCache  = new Map();  // `${state}:${zip}` → metroId

// ─── Low-level HUD calls ───────────────────────────────────────────────────
async function listMetrosForState(state, year) {
  const key = `${state.toUpperCase()}:${year}`;
  const cached = metroListCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.metros;
  const api = client();
  // HUD's documented endpoint is /fmr/statedata/{state}?year=Y
  // It returns both metroareas[] and counties[] under data.
  const { data } = await api.get(`/statedata/${state.toUpperCase()}?year=${year}`);
  const metros = data?.data?.metroareas
    || data?.metroareas
    || (Array.isArray(data?.data) ? data.data : [])
    || [];
  metroListCache.set(key, { metros, expiresAt: Date.now() + CACHE_TTL_MS });
  return metros;
}

async function fetchMetroFmr(metroId, year) {
  const cached = metroFmrCache.get(metroId);
  if (cached && cached.year === year && cached.expiresAt > Date.now()) return cached.data;
  const api = client();
  const { data } = await api.get(`/data/${metroId}?year=${year}`);
  metroFmrCache.set(metroId, { data, year, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

function metroIdOf(metroEntry) {
  return metroEntry?.code || metroEntry?.cbsa_code || metroEntry?.id || metroEntry?.entity_id || null;
}

function basicDataArrayOf(metroResponse) {
  const bd = metroResponse?.data?.basicdata;
  if (Array.isArray(bd)) return bd;
  if (bd && typeof bd === 'object') return [bd]; // some responses return a single object
  return [];
}

// ─── ZIP → metro resolver ──────────────────────────────────────────────────
// Finds the HUD metro that publishes SAFMR data for the given ZIP. Returns
// { metroId, zipRow } when found. Falls back to MSA-level FMR if SAFMR is
// not available for this ZIP. Throws if nothing can be resolved.
async function findFmrForZip(zip, state, year) {
  const cacheKey = `${state.toUpperCase()}:${zip}`;
  const cachedMetro = zipMetroCache.get(cacheKey);
  const metros = await listMetrosForState(state, year);
  if (metros.length === 0) {
    throw new Error(`No HUD metros listed for state ${state} year ${year}`);
  }

  // Tight path: we already know the metro for this ZIP
  if (cachedMetro) {
    const fmr = await fetchMetroFmr(cachedMetro, year);
    const row = basicDataArrayOf(fmr).find((r) => String(r.zip_code) === String(zip));
    if (row) return { metroId: cachedMetro, zipRow: row };
  }

  // Fan out: fetch FMR for every metro in the state in parallel, hunt for ZIP
  const results = await Promise.allSettled(
    metros.map((m) => {
      const id = metroIdOf(m);
      return id ? fetchMetroFmr(id, year).then((data) => ({ id, data })) : Promise.reject(new Error('no metroId'));
    })
  );

  let msaLevelFallback = null;
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { id, data } = r.value;
    for (const row of basicDataArrayOf(data)) {
      const z = String(row.zip_code || '');
      // Build up the ZIP → metro mapping opportunistically for future hits
      if (/^\d{5}$/.test(z)) {
        zipMetroCache.set(`${state.toUpperCase()}:${z}`, id);
      }
      if (z === String(zip)) {
        return { metroId: id, zipRow: row };
      }
      // Remember the MSA-level row of the first metro we see so we can fall back
      if (!msaLevelFallback && (z === 'MSA level' || z === 'MSA Level' || /^MSA/i.test(z))) {
        msaLevelFallback = { metroId: id, zipRow: row };
      }
    }
  }

  // SAFMR didn't cover this ZIP — return MSA-level FMR as a reasonable fallback
  if (msaLevelFallback) return msaLevelFallback;
  throw new Error(`ZIP ${zip} not found in HUD FMR data for state ${state} year ${year}`);
}

// ─── Public API ────────────────────────────────────────────────────────────
const fetchFmrByZip = async (zip, state, year) => {
  if (!state) {
    throw Object.assign(new Error('state is required to resolve HUD FMR by ZIP'), { status: 400 });
  }
  const years = year ? [year] : [
    new Date().getFullYear(),
    new Date().getFullYear() - 1,
    new Date().getFullYear() - 2
  ];
  let lastErr;
  for (const y of years) {
    try {
      const { metroId, zipRow } = await findFmrForZip(zip, state, y);
      // Shape to match summarizeFmr's expectation: { data: { basicdata: <row> } }
      return { data: { basicdata: { ...zipRow, year: y, metroId } } };
    } catch (err) {
      lastErr = err;
      if (err.response && err.response.status >= 500) throw err;
    }
  }
  throw lastErr || new Error(`HUD FMR not available for ZIP ${zip} state ${state}`);
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
    metroId: d.metroId || null,
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
