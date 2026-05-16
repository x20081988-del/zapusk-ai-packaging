// Sprint 49 hotfix 3 — OpenAI Realtime transcription accepts at most 1024
// chars in `session.audio.input.transcription.prompt`. Шаблон
// `realtime_transcription` редактируется суперадмином и может вырасти > 1024
// (заголовки, объяснения, пустые строки). Этот helper компактит body, чтобы
// в OpenAI всегда летел prompt в пределах лимита, без потери словаря терминов.
//
// Стратегия:
//   1. Стрипаем пустые строки и markdown-заголовки (UPPERCASE-only / ALL-CAPS
//      строки длиной < 60 — это секционные заголовки в нашем seed body).
//   2. Сохраняем строки-инструкции (начинаются с заглавной) и dictionary lines
//      (начинаются с `-` или `•`).
//   3. Если результат всё ещё > MAX — обрезаем по последнему word-boundary.
//
// Возвращает финальный prompt + флаг, был ли он сжат.

const MAX_PROMPT_CHARS = 1000; // 1024 - safety buffer на счёт chars→tokens

export interface BuiltPrompt {
  prompt: string;
  length: number;
  trimmed: boolean;
}

export function buildRealtimePrompt(rawBody: string): BuiltPrompt {
  const trimmed = (rawBody ?? '').trim();
  if (!trimmed) return { prompt: '', length: 0, trimmed: false };

  if (trimmed.length <= MAX_PROMPT_CHARS) {
    return { prompt: trimmed, length: trimmed.length, trimmed: false };
  }

  // Линиовая компрессия: убираем пустые строки и section headers.
  const lines = trimmed.split(/\r?\n/);
  const kept: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (isSectionHeader(line)) continue;
    kept.push(line);
  }
  let compact = kept.join('\n');

  if (compact.length > MAX_PROMPT_CHARS) {
    compact = compact.slice(0, MAX_PROMPT_CHARS);
    // Обрезаем по последнему word-boundary, чтобы не оборвать слово посередине.
    const lastBreak = Math.max(compact.lastIndexOf(' '), compact.lastIndexOf('\n'));
    if (lastBreak > MAX_PROMPT_CHARS * 0.8) compact = compact.slice(0, lastBreak);
    compact = compact.trim();
  }

  return { prompt: compact, length: compact.length, trimmed: true };
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
