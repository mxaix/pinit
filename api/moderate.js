export const config = { api: { bodyParser: true } };

const SHIELD_VERSION = 'pinit-shield-1';

const BLOCK_REASON =
  'This note may break the wall rules. Please rewrite it without abuse, threats, or harmful language.';
const TOO_SHORT_REASON = 'Too short \u2014 say something meaningful';

// ── Normalization ────────────────────────────────────────────────────────────

const LEET_MAP = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  '$': 's',
  '!': 'i',
  '+': 't',
};

function normalizeText(text) {
  let s = text.normalize('NFKC').toLowerCase().trim();
  s = s
    .split('')
    .map((c) => LEET_MAP[c] ?? c)
    .join('');
  // Collapse 3+ repeated letters to 2 (fuuuuck -> fuuck)
  s = s.replace(/(.)\1{2,}/g, '$1$1');
  return s;
}

function stripForMatching(text) {
  return text.replace(/[\s\p{P}\p{S}]+/gu, '');
}

function prepareVariants(text) {
  const normalized = normalizeText(text);
  const stripped = stripForMatching(normalized);
  const loose = stripped.replace(/(.)\1+/g, '$1');
  return { normalized, stripped, loose };
}

// ── Benign emotional context ─────────────────────────────────────────────────

const BENIGN_EMOTIONAL_PATTERNS = [
  /\bi\s*['']?m\s+feeling?\s+(lost|lonely|tired|sad|empty|hopeless|down|low|broken|alone|angry|grateful|peaceful|overwhelmed|numb|anxious|scared|worried)\b/i,
  /\bi\s+feel\s+(lost|lonely|tired|sad|empty|hopeless|down|low|broken|alone|angry|grateful|peaceful|overwhelmed|numb|anxious|scared|worried)\b/i,
  /\bfeeling\s+(lost|lonely|tired|sad|empty|hopeless|down|low|broken|alone|angry|grateful|peaceful|overwhelmed|numb|anxious|scared|worried)\b/i,
  /\bi\s+miss\b/i,
  /\bit\s+hurts\b/i,
  /\blife\s+is\s+hard\b/i,
  /\btoday\s+(was|is)\s+(hard|rough|heavy|difficult)\b/i,
  /\bi\s+am\s+still\s+here\b/i,
  /\bstill\s+here\b/i,
  /\bi\s+don'?t\s+know\s+what\s+to\s+do\b/i,
  /\btrying\s+to\s+(hold\s+on|keep\s+going|stay\s+strong)\b/i,
];

function isBenignEmotional(text) {
  return BENIGN_EMOTIONAL_PATTERNS.some((p) => p.test(text));
}

// ── Blocklists ───────────────────────────────────────────────────────────────

const BLOCKED_PHRASES = [
  // Slurs & hate
  'chink', 'spic', 'wetback', 'kike', 'raghead', 'towelhead', 'sandnigger',
  'n1gger', 'n1gga', 'faggot', 'fagot', 'retard', 'retarded',
  // Directed self-harm / harassment
  'kill yourself', 'kys', 'go kill yourself', 'you should die', 'you must die',
  'you need to die', 'hope you die', 'wish you were dead', 'go die',
  // Threats & violence
  'bomb threat', 'shoot everyone', 'shoot them all', 'shoot you',
  'death to', 'kill all', 'murder all', 'rape you', 'i will rape',
  'want to kill you', 'going to kill you', 'gonna kill you', 'will kill you',
  'want to murder you', 'going to murder you', 'will murder you',
  'want to hurt you', 'going to hurt you', 'will hurt you',
  'want to shoot you', 'going to shoot you', 'will shoot you',
  'want to stab you', 'going to stab you', 'will stab you',
  'want to bomb', 'going to bomb', 'will bomb',
  'should die', 'must die', 'needs to die', 'deserve to die',
  'cut yourself', 'hang yourself', 'slit your wrists',
  // Sexual explicit
  'xxx', 'pornhub', 'onlyfans', 'sex tape', 'blowjob', 'handjob',
  'cum on', 'jizz on', 'suck my dick', 'suck my cock',
  // Hate targeting groups
  'hate all muslims', 'hate all christians', 'hate all jews', 'hate all hindus',
  'hate all blacks', 'hate all whites', 'hate all arabs', 'hate all asians',
  'hate all mexicans', 'hate all indians', 'hate all pakistanis',
  // Roman Urdu / South Asian abuse (romanized)
  'madarchod', 'madar chod', 'maderchod', 'mader chod',
  'bhenchod', 'behenchod', 'behen chod', 'benchod', 'bhen chod',
  'chutiya', 'chutia', 'chutiye', 'chutiyaa', 'chootiya',
  'bhosdi', 'bhosad', 'bhosadi', 'bhosdike', 'bhosdi ke', 'bhosdiwala',
  'randi', 'randi ka', 'raand', 'raandii',
  'harami', 'haramkhor', 'haram khor', 'haraami',
  'bsdk', 'b.s.d.k', 'mc bc', 'mc/bc',
  'gaandu', 'gandu', 'gaand', 'gand mara', 'gandmara', 'gand mar',
  'lund', 'lauda', 'lawda', 'loda', 'lund le', 'lund lele',
  'kutte', 'kutti', 'kutiya', 'kamine', 'kameene', 'kameena',
  'saala', 'sala kutta', 'beghairat', 'beghairaat',
  'ullu ka pattha', 'ullu ke patthe', 'ullu ke',
  'tatte', 'tatti', 'chakka', 'hijde', 'hijra',
  'teri maa', 'teri ma', 'teri behen', 'teri behan', 'teri bahen',
  'maa ki', 'ma ki ch', 'behen ki', 'baap ka',
];

const BLOCKED_PATTERNS = [
  // English profanity (with letter repetition tolerance)
  /\bn+[i1!]+g+[e3a@]+r+s?\b/,
  /\bn+[i1!]+g+[e3a@]+a+s?\b/,
  /\bf+u+c+k+/,
  /\bf+u+k+/,
  /\bs+h+[i1!]+t+/,
  /\bb+[i1!]+t+c+h+/,
  /\bc+u+n+t+/,
  /\bd+[i1!]+c+k+\b/,
  /\ba+s+s+h+o+l+e+/,
  /\bw+h+o+r+e+\b/,
  /\bp+[i1!]+s+s+/,
  /\bc+o+c+k+\b/,
  /\bp+u+s+s+y+\b/,
  /\bb+o+o+b+/,
  /\bt+i+t+s*\b/,
  /\bs+l+u+t+/,
  /\bm+o+t+h+e+r+f+u+c+k+/,
  // Hate patterns
  /\bhate\s+(all\s+)?(muslim|christian|jew|hindu|black|white|arab|asian|mexican|indian|pakistan)/,
  /\bkill\s+all\b/,
  /\bmurder\s+all\b/,
  /\b(all\s+)?(muslim|christian|jew|hindu|black|white|arab|asian)s?\s+(should|must|need to)\s+die\b/,
  // Threats (directed at others)
  /\b(i\s+)?(will|gonna|going to|want to)\s+(kill|murder|shoot|stab|rape|hurt|beat|attack)\s+(you|him|her|them|u)\b/,
  /\b(i'?ll|imma|i am)\s+(kill|murder|shoot|stab|rape|hurt|beat)\s+(you|him|her|them|u)\b/,
  // Self-harm directed at others
  /\b(you|u)\s+(should|must|need to|better)\s+(die|kill yourself|kys|end it)\b/,
  /\b(kys|k y s)\b/,
  // Sexual explicit
  /\b(suck|lick)\s+(my|his|her)\s+(dick|cock|pussy|balls)\b/,
  /\b(send|show)\s+(nudes|nude\s+pics)\b/,
  // Roman Urdu patterns (normalized / stripped forms)
  /\bm+a+d+a+r?c+h+o+d/,
  /\mb+h+e+n+c+h+o+d/,
  /\mb+e+h+e+n+c+h+o+d/,
  /\bc+h+o+o?t+i+y+a+/,
  /\bc+h+u+t+i+y+a+/,
  /\mb+h+o+s+d+i+/,
  /\mb+h+o+s+a+d/,
  /\br+a+n+d+i+/,
  /\bh+a+r+a+m+i+/,
  /\bh+a+r+a+m+k+h+o+r/,
  /\bg+a+n+d+u+/,
  /\bg+a+n+d+m+a+r/,
  /\bl+a+u?d+a+/,
  /\bl+o+d+a+/,
  /\bl+u+n+d+/,
  /\bk+a+m+i+n+/,
  /\bb+e+g+h+a+i+r+a+t/,
  /\bu+l+l+u+\s*k+e?\s*p+a+t+h/,
  /\bt+e+r+i+\s*m+a+a?/,
  /\bt+e+r+i+\s*b+e+h?a+n/,
  // Spam
  /\bhttps?:\/\/\S+/i,
  /\bwww\.\S+/i,
  /\b(bit\.ly|t\.co|tinyurl|goo\.gl|discord\.gg)\/\S+/i,
];

// First-person distress is allowed on a feelings wall; block instructions & directed harm.
const SELF_HARM_BLOCK_PATTERNS = [
  /\bhow\s+to\s+(kill|hang|cut)\s+(yourself|myself)\b/,
  /\b(best|easiest)\s+way\s+to\s+(die|kill yourself)\b/,
  /\b(kill|hang|cut)\s+yourself\b/,
  /\b(you|u)\s+should\s+(cut|hang|overdose)\b/,
  /\bgo\s+(cut|hang|overdose)\b/,
];

const SPAM_PATTERNS = [
  /\bhttps?:\/\/\S+/i,
  /\bwww\.\S+/i,
  /\b[a-z0-9-]+\.(com|net|org|xyz|ru|tk|ml|ga|cf|gq)\b/i,
  /\b(buy now|click here|free money|earn \$|crypto giveaway|dm me|whatsapp me|telegram me)\b/i,
  /\b(\w+)(\s+\1){4,}\b/i,
];

// ── Shield checks ────────────────────────────────────────────────────────────

function matchesPhrase(haystack, phrase) {
  return haystack.includes(phrase);
}

function matchesAnyPattern(haystack, patterns) {
  return patterns.some((p) => p.test(haystack));
}

function runShieldChecks(text, variants) {
  const { normalized, stripped, loose } = variants;
  const surfaces = [normalized, stripped, loose];

  for (const surface of surfaces) {
    for (const phrase of BLOCKED_PHRASES) {
      if (matchesPhrase(surface, phrase)) {
        return { blocked: true, category: 'phrase' };
      }
    }
  }

  for (const surface of surfaces) {
    if (matchesAnyPattern(surface, BLOCKED_PATTERNS)) {
      return { blocked: true, category: 'pattern' };
    }
  }

  if (!isBenignEmotional(text)) {
    for (const surface of surfaces) {
      if (matchesAnyPattern(surface, SELF_HARM_BLOCK_PATTERNS)) {
        return { blocked: true, category: 'self_harm' };
      }
    }
  }

  for (const surface of [normalized, text.toLowerCase()]) {
    if (matchesAnyPattern(surface, SPAM_PATTERNS)) {
      return { blocked: true, category: 'spam' };
    }
  }

  return { blocked: false };
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function runPinitShield(text) {
  if (wordCount(text) < 3) {
    return { safe: false, reason: TOO_SHORT_REASON };
  }

  const variants = prepareVariants(text);
  const result = runShieldChecks(text, variants);

  if (result.blocked) {
    return { safe: false, reason: BLOCK_REASON };
  }

  return { safe: true };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ safe: false, reason: 'No text provided' });
    }

    const result = runPinitShield(text);

    if (!result.safe) {
      console.log('Pinit Shield: blocked', {
        version: SHIELD_VERSION,
        category: result.reason === TOO_SHORT_REASON ? 'too_short' : 'content',
        length: text.length,
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('Pinit Shield error:', err.message || err);
    // Local-only: no external dependency; allow on unexpected internal errors
    // so a feelings wall stays open (report/admin remain backup).
    return res.status(200).json({ safe: true });
  }
}
