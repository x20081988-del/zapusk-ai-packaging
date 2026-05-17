// Shared diff helper for Sprint 57 regression suites. Mirror of
// server/src/services/transcriptDiff.ts so node-runnable scripts can
// use it without TypeScript.

const SUSPICIOUS_AI_PROMPT_PHRASES = [
  /^Чек или доля\??$/i,
  /^Ну,? если вы настаиваете[.…]{0,3}$/i,
];
const HALLUCINATION_MAX_CHARS = 60;

function splitSentences(text) {
  if (!text) return [];
  return text.split(/(?<=[.!?…])\s+|(?:\r?\n)+/g).map((s) => s.trim()).filter((s) => s);
}
function tokenize(text) {
  if (!text) return new Set();
  return new Set(
    text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((t) => t.length >= 3),
  );
}
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const u = a.size + b.size - inter;
  return u === 0 ? 0 : inter / u;
}
function findMatch(s, others) {
  const t = tokenize(s);
  if (t.size === 0) return true;
  for (const o of others) if (jaccard(t, o.tokens) >= 0.4) return true;
  return false;
}

export function compareDraftVsCleanJs(draft, clean) {
  const ds = splitSentences(draft);
  const cs = splitSentences(clean);
  const di = ds.map((text) => ({ text, tokens: tokenize(text) }));
  const ci = cs.map((text) => ({ text, tokens: tokenize(text) }));
  const removed = ds.filter((s) => !findMatch(s, ci));
  const added = cs.filter((s) => !findMatch(s, di));
  const hallu = removed.filter((s) =>
    s.length <= HALLUCINATION_MAX_CHARS &&
    SUSPICIOUS_AI_PROMPT_PHRASES.some((re) => re.test(s.trim())),
  );
  return {
    similarity: jaccard(tokenize(draft), tokenize(clean)),
    addedPhrases: added,
    removedPhrases: removed,
    hallucinationCandidates: hallu,
  };
}
