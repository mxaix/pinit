import { requireAdmin } from '../../lib/adminAuth.js';
import { supabaseRequest } from '../../lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const notes = await supabaseRequest('notes?select=*&order=created_at.desc');
      return res.status(200).json({ notes: Array.isArray(notes) ? notes : [] });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id;
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!id || typeof id !== 'string' || !uuidRe.test(id)) {
        return res.status(400).json({ error: 'Valid note id required' });
      }

      await supabaseRequest(`notes?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin notes API error:', err);
    return res.status(err.status || 500).json({ error: 'Failed to process admin request' });
  }
}
