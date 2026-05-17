// Sprint 53 Voice QA — Brand normalization post-processor (server twin).
//
// Mirror of web/src/lib/transcriptNormalize.ts. Both layers normalize
// transcripts so that downstream advice prompts and stored memory rows
// always see the canonical brand spellings.
//
// Live path: web normalization runs in onFinal callback before transcript
// reaches the React state.
// Upload path: server normalization runs on the gpt-4o-transcribe response
// before persistence and before conversation analysis.
//
// Keep this file in sync with the web copy.

interface BrandMapping {
  pattern: RegExp;
  replacement: string;
}

// Keep in sync with web/src/lib/transcriptNormalize.ts. Cyrillic не работает
// с `\b`, поэтому используем Unicode-property lookbehind/lookahead.
const BRAND_MAPPINGS: BrandMapping[] = [
  // ГласНаб / Гласнаб / Глас Наб / Глас-Наб / ГласНап (б↔п) → Главснаб.
  {
    pattern: /(?<![\p{L}\p{N}])[Гг][лл][аа][сс][ \-]?[Нн][аа][бБпП](?![\p{L}\p{N}])/gu,
    replacement: 'Главснаб',
  },
];

export function normalizeTranscript(raw: string): string {
  if (!raw) return raw;
  let out = raw;
  for (const m of BRAND_MAPPINGS) {
    out = out.replace(m.pattern, m.replacement);
  }
  return out;
}
