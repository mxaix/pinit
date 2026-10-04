import { isIP } from 'node:net';
import crypto from 'node:crypto';
import { supabaseRequest } from './supabaseAdmin.js';

export function noStore(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
}
export function sameOrigin(req, res) {
  noStore(res);
  const origins = (process.env.APP_ORIGINS || 'https://www.pinitworld.com,https://pinitworld.com').split(',');
  if (!origins.includes(req.headers.origin) || req.headers['sec-fetch-site'] === 'cross-site') {
    res.status(403).json({ error: 'Origin not allowed' }); return false;
  }
  return true;
}
export function getClientIp(req) {
  // Trust forwarded headers ONLY on Vercel, whose edge overwrites them.
  const ip = process.env.VERCEL === '1'
    ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    : req.socket?.remoteAddress;
  if (!isIP(ip || '')) throw new Error('Trusted client IP unavailable');
  return ip;
}
export function privateKey(req, purpose, period = new Date().toISOString().slice(0, 10)) {
  const secret = process.env.LIMITER_SECRET;
  if (!secret || secret.length < 32) throw new Error('LIMITER_SECRET must have at least 32 characters');
  return crypto.createHmac('sha256', secret).update(`${purpose}:${period}:${purpose === 'admin-global' ? 'all' : getClientIp(req)}`).digest('hex');
}
export function country(req) {
  const code = process.env.VERCEL === '1' ? req.headers['x-vercel-ip-country'] : '';
  if (!/^[A-Z]{2}$/.test(code || '')) return { country: 'Unknown', country_code: '' };
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
    if (!name || name === code) return { country: 'Unknown', country_code: '' };
    const overrides = { US: 'United States', GB: 'United Kingdom', KR: 'South Korea', CZ: 'Czech Republic', AE: 'UAE', TR: 'Turkey' };
    return { country: overrides[code] || name, country_code: code };
  } catch { return { country: 'Unknown', country_code: '' }; }
}
export async function rateLimit(key, max, seconds) {
  return await supabaseRequest('rpc/take_rate_limit', {
    method: 'POST', body: JSON.stringify({ p_key: key, p_max: max, p_seconds: seconds })
  });
}
