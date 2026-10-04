export const COLORS = ['#e63946','#f4842a','#f7c948','#2dc653','#1a7abf','#7b2ff7','#e040a0','#00b4d8','#ff6b35','#1b4332','#1a1814','#c94040'];
export const MOODS = ['hopeful','tired','lonely','grateful','angry','peaceful','lost'];
export function validateNote(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['content','alias','color','mood'].includes(k))) throw new Error('Unexpected note fields');
  if (typeof body.content !== 'string' || typeof body.alias !== 'string') throw new Error('Content and alias required');
  const content = body.content.trim(), alias = body.alias.trim();
  const words = content.split(/\s+/u).filter(Boolean).length;
  if ([...content].length > 700 || words < 3 || words > 60 || /[\p{Cc}\p{Cf}]/u.test(content.replace(/[\n\r\t]/g, ''))) throw new Error('Use 3–60 words, up to 700 characters');
  if ([...alias].length < 1 || [...alias].length > 40 || !/^[\p{L}\p{M}\p{N} ._'’-]+$/u.test(alias)) throw new Error('Use a name of 1–40 letters, numbers, spaces or name punctuation');
  if (!COLORS.includes(body.color)) throw new Error('Invalid note color');
  const mood = body.mood ?? null;
  if (mood !== null && !MOODS.includes(mood)) throw new Error('Invalid mood');
  return { content, alias, color: body.color, mood };
}
