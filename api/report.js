import { getReporterHash } from '../lib/ipHash.js';
import { supabaseRequest } from '../lib/supabaseAdmin.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAILY_REPORT_LIMIT = 20;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { noteId } = req.body || {};
    if (!noteId || typeof noteId !== 'string' || !UUID_RE.test(noteId)) {
      return res.status(400).json({ ok: false, error: 'Invalid note id' });
    }

    const reporterHash = getReporterHash(req);
    const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';

    const noteRows = await supabaseRequest(
      `notes?id=eq.${encodeURIComponent(noteId)}&select=id,hidden&limit=1`
    );
    const note = Array.isArray(noteRows) ? noteRows[0] : null;
    if (!note) {
      return res.status(404).json({ ok: false, error: 'Note not found' });
    }
    if (note.hidden) {
      return res.status(200).json({ ok: true, message: 'Already reviewed' });
    }

    const existing = await supabaseRequest(
      `reports?note_id=eq.${encodeURIComponent(noteId)}&reporter_hash=eq.${encodeURIComponent(reporterHash)}&select=id&limit=1`
    );
    if (Array.isArray(existing) && existing.length) {
      return res.status(200).json({ ok: true, message: 'Already reported' });
    }

    const recent = await supabaseRequest(
      `reports?reporter_hash=eq.${encodeURIComponent(reporterHash)}&created_at=gte.${encodeURIComponent(todayStart)}&select=id&limit=21`
    );
    const recentCount = Array.isArray(recent) ? recent.length : 0;
    if (recentCount >= DAILY_REPORT_LIMIT) {
      return res.status(429).json({
        ok: false,
        error: 'Report limit reached for today. Please try again tomorrow.',
      });
    }

    await supabaseRequest('reports', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        note_id: noteId,
        reporter_hash: reporterHash,
      }),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Report API error:', err);
    return res.status(500).json({ ok: false, error: 'Could not submit report. Please try again.' });
  }
}
