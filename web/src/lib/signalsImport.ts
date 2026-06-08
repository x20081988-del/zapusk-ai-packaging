// Sprint 62.P15 — слой импорта реальных результатов «TG-BOT + Outreach».
//
// Реальный Telegram НЕ подключаем. Вместо живой интеграции — оффлайн-импорт:
// внешний Python-проект экспортирует свои obligation/contact записи в файл
// `public/signals.import.json`, а здесь мы преобразуем их в наш формат Signal
// и показываем в Signals Feed. Если файла нет, он пуст или сломан — Signals Feed
// откатывается на mock-набор (SIGNALS из lib/outreach).
//
// Преобразование эвристическое: исходные obligation не несут явного типа
// контакта и типа сигнала, поэтому мы их выводим из kind / scheduling_status /
// category / возраста сообщения. Где доказательств мало — ставим unknown и
// отражаем это в confidence и risk_of_error (не называем человека инвестором
// без подтверждения).

import type {
  Signal, ContactType, SignalType, SignalSource, Confidence, PipelineStage, Origin,
} from './outreach';

// ── сырой формат экспорта TG-BOT + Outreach ─────────────────────────────────
// Повторяет модель внешнего проекта (obligation + contact). Все поля
// опциональны: экспорт может быть частичным.
export interface ImportedContact {
  chat_id: number | string;
  username?: string;
  name?: string;
  updated_ts?: number;
}

export interface ImportedObligation {
  id: string | number;
  chat_id?: number | string;
  chat_name?: string;
  message_id?: number | string;
  message_link?: string;
  source_text?: string;
  kind?: string;              // mine | theirs | followup
  who?: string;
  to_whom?: string;
  obligation_text?: string;
  category?: string;          // investor | project | zapusk_ai | partnership | exit | ...
  created_ts?: number;        // сек или мс
  due_at?: string;
  due_ts?: number | null;
  confidence?: number;        // 0..1
  status?: string;
  notes?: string;
  extracted_ts?: number;
  scheduling_status?: string; // time_agreed | needs_time | needs_day | needs_confirm | scheduled | skipped
  calendar_event_id?: string;
  zoom_link?: string;
  // расширения экспорта (если внешний бот их кладёт):
  draft?: string;             // готовый черновик от бота
  contact_type_hint?: string; // явный тип контакта, если экспорт его знает
}

export interface ImportedSignalFile {
  source?: string;
  exportedAt?: string;
  note?: string;
  contacts?: ImportedContact[];
  obligations?: ImportedObligation[];
}

const VALID_CONTACT_TYPES: ContactType[] = [
  'investor', 'fund', 'founder', 'partner', 'media', 'expert', 'past_relationship', 'unknown',
];

function tsToSeconds(ts?: number): number | undefined {
  if (ts == null) return undefined;
  return ts > 1e12 ? Math.floor(ts / 1000) : ts; // мс → сек
}

function daysAgo(ts?: number): number | undefined {
  const sec = tsToSeconds(ts);
  if (sec == null) return undefined;
  const diff = Math.floor(Date.now() / 1000) - sec;
  return Math.max(0, Math.round(diff / 86400));
}

function bucketConfidence(c?: number): Confidence {
  if (c == null) return 'low';
  if (c >= 0.75) return 'high';
  if (c >= 0.5) return 'medium';
  return 'low';
}

function inferContactType(ob: ImportedObligation, conf: Confidence): ContactType {
  if (ob.contact_type_hint && VALID_CONTACT_TYPES.includes(ob.contact_type_hint as ContactType)) {
    return ob.contact_type_hint as ContactType;
  }
  let base: ContactType;
  switch (ob.category) {
    case 'investor':
    case 'exit': base = 'investor'; break;
    case 'partnership': base = 'partner'; break;
    case 'project': base = 'founder'; break;
    case 'zapusk_ai': base = 'partner'; break;
    default: base = 'unknown';
  }
  // не называем инвестором без доказательств: на низкой уверенности — unknown.
  if (base === 'investor' && conf === 'low') return 'unknown';
  return base;
}

function inferSignalType(ob: ImportedObligation, age?: number): SignalType {
  const ss = ob.scheduling_status;
  if (ss === 'scheduled') return 'past_zoom';
  if (ss === 'time_agreed' || ss === 'needs_time' || ss === 'needs_day' || ss === 'needs_confirm') {
    return 'agreed_call';
  }
  if (ob.zoom_link) return 'past_zoom';
  if (ob.kind === 'followup' || ob.kind === 'mine') return 'we_didnt_reply';
  if (age != null && age > 120) return 'long_silence';
  if (ob.category === 'investor' || ob.category === 'exit') return 'discussing_investments';
  if (ob.category === 'partnership') return 'seeking_partners';
  return 'relevant_chat';
}

function inferSource(ob: ImportedObligation): SignalSource {
  if (ob.scheduling_status === 'scheduled' || ob.zoom_link) return 'zoom_history';
  if (ob.chat_name || ob.message_link) return 'telegram_chat';
  return 'past_dialog';
}

function inferStage(ob: ImportedObligation): PipelineStage {
  const ss = ob.scheduling_status;
  if (ss === 'scheduled' || ss === 'time_agreed') return 'zoom_scheduled';
  if (ss === 'needs_confirm') return 'outreach';
  if (ss === 'needs_time' || ss === 'needs_day') return 'reply';
  if (ob.kind === 'followup') return 'follow_up';
  if (ob.zoom_link) return 'zoom_done';
  return 'signal';
}

function ageLabel(age?: number): string {
  if (age == null) return '';
  if (age === 0) return 'сегодня';
  if (age === 1) return 'вчера';
  return `${age} дн назад`;
}

function buildWhyImportant(ob: ImportedObligation, sigType: SignalType, ball: boolean): string {
  if (ball) return 'Мяч на нашей стороне — нужен ответ или шаг с нашей стороны.';
  if (sigType === 'agreed_call') return 'Идёт согласование встречи — важно не потерять momentum.';
  if (sigType === 'past_zoom') return 'Контакт уже был на Zoom — стадия горячая.';
  if (sigType === 'long_silence') return 'Контакт давно молчит — повод слабый, нужен новый триггер.';
  if (sigType === 'discussing_investments') return 'Активный интерес к инвест-теме прямо сейчас.';
  return 'Повод зафиксирован — стоит оценить приоритет.';
}

function buildWhyRelevant(ob: ImportedObligation): string {
  switch (ob.category) {
    case 'investor':
    case 'exit': return 'Тема инвестиций — потенциально релевантно проекту.';
    case 'partnership': return 'Партнёрский трек — может усилить проект.';
    case 'project': return 'Это фаундер / проект, не инвестор — другой сценарий работы.';
    case 'zapusk_ai': return 'Касается Zapusk AI напрямую.';
    default: return `Категория: ${ob.category || 'не определена'}.`;
  }
}

function buildAction(ob: ImportedObligation, sigType: SignalType, ball: boolean, ctype: ContactType): string {
  if (ctype === 'media') return 'Мониторить, не писать как человеку.';
  if (ball) return 'Ответить и закрыть открытый вопрос.';
  if (sigType === 'agreed_call') return 'Подтвердить время и поставить Zoom.';
  if (sigType === 'discussing_investments') return 'Мягкий заход, предложить короткий созвон.';
  if (sigType === 'long_silence') return 'Не реактивировать вслепую — дождаться свежего повода.';
  return 'Оценить контекст, при релевантности — мягкий заход.';
}

function buildRisk(conf: Confidence, ctype: ContactType): string {
  if (conf === 'low') return 'Низкая уверенность авто-извлечения — проверьте исходное сообщение.';
  if (ctype === 'unknown') return 'Тип контакта не подтверждён — не называйте инвестором без проверки.';
  return 'Контекст мог измениться с момента сигнала — сверьтесь перед заходом.';
}

function buildNextStep(ob: ImportedObligation, ball: boolean): string {
  if (ob.due_at) return `Срок: ${ob.due_at}.`;
  if (ball) return 'Ответить сегодня.';
  return 'Поставить в очередь и следить за темой.';
}

// ── конвертер: obligation → Signal ──────────────────────────────────────────
export function convertToSignals(file: ImportedSignalFile): Signal[] {
  const obligations = Array.isArray(file.obligations) ? file.obligations : [];
  const contacts = Array.isArray(file.contacts) ? file.contacts : [];
  const byChat = new Map<string, ImportedContact>();
  for (const c of contacts) byChat.set(String(c.chat_id), c);

  const out: Signal[] = [];
  for (const ob of obligations) {
    if (ob == null || ob.id == null) continue;
    if (ob.status === 'done' || ob.scheduling_status === 'skipped') continue;

    const contact = ob.chat_id != null ? byChat.get(String(ob.chat_id)) : undefined;
    const conf = bucketConfidence(ob.confidence);
    const ctype = inferContactType(ob, conf);
    const age = daysAgo(ob.created_ts);
    const sigType = inferSignalType(ob, age);
    const source = inferSource(ob);
    const ball =
      ob.kind === 'mine' || ob.kind === 'followup' ||
      ['needs_time', 'needs_confirm', 'needs_day'].includes(ob.scheduling_status ?? '');

    const contactName =
      contact?.name || ob.who || ob.to_whom || (ob.chat_name ? `Контакт · ${ob.chat_name}` : 'Контакт');
    const handle = contact?.username ? contact.username.replace(/^@/, '') : undefined;

    const whyFoundBits = [
      ob.chat_name ? `Извлечено из «${ob.chat_name}»` : 'Извлечено из диалога',
      ageLabel(age),
    ].filter(Boolean).join(', ');
    const whyFound = ob.obligation_text ? `${whyFoundBits}. ${ob.obligation_text}` : `${whyFoundBits}.`;

    // черновик не фабрикуем: берём только если экспорт его принёс. media — без черновика.
    const draftMessage = ctype === 'media' ? undefined : (ob.draft || undefined);

    out.push({
      id: `imp-${ob.id}`,
      contactName,
      contactType: ctype,
      signalType: sigType,
      signalSource: source,
      signalText: ob.source_text || ob.obligation_text || 'Сигнал без текста.',
      whyFound,
      whyImportant: buildWhyImportant(ob, sigType, ball),
      whyRelevant: buildWhyRelevant(ob),
      actionRecommendation: buildAction(ob, sigType, ball, ctype),
      riskOfError: buildRisk(conf, ctype),
      nextStep: buildNextStep(ob, ball),
      draftMessage,
      confidence: conf,
      handle,
      origin: (contact ? 'existing_base' : 'new_contact') as Origin,
      projectFit: ['investor', 'partnership', 'exit'].includes(ob.category ?? ''),
      pipelineStage: inferStage(ob),
      ballOnOurSide: ball || undefined,
      whenToFollowUp: ob.due_at || (ball ? 'Сегодня' : undefined),
    });
  }
  return out;
}

export interface ImportedResult {
  signals: Signal[];
  source: 'import';
  exportedAt?: string;
  note?: string;
}

// Грузим drop-in файл в рантайме (не bundling), чтобы можно было подменять
// экспорт без пересборки. Любая проблема → null (fallback на mock).
export async function loadImportedSignals(): Promise<ImportedResult | null> {
  try {
    const res = await fetch('/signals.import.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const file = (await res.json()) as ImportedSignalFile;
    if (!file || !Array.isArray(file.obligations) || file.obligations.length === 0) return null;
    const signals = convertToSignals(file);
    if (signals.length === 0) return null;
    return { signals, source: 'import', exportedAt: file.exportedAt, note: file.note };
  } catch {
    return null;
  }
}
