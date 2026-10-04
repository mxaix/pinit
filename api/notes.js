import { validateNote } from '../lib/noteValidation.js';
import { runPinitShield } from './moderate.js';
import { country, privateKey, rateLimit, sameOrigin } from '../lib/security.js';
import { supabaseRequest } from '../lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (!sameOrigin(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return res.status(415).json({ error: 'JSON required' });
  let note;
  try { note = validateNote(req.body); } catch (err) { return res.status(400).json({ error: err.message }); }
  try {
    if (!await rateLimit(privateKey(req, 'posting-attempt'), 10, 600)) return res.status(429).json({ error: 'Please try again later' });
    const moderation = runPinitShield(note.content + ' ' + note.alias);
    if (!moderation.safe) return res.status(422).json({ error: moderation.reason });
    const day = new Date().toISOString().slice(0,10);
    const rows = await supabaseRequest('rpc/create_daily_note', { method: 'POST', body: JSON.stringify({
      p_key: privateKey(req, 'daily-note', day), p_day: day, p_content: note.content, p_alias: note.alias,
      p_color: note.color, p_mood: note.mood, p_country: country(req).country,
      p_country_code: country(req).country_code
    }) });
    return res.status(201).json({ ok: true, note: Array.isArray(rows) ? rows[0] : rows });
  } catch (err) {
    if (err.data?.code === '23505') return res.status(409).json({ error: 'You have already pinned a note today. Come back tomorrow.' });
    return res.status(503).json({ error: 'Posting is temporarily unavailable. Please try again.' });
  }
}
