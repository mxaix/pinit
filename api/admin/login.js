import { sameOrigin, privateKey, rateLimit } from '../../lib/security.js';
import crypto from 'crypto';
import { createSessionToken, setSessionCookie } from '../../lib/adminAuth.js';

export default async function handler(req, res) {
  if (!sameOrigin(req,res)) return;
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  try {
    if (!await rateLimit(privateKey(req,'admin-login'),5,900) || !await rateLimit(privateKey(req,'admin-global','global'),100,900)) return res.status(429).json({error:'Too many login attempts'});
  } catch { return res.status(503).json({error:'Login temporarily unavailable'}); }

  const adminPassword = process.env.ADMIN_PASSWORD_SCRYPT;
  if (!adminPassword) {
    return res.status(500).json({ error: 'Admin login is not configured' });
  }

  const { password } = req.body || {};
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password required' });
  }

  if(password.length>1024) return res.status(400).json({error:'Invalid password'});
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(adminPassword)) return res.status(503).json({error:'Admin password configuration invalid'});
  const [salt, hash] = adminPassword.split(':');
  const provided = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (provided.length !== expected.length) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  let valid = false;
  try {
    valid = crypto.timingSafeEqual(provided, expected);
  } catch {
    valid = false;
  }

  if (!valid) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  let token;
  try { token = await createSessionToken(); } catch { return res.status(503).json({error:'Login temporarily unavailable'}); }
  setSessionCookie(res, token);
  return res.status(200).json({ ok: true });
}
