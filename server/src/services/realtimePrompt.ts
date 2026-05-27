// Sprint 49 hotfix 3 + 62.P9.HOTFIX — OpenAI Realtime transcription
// accepts at most 1024 chars in `session.audio.input.transcription.prompt`.
// Critical: `transcription.prompt` per OpenAI spec is a BIASING DICTIONARY
// («continuation context»), NOT a system prompt. If we pass imperative prose
// («Ты — модуль точной русской транскрипции...»), the model treats it as
// the start of a transcript and EMITS THE PROMPT BACK as transcription text
// — verified prod bug 2026-05-26 where founder saw the entire template
// body echo into the live transcript pane.
//
// Sprint 62.P9.HOTFIX strategy (replaces line-compression heuristic):
//   1. Locate the dictionary section by header («СЛОВАРЬ ТЕРМИНОВ» /
//      «GLOSSARY» / «DICTIONARY» / «БИЗНЕС-ИМЁН»).
//   2. Take ONLY content AFTER the dictionary header. The imperative
//      prose («Ты — модуль…», «ОСНОВНЫЕ ПРАВИЛА», «Не сокращай», etc.)
//      is dropped — it was the leak source.
//   3. Clean: strip bullets, empty lines, section headers; flatten
//      dictionary entries into a single comma-separated phrase list.
//   4. Truncate to MAX_PROMPT_CHARS by word boundary.
//
// If no dictionary section is found (custom user templates), we fall
// back to extracting bullet/list lines only, dropping all imperative
// prose. Worst case — empty prompt — we still send model+language, just
// without biasing.

const MAX_PROMPT_CHARS = 1000; // 1024 - safety buffer на счёт chars→tokens

const DICTIONARY_HEADER_PATTERNS: RegExp[] = [
  /словар[ьяи]/iu,           // СЛОВАРЬ, словаря, словари
  /glossar/iu,               // glossary
  /diction(ary|ar)/iu,       // dictionary
  /бизнес[-\s]?им[её]н/iu,   // БИЗНЕС-ИМЁН / бизнес имен
  /термин(ы|ов)/iu,          // термины / терминов
  /vocabular/iu,             // vocabulary
];

export interface BuiltPrompt {
  prompt: string;
  length: number;
  trimmed: boolean;
  /**
   * Strategy actually applied. Useful for ops to verify the sanitiser
   * stripped the imperative prose vs fell back to the bullet-only mode.
   *  - 'dictionary-extracted'     header found, took content after it
   *  - 'bullet-only'              no header, kept only list lines
   *  - 'empty'                    nothing usable; prompt is empty string
   */
  strategy: 'dictionary-extracted' | 'bullet-only' | 'empty';
}

export function buildRealtimePrompt(rawBody: string): BuiltPrompt {
  const trimmed = (rawBody ?? '').trim();
  if (!trimmed) return { prompt: '', length: 0, trimmed: false, strategy: 'empty' };

  const lines = trimmed.split(/\r?\n/);
  // Locate dictionary section header line index (first match).
  let dictStart = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const ln = lines[i].trim();
    if (!ln) continue;
    if (isDictionaryHeader(ln)) {
      dictStart = i;
      break;
    }
  }

  let strategy: BuiltPrompt['strategy'];
  let kept: string[];
  if (dictStart >= 0) {
    // Take lines AFTER the dictionary header. Drop any subsequent section
    // headers (they'd be sub-sections we don't want to include).
    kept = [];
    for (let i = dictStart + 1; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line) continue;
      if (isSectionHeader(line)) break; // stop at next big section
      kept.push(line);
    }
    strategy = 'dictionary-extracted';
  } else {
    // Fallback: keep only bullet / list / comma-separated lines. Drop
    // every imperative sentence (those almost always end with «.»).
    kept = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (isSectionHeader(line)) continue;
      if (looksLikeBulletOrList(line)) kept.push(line);
    }
    strategy = kept.length > 0 ? 'bullet-only' : 'empty';
  }

  // Strip leading bullet markers («- », «• », «· ») so the prompt reads
  // as a flat phrase list to the model.
  const cleaned = kept.map((l) => l.replace(/^[•·\-—–*]\s+/u, '').trim()).filter(Boolean);

  let compact = cleaned.join(', ');
  let didTrim = false;
  if (compact.length > MAX_PROMPT_CHARS) {
    didTrim = true;
    compact = compact.slice(0, MAX_PROMPT_CHARS);
    const lastBreak = Math.max(compact.lastIndexOf(' '), compact.lastIndexOf(','));
    if (lastBreak > MAX_PROMPT_CHARS * 0.8) compact = compact.slice(0, lastBreak);
    compact = compact.replace(/[,\s]+$/u, '').trim();
  }

  if (!compact) return { prompt: '', length: 0, trimmed: didTrim, strategy: 'empty' };

  return { prompt: compact, length: compact.length, trimmed: didTrim, strategy };
}

// Dictionary header detection — must look like a real section header
// (all-uppercase Russian core, no trailing period) AND match a known
// dictionary label. Strict so it doesn't false-fire on bullet lines that
// happen to contain the word «термины» («Английские термины оставляй…»).
function isDictionaryHeader(line: string): boolean {
  if (line.length > 100) return false;
  // Sentences end with a period — they're never section headers.
  if (line.endsWith('.')) return false;
  // Strip parenthetical hints like «(приоритет распознавания)» before the
  // case check — they're allowed to be lowercase.
  const core = line.replace(/\([^)]*\)/gu, '').trim();
  if (!core) return false;
  const letters = core.replace(/[^\p{L}]/gu, '');
  if (letters.length < 4) return false;
  const isAllUpper = letters === letters.toUpperCase();
  if (!isAllUpper) return false;
  return DICTIONARY_HEADER_PATTERNS.some((re) => re.test(line));
}

// "ОСНОВНЫЕ ПРАВИЛА", "СЛОВАРЬ ТЕРМИНОВ", "ЧЕГО НЕ ДЕЛАТЬ" — секционные
// заголовки в нашем seed. Эвристика: <60 символов, нет точки, и содержит
// либо только UPPERCASE-русские буквы, либо markdown `#`.
function isSectionHeader(line: string): boolean {
  if (line.length > 60) return false;
  if (line.startsWith('#')) return true;
  if (line.endsWith('.') || line.endsWith(':') || line.endsWith('»')) return false;
  const letters = line.replace(/[^\p{L}]/gu, '');
  if (letters.length < 4) return false;
  return letters === letters.toUpperCase();
}

function looksLikeBulletOrList(line: string): boolean {
  return /^[•·\-—–*]\s+/u.test(line) || (line.includes(',') && !line.endsWith('.'));
}
