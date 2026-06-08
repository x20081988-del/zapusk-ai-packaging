// Sprint 62.P16 — слой импорта реальных результатов «TG-BOT + Outreach».
//
// Реальный Telegram НЕ подключаем. Внешний Python-проект экспортирует свои
// сигналы в файл новой схемы (см. ImportedSignal), а здесь мы преобразуем их
// в наш внутренний формат Signal и показываем в Signals Feed.
//
// Два источника данных (выбор режима — в OutreachEngine):
//   • Owner Mode  → /signals.import.json — реальные сигналы. Файл НЕ коммитится
//     (в .gitignore), генерируется владельцем локально. Нет файла → пустое
//     состояние Owner Mode.
//   • Safe Demo Mode → /signals.demo.json — обезличенные / синтетические сигналы.
//     Нет файла → fallback на mock-набор SIGNALS из lib/outreach.
//
// Преобразование честное: где доказательств мало — ставим unknown и отражаем
// это в confidence и risk_of_error. Канал/медиа не трактуем как человека.

import type {
  Signal, ContactType, SignalType, SignalSource, Confidence, PipelineStage, Origin, Priority,
} from './outreach';

// ── новая схема экспорта сигналов (Sprint 62.P16) ───────────────────────────
// Каждый сигнал самодостаточен (без отдельной таблицы контактов). Все поля,
// кроме signal_id, опциональны: экспорт может быть частичным.
export interface ImportedSignal {
  signal_id: string | number;
  signal_type?: string;        // telegram_investor_signal | ball_on_our_side | ...
  signal_source?: string;      // telegram_chat | channel_comment | investor_base | ...
  contact_name?: string;
  contact_username?: string;   // @handle — попадает только в Owner-файл
  contact_type?: string;       // investor | fund | founder | partner | media | ...
  source_title?: string;       // название чата/источника
  source_link?: string;        // ссылка на сообщение — только Owner-файл
  signal_text?: string;
  why_found?: string;
  why_relevant?: string;
  recommended_action?: string;
  draft_message?: string;
  next_step?: string;
  risk_of_error?: string;
  confidence?: string;         // high | medium | low
  priority?: string;           // high | medium | low
  created_at?: string;
  expires_at?: string;
  status?: string;             // open | done | closed | skipped | ...
}

export interface ImportedSignalFile {
  source?: string;
  exportedAt?: string;
  note?: string;
  mode?: 'demo' | 'owner';
  signals?: ImportedSignal[];
}

const VALID_CONTACT_TYPES: ContactType[] = [
  'investor', 'fund', 'founder', 'partner', 'media', 'expert', 'past_relationship', 'unknown',
];
const VALID_SOURCES: SignalSource[] = [
  'telegram_chat', 'channel_comment', 'investor_base', 'past_dialog', 'zoom_history', 'crm', 'manual',
];

// внешний тип сигнала → внутренний SignalType (для лейбла / фильтра / воронки).
const SIGNAL_TYPE_MAP: Record<string, SignalType> = {
  telegram_investor_signal: 'discussing_investments',
  money_opportunity: 'discussing_investments',
  warm_contact_stale: 'long_silence',
  relationship_reactivation: 'long_silence',
  lost_opportunity: 'long_silence',
  ball_on_our_side: 'we_didnt_reply',
  reply_opportunity: 'we_didnt_reply',
  agreed_meeting: 'agreed_call',
  needs_scheduling: 'agreed_call',
};

// типы, где мяч на нашей стороне (нужен наш шаг).
const BALL_TYPES = new Set([
  'ball_on_our_side', 'reply_opportunity', 'needs_scheduling', 'agreed_meeting',
]);
// типы, предполагающие уже существующие отношения.
const EXISTING_TYPES = new Set([
  'warm_contact_stale', 'relationship_reactivation', 'lost_opportunity',
  'ball_on_our_side', 'reply_opportunity', 'agreed_meeting', 'needs_scheduling',
]);

function bucketConfidence(c?: string): Confidence {
  return c === 'high' || c === 'medium' || c === 'low' ? c : 'low';
}

function bucketPriority(p?: string): Priority | undefined {
  return p === 'high' || p === 'medium' || p === 'low' ? p : undefined;
}

function inferContactType(s: ImportedSignal, conf: Confidence): ContactType {
  const raw = s.contact_type;
  if (raw && VALID_CONTACT_TYPES.includes(raw as ContactType)) {
    const t = raw as ContactType;
    // не называем инвестором без доказательств: на низкой уверенности — unknown.
    if (t === 'investor' && conf === 'low') return 'unknown';
    return t;
  }
  return 'unknown';
}

function inferSignalType(s: ImportedSignal): SignalType {
  if (s.signal_type && SIGNAL_TYPE_MAP[s.signal_type]) return SIGNAL_TYPE_MAP[s.signal_type];
  return 'relevant_chat';
}

function inferSource(s: ImportedSignal): SignalSource {
  if (s.signal_source && VALID_SOURCES.includes(s.signal_source as SignalSource)) {
    return s.signal_source as SignalSource;
  }
  return 'past_dialog';
}

function inferStage(s: ImportedSignal): PipelineStage {
  switch (s.signal_type) {
    case 'agreed_meeting':
    case 'needs_scheduling': return 'zoom_scheduled';
    case 'ball_on_our_side':
    case 'reply_opportunity': return 'outreach';
    case 'warm_contact_stale':
    case 'relationship_reactivation':
    case 'lost_opportunity': return 'follow_up';
    default: return 'signal';
  }
}

function buildWhyImportant(s: ImportedSignal, ball: boolean): string {
  if (ball) return 'Мяч на нашей стороне — нужен ответ или шаг с нашей стороны.';
  switch (s.signal_type) {
    case 'agreed_meeting':
    case 'needs_scheduling': return 'Идёт согласование встречи — важно не потерять momentum.';
    case 'telegram_investor_signal':
    case 'money_opportunity': return 'Активный интерес к инвест-теме прямо сейчас — окно для тёплого захода.';
    case 'warm_contact_stale':
    case 'relationship_reactivation': return 'Тёплый контакт остывает — реактивация сейчас дешевле нового захода.';
    case 'lost_opportunity': return 'Повод почти упущен — без свежего триггера заход будет слабым.';
    default:
      return s.priority === 'high'
        ? 'Высокий приоритет — стоит обработать в первую очередь.'
        : 'Повод зафиксирован — стоит оценить приоритет.';
  }
}

function fallbackText(...parts: (string | undefined)[]): string {
  for (const p of parts) if (p && p.trim()) return p;
  return '—';
}

// ── конвертер: ImportedSignal → Signal ──────────────────────────────────────
// ownerMode=false (Safe Demo) — НЕ переносим handle/sourceLink, даже если они
// случайно попали в файл (защита от утечки на уровне рендера данных).
export function convertToSignals(file: ImportedSignalFile, ownerMode: boolean): Signal[] {
  const list = Array.isArray(file.signals) ? file.signals : [];
  const out: Signal[] = [];

  for (const s of list) {
    if (s == null || s.signal_id == null) continue;
    const status = (s.status || '').toLowerCase();
    if (status === 'done' || status === 'closed' || status === 'skipped') continue;

    const conf = bucketConfidence(s.confidence);
    const ctype = inferContactType(s, conf);
    const sigType = inferSignalType(s);
    const source = inferSource(s);
    const ball = BALL_TYPES.has(s.signal_type ?? '');
    const priority = bucketPriority(s.priority);

    const handle = ownerMode && s.contact_username
      ? s.contact_username.replace(/^@/, '')
      : undefined;
    const sourceLink = ownerMode ? (s.source_link || undefined) : undefined;
    // media/канал — не предлагаем писать как человеку.
    const draftMessage = ctype === 'media' ? undefined : (s.draft_message || undefined);

    const whyFound = fallbackText(
      s.why_found,
      s.source_title ? `Источник: ${s.source_title}.` : undefined,
    );

    out.push({
      id: `imp-${s.signal_id}`,
      contactName: fallbackText(s.contact_name, ctype === 'media' ? 'Канал / медиа' : 'Контакт'),
      contactType: ctype,
      signalType: sigType,
      signalSource: source,
      signalText: fallbackText(s.signal_text, s.why_found, 'Сигнал без текста.'),
      whyFound,
      whyImportant: buildWhyImportant(s, ball),
      whyRelevant: fallbackText(s.why_relevant, 'Релевантность требует проверки.'),
      actionRecommendation: fallbackText(
        s.recommended_action,
        ball ? 'Ответить и закрыть открытый вопрос.' : 'Оценить контекст, при релевантности — мягкий заход.',
      ),
      riskOfError: fallbackText(
        s.risk_of_error,
        conf === 'low' ? 'Низкая уверенность авто-извлечения — проверьте исходный контекст.'
          : ctype === 'unknown' ? 'Тип контакта не подтверждён — не называйте инвестором без проверки.'
          : 'Контекст мог измениться с момента сигнала — сверьтесь перед заходом.',
      ),
      nextStep: fallbackText(
        s.next_step,
        s.expires_at ? `Срок: ${s.expires_at}.` : (ball ? 'Ответить сегодня.' : 'Поставить в очередь и следить за темой.'),
      ),
      draftMessage,
      confidence: conf,
      handle,
      origin: (EXISTING_TYPES.has(s.signal_type ?? '') ? 'existing_base' : 'new_contact') as Origin,
      projectFit: ctype === 'investor' || ctype === 'fund'
        || ['telegram_investor_signal', 'money_opportunity'].includes(s.signal_type ?? ''),
      pipelineStage: inferStage(s),
      ballOnOurSide: ball || undefined,
      whenToFollowUp: ball ? 'Сегодня' : (s.expires_at || undefined),
      sourceTitle: s.source_title || undefined,
      sourceLink,
      priority,
    });
  }
  return out;
}

export interface ImportedResult {
  signals: Signal[];
  exportedAt?: string;
  note?: string;
}

// Грузим drop-in файл в рантайме (не bundling), чтобы можно было подменять
// экспорт без пересборки. Любая проблема → null.
async function loadFile(url: string, ownerMode: boolean): Promise<ImportedResult | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const file = (await res.json()) as ImportedSignalFile;
    if (!file || !Array.isArray(file.signals) || file.signals.length === 0) return null;
    const signals = convertToSignals(file, ownerMode);
    if (signals.length === 0) return null;
    return { signals, exportedAt: file.exportedAt, note: file.note };
  } catch {
    return null;
  }
}

// Safe Demo Mode → /signals.demo.json (обезличено). Нет файла → null (fallback на mock).
export function loadDemoSignals(): Promise<ImportedResult | null> {
  return loadFile('/signals.demo.json', false);
}

// Owner Mode → /signals.import.json (реальные данные). Нет файла → null (пустое состояние).
export function loadOwnerSignals(): Promise<ImportedResult | null> {
  return loadFile('/signals.import.json', true);
}
