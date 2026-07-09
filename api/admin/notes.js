import { requireAdmin } from '../../lib/adminAuth.js';
import { supabaseRequest } from '../../lib/supabaseAdmin.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildReportCounts(reports) {
  const counts = {};
  if (!Array.isArray(reports)) return counts;
  reports.forEach((row) => {
    if (!row.note_id) return;
    counts[row.note_id] = (counts[row.note_id] || 0) + 1;
  });
  return counts;
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const [notes, reports] = await Promise.all([
        supabaseRequest('notes?select=*&order=created_at.desc'),
        supabaseRequest('reports?select=note_id').catch(() => []),
      ]);

      return res.status(200).json({
        notes: Array.isArray(notes) ? notes : [],
        reportCounts: buildReportCounts(reports),
      });
    }

    if (req.method === 'PATCH') {
      const { id, hidden } = req.body || {};
      if (!id || typeof id !== 'string' || !UUID_RE.test(id)) {
        return res.status(400).json({ error: 'Valid note id required' });
      }
      if (typeof hidden !== 'boolean') {
        return res.status(400).json({ error: 'hidden must be true or false' });
      }

      const patch = hidden
        ? { hidden: true, hidden_at: new Date().toISOString() }
        : { hidden: false, hidden_at: null };

      await supabaseRequest(`notes?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
        headers: { Prefer: 'return=minimal' },
      });

      return res.status(200).json({ ok: true, hidden });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id;
      if (!id || typeof id !== 'string' || !UUID_RE.test(id)) {
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
