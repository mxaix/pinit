import crypto from 'crypto';
import { createSessionToken, setSessionCookie } from '../../lib/adminAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: 'Admin login is not configured' });
  }

  const { password } = req.body || {};
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password required' });
  }

  const provided = Buffer.from(password, 'utf8');
  const expected = Buffer.from(adminPassword, 'utf8');
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

  const token = createSessionToken();
  setSessionCookie(res, token);
  return res.status(200).json({ ok: true, token });
}
