const crypto = require('crypto');

const COOKIE_NAME = 'rv_session';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 chars');
  }
  return s;
};

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const sign = (payload) => {
  const body = b64url(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', secret()).update(body).digest();
  return `${body}.${b64url(mac)}`;
};

const verify = (token) => {
  if (!token || typeof token !== 'string') return null;
  const [body, macB64] = token.split('.');
  if (!body || !macB64) return null;
  let expected;
  try {
    expected = crypto.createHmac('sha256', secret()).update(body).digest();
  } catch {
    return null; // SESSION_SECRET missing — treat as signed-out rather than 500
  }
  const got = fromB64url(macB64);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
};

const parseCookies = (header = '') =>
  Object.fromEntries(
    header.split(';').map((c) => {
      const i = c.indexOf('=');
      if (i < 0) return [c.trim(), ''];
      return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
    })
  );

const issueCookie = (res, { userId, email }) => {
  const payload = { uid: userId, email, exp: Date.now() + COOKIE_MAX_AGE_MS };
  const token = sign(payload);
  const prod = process.env.NODE_ENV === 'production';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(COOKIE_MAX_AGE_MS / 1000)}${prod ? '; Secure' : ''}`
  );
};

const clearCookie = (res) => {
  const prod = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${prod ? '; Secure' : ''}`);
};

// Populates req.user if a valid session cookie is present; does not block.
const attachSession = (req, _res, next) => {
  const cookies = parseCookies(req.headers.cookie || '');
  const payload = verify(cookies[COOKIE_NAME]);
  req.user = payload ? { id: payload.uid, email: payload.email } : null;
  next();
};

// Blocks requests without a valid session.
const requireSession = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in required' });
  next();
};

module.exports = { attachSession, requireSession, issueCookie, clearCookie, COOKIE_NAME };
