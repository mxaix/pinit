import crypto from 'crypto';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
}

export function createSessionToken() {
  const secret = getSecret();
  if (!secret) throw new Error('Missing ADMIN_SESSION_SECRET or ADMIN_PASSWORD');
  const expiry = Date.now() + SESSION_TTL_MS;
  const sig = crypto.createHmac('sha256', secret).update(String(expiry)).digest('hex');
  return `${expiry}.${sig}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const secret = getSecret();
  if (!secret) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [expiryStr, sig] = parts;
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || Date.now() > expiry) return false;

  const expected = crypto.createHmac('sha256', secret).update(expiryStr).digest('hex');
  if (sig.length !== expected.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

export function getTokenFromRequest(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();

  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)pinit_admin_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function requireAdmin(req, res) {
  const token = getTokenFromRequest(req);
  if (!verifySessionToken(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export function setSessionCookie(res, token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `pinit_admin_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    'pinit_admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'
  );
}
