import { getTokenFromRequest, verifySessionToken } from '../../lib/adminAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = getTokenFromRequest(req);
  const authenticated = verifySessionToken(token);
  return res.status(200).json({ authenticated });
}
