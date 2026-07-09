export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'No text provided' });
    }

    const t = text.toLowerCase();

  // Exact phrase blocklist
  const blocked = [
    'chink','spic','wetback','kike','raghead','towelhead','sandnigger',
    'kill yourself','kys','bomb threat','blow up','shoot everyone',
    'death to','want to kill','going to kill','gonna kill','will kill',
    'want to murder','going to murder','will murder',
    'want to hurt','going to hurt','will hurt',
    'want to shoot','going to shoot','will shoot',
    'want to stab','going to stab','will stab',
    'want to bomb','going to bomb','will bomb',
    'should die','must die','needs to die',
    'xxx','pornhub','onlyfans','sex tape',
  ];

  // Pattern blocklist
  const patterns = [
    /\bn[i1][g9]{2}[e3]r\b/,
    /\bf+u+c+k+/,
    /\bs+h+i+t+/,
    /\bb+i+t+c+h+/,
    /\bc+u+n+t+/,
    /\bd+i+c+k+\b/,
    /\ba+s+s+h+o+l+e+/,
    /\bw+h+o+r+e+\b/,
    /\bhate (all )?(muslim|christian|jew|hindu|black|white|arab|asian|mexican|indian|pakistan)/,
    /\bkill all\b/,
    /\bmurder all\b/,
  ];

  for (const p of blocked) {
    if (t.includes(p)) return res.status(200).json({ safe: false, reason: 'Contains threatening or hateful content' });
  }

  for (const p of patterns) {
    if (p.test(t)) return res.status(200).json({ safe: false, reason: 'Contains threatening or hateful content' });
  }

  if (text.trim().split(/\s+/).filter(Boolean).length < 3) {
    return res.status(200).json({ safe: false, reason: 'Too short — say something meaningful' });
  }

    return res.status(200).json({ safe: true });
  } catch (err) {
    console.error('Moderation error:', err);
    return res.status(500).json({ safe: false, reason: 'Moderation check failed. Please try again.' });
  }
}
