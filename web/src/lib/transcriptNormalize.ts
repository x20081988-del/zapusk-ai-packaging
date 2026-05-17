// Sprint 53 Voice QA — Brand normalization post-processor.
//
// OpenAI Realtime / gpt-4o-transcribe принимают prompt-словарь как «bias»,
// а не как «enforce». На зашумлённом 8 kHz SIP-аудио модель может выбрать
// фонетически близкий, но неверный вариант названия портфельного проекта.
// Реальный пример (запись 2026-04-08): «Главснаб» транскрибирован как
// «ГласНаб» 2 раза в одной двухминутной записи.
//
// Этот хелпер делает финальный pass замены известных мис-распознаваний
// канонических брендов. Применяется:
//   • в onFinal callback live-транскрипции (web/src/lib/realtimeTranscription)
//   • в результате uploaded-аудио (server/src/services/openaiTranscribe)
//
// Маппинг сознательно консервативный — заменяем только варианты, которые
// заведомо не являются настоящими русскими словами в этой предметной
// области. «Главснаб» не имеет омонимов в инвестиционных переговорах.

interface BrandMapping {
  pattern: RegExp;
  replacement: string;
}

// Cyrillic не работает с `\b` (ASCII word boundary), поэтому используем явные
// перечисления + Unicode-property lookahead/lookbehind, чтобы не задевать
// субстроки внутри других слов. Маппинги сознательно консервативные —
// только варианты, которых заведомо нет как настоящих русских слов в
// инвестиционных переговорах.
const BRAND_MAPPINGS: BrandMapping[] = [
  // ГласНаб / Гласнаб / Глас Наб / Глас-Наб / ГласНап (б↔п) → Главснаб.
  // (?<![\p{L}\p{N}]) и (?![\p{L}\p{N}]) — кириллические word boundary.
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
