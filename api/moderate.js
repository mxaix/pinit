export const config = { api: { bodyParser: true } };

const OPENAI_MODERATION_URL = 'https://api.openai.com/v1/moderations';
const OPENAI_TIMEOUT_MS = 12000;

const REASONS = {
  local: 'This note contains language that isn\u2019t allowed on Pinit. Please revise it.',
  tooShort: 'Too short \u2014 say something meaningful',
  apiFail: 'We could not verify your note right now. Please try again in a moment.',
  hate: 'This note contains hateful content. Please revise it.',
  harassment: 'This note contains harassing or abusive language.',
  violence: 'This note contains violent or threatening content.',
  sexual: 'Sexual content is not allowed on Pinit.',
  selfHarm:
    'If you are struggling, please reach out to someone you trust or a local crisis line. This wall cannot host self-harm content.',
  default: 'This note could not be accepted. Please revise it.',
};

const BLOCKED_PHRASES = [
  'chink', 'spic', 'wetback', 'kike', 'raghead', 'towelhead', 'sandnigger',
  'kill yourself', 'kys', 'bomb threat', 'blow up', 'shoot everyone',
  'death to', 'want to kill', 'going to kill', 'gonna kill', 'will kill',
  'want to murder', 'going to murder', 'will murder',
  'want to hurt', 'going to hurt', 'will hurt',
  'want to shoot', 'going to shoot', 'will shoot',
  'want to stab', 'going to stab', 'will stab',
  'want to bomb', 'going to bomb', 'will bomb',
  'should die', 'must die', 'needs to die',
  'xxx', 'pornhub', 'onlyfans', 'sex tape',
];

const BLOCKED_PATTERNS = [
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

const BENIGN_EMOTIONAL_PATTERNS = [
  /\bi\s*['']?m\s+feeling?\s+(lost|lonely|tired|sad|empty|hopeless|down|low|broken|alone|angry|grateful|peaceful)\b/i,
  /\bi\s+feel\s+(lost|lonely|tired|sad|empty|hopeless|down|low|broken|alone|angry|grateful|peaceful)\b/i,
  /\bfeeling\s+(lost|lonely|tired|sad|empty|hopeless|down|low|broken|alone|angry|grateful|peaceful)\b/i,
  /\bi\s+miss\b/i,
  /\bit\s+hurts\b/i,
  /\blife\s+is\s+hard\b/i,
  /\btoday\s+(was|is)\s+(hard|rough|heavy)\b/i,
];

function runLocalFilter(text) {
  const t = text.toLowerCase();

  for (const phrase of BLOCKED_PHRASES) {
    if (t.includes(phrase)) {
      return { safe: false, reason: REASONS.local };
    }
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(t)) {
      return { safe: false, reason: REASONS.local };
    }
  }

  if (text.trim().split(/\s+/).filter(Boolean).length < 3) {
    return { safe: false, reason: REASONS.tooShort };
  }

  return { safe: true };
}

function isBenignEmotional(text) {
  return BENIGN_EMOTIONAL_PATTERNS.some((pattern) => pattern.test(text));
}

function getOpenAIBlockReason(categories, text) {
  const c = categories || {};

  if (isBenignEmotional(text)) {
    const onlySoftSelfHarm =
      c['self-harm'] &&
      !c['self-harm/intent'] &&
      !c['self-harm/instructions'] &&
      !c.hate &&
      !c['hate/threatening'] &&
      !c.harassment &&
      !c['harassment/threatening'] &&
      !c.violence &&
      !c['violence/graphic'] &&
      !c.sexual &&
      !c['sexual/minors'];

    if (onlySoftSelfHarm) return null;
  }

  if (c['sexual/minors'] || c.sexual) return REASONS.sexual;
  if (c['hate/threatening'] || c.hate) return REASONS.hate;
  if (c['harassment/threatening'] || c.harassment) return REASONS.harassment;
  if (c['violence/graphic'] || c.violence) return REASONS.violence;
  if (c['self-harm/intent'] || c['self-harm/instructions'] || c['self-harm']) {
    return REASONS.selfHarm;
  }

  return REASONS.default;
}

function evaluateOpenAIResult(result, text) {
  if (!result || !result.flagged) return { safe: true };

  const reason = getOpenAIBlockReason(result.categories, text);
  if (!reason) return { safe: true };

  return { safe: false, reason };
}

async function moderateWithOpenAI(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_MODERATION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input: text,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`OpenAI moderation HTTP ${response.status}: ${detail}`);
    }

    const data = await response.json();
    const result = data?.results?.[0];
    if (!result) {
      throw new Error('OpenAI moderation returned no result');
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ safe: false, reason: 'No text provided' });
    }

    const local = runLocalFilter(text);
    if (!local.safe) {
      return res.status(200).json(local);
    }

    let openaiResult;
    try {
      openaiResult = await moderateWithOpenAI(text);
    } catch (err) {
      console.error('OpenAI moderation error:', err);
      return res.status(503).json({ safe: false, reason: REASONS.apiFail });
    }

    const openai = evaluateOpenAIResult(openaiResult, text);
    if (!openai.safe) {
      return res.status(200).json(openai);
    }

    return res.status(200).json({ safe: true });
  } catch (err) {
    console.error('Moderation error:', err);
    return res.status(503).json({ safe: false, reason: REASONS.apiFail });
  }
}
