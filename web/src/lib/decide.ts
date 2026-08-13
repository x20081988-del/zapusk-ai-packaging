import { api } from './api';
import { getAuth } from './auth';

// Sprint 63.P1 - очередь решений владельца.
//
// Форма элемента задана источником (decide_pack.build_pack в telegram-agent), а не
// здесь. Здесь только описание того, что реально приходит по проводу.

export interface DecideItem {
  kind: string;
  id: string;
  who: string;
  title: string;
  context?: string;
  body?: string;
  hint?: string;
  priority?: number;
  /**
   * Набор действий для КОНКРЕТНОГО элемента, присланный источником.
   *
   * Тип намеренно `string[]`, а не union: источник вправе завести новое действие, и
   * фронт не должен от этого падать на типизации. По той же причине кнопки строятся
   * из этого массива, а не из таблицы «вид -> кнопки» на нашей стороне - такая
   * таблица расходится с источником молча.
   */
  actions: string[];
  task_id?: number;
  assignee?: string;
  created_at?: string | number;
}

export interface DecidePack {
  items: DecideItem[];
  total: number;
  shown: number;
  date: string;
  /**
   * Виды, чей источник не отдался при сборке пакета.
   *
   * Каждый коллектор в источнике ловит свое исключение и возвращает пустой список,
   * чтобы пакет собрался даже когда один источник лежит. Без этого поля результат
   * неотличим от полной очереди: пульт лег - вид «Черновик контакту» исчез целиком,
   * а экран нарисовал ровный список, как будто это все. Неполный пакет, выданный за
   * полный, хуже честной пустоты.
   */
  degraded?: string[];
}

/**
 * Почему очередь пуста или недоступна - это РАЗНЫЕ вещи, и экран обязан их различать.
 * Показать «решений нет», когда мак просто спит, значит соврать владельцу ровно в тот
 * момент, когда решения копятся.
 */
export type DecideFailure =
  | 'source_warming'
  | 'source_unreachable'
  | 'source_not_configured'
  | 'source_auth'
  | 'source_rate_limited'
  | 'unknown';

export class DecideError extends Error {
  readonly failure: DecideFailure;
  constructor(failure: DecideFailure, message: string) {
    super(message);
    this.failure = failure;
  }
}

// Подписи взяты из бота (decide_morning.ACTION_LABEL) намеренно: владелец полгода жал
// эти же слова в Telegram, и переучивать его при переходе в веб не за чем.
export const ACTION_LABEL: Record<string, string> = {
  approve: 'Да',
  later: 'Потом',
  close: 'Закрыть',
  edit: 'Правка',
  answer: 'Ответить',
  ok: 'Понял',
  skip: 'Не надо',
};

// Порядок кнопок тоже из бота: «Закрыть» всегда последней. Это необратимое снятие
// задачи с повестки, и оно не должно стоять рядом с «Да» - промах пальцем на телефоне
// стоит дорого.
const ACTION_ORDER = ['approve', 'ok', 'answer', 'edit', 'skip', 'later', 'close'];

export function sortActions(actions: string[]): string[] {
  return [...actions].sort((a, b) => {
    const ia = ACTION_ORDER.indexOf(a);
    const ib = ACTION_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

// Эти действия без комментария бессмысленны, и источник отклоняет их с 400.
// Проверяем на фронте, чтобы владелец не ловил ошибку уже после клика.
const NEEDS_COMMENT = new Set(['edit', 'answer']);

export function needsComment(action: string): boolean {
  return NEEDS_COMMENT.has(action);
}

// Заголовки групп - из KIND_LABEL источника, чтобы веб и бот называли одно одинаково.
export const KIND_LABEL: Record<string, string> = {
  hot: 'Горит',
  ask: 'Вопрос по задаче',
  deal: 'Просроченный шаг сделки',
  draft: 'Черновик контакту',
  channel: 'Пост в канал',
  candidate: 'Кандидат на рассылку',
  fork: 'Развилка',
  accept: 'Приемка сделанного',
  gap: 'Нет карточки в CRM',
};

// Порядок разбора loss-first, тот же, что в decide_pack.KIND_ORDER: сначала то, что
// теряет деньги сегодня, приемка сделанного в конец.
const KIND_ORDER = ['hot', 'ask', 'deal', 'draft', 'channel', 'candidate', 'gap', 'fork', 'accept'];

/** ISO-дата пакета в вид, которым владелец пользуется в текстах: 13.08. */
export function packDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}.${m[2]}` : (iso ?? '');
}

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

export function groupByKind(items: DecideItem[]): Array<{ kind: string; items: DecideItem[] }> {
  const map = new Map<string, DecideItem[]>();
  for (const it of items) {
    const bucket = map.get(it.kind);
    if (bucket) bucket.push(it);
    else map.set(it.kind, [it]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      const ia = KIND_ORDER.indexOf(a);
      const ib = KIND_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map(([kind, list]) => ({ kind, items: list }));
}

/**
 * Вытащить причину из ошибки api-клиента.
 *
 * `api.request` кидает Error вида `503 Service Unavailable: {"error":"source_unreachable"}`,
 * то есть тело ответа лежит в тексте сообщения. Разбираем его, чтобы показать владельцу
 * человеческую причину, а не сырой HTTP-мусор.
 */
function toFailure(err: unknown): DecideError {
  const raw = err instanceof Error ? err.message : String(err);
  for (const f of ['source_warming', 'source_unreachable', 'source_not_configured', 'source_auth', 'source_rate_limited'] as const) {
    if (raw.includes(f)) return new DecideError(f, raw);
  }
  return new DecideError('unknown', raw);
}

/** Причина отказа, пригодная для показа рядом с карточкой. */
export function decisionErrorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const brace = raw.indexOf('{');
  if (brace >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(brace)) as { detail?: string; error?: string };
      if (parsed.detail) return parsed.detail;
      if (parsed.error === 'source_unreachable') return 'источник не ответил, мак спит или офлайн';
      if (parsed.error === 'source_not_configured') return 'мост к источнику не настроен';
      if (parsed.error === 'source_auth') return 'секрет моста разъехался, нужна правка настроек';
      if (parsed.error === 'source_rate_limited') return 'слишком часто, повтори через минуту';
      if (parsed.error === 'source_refused') return 'источник отклонил решение';
      if (parsed.error === 'source_warming') return 'считается, обнови через полминуты';
      if (parsed.error) return parsed.error;
    } catch {
      // не JSON - отдадим сырой текст ниже
    }
  }
  return raw;
}

export async function fetchPack(signal?: AbortSignal, all = false): Promise<DecidePack> {
  try {
    const res = await api.get<{ ok: boolean; pack: DecidePack }>(
      all ? '/api/decide?all=1' : '/api/decide',
      { signal },
    );
    return res.pack;
  } catch (e) {
    throw toFailure(e);
  }
}

export interface DecideOutcome {
  ok: boolean;
  detail: string;
}

export async function applyDecision(input: {
  kind: string;
  id: string;
  action: string;
  comment?: string;
}): Promise<DecideOutcome> {
  return api.post<DecideOutcome>('/api/decide/action', input);
}

// --- отчеты, которые раньше приходили в бота ---------------------------------
// Форма общая для всех: text есть всегда, facts - там, где у генератора есть
// структура. Экран рисует facts, если пришли, иначе показывает text.

export interface BalanceService {
  name: string;
  raw: string;
  value: number | null;
  unit: string | null;
  low: boolean;
  ok: boolean;
}

export interface BalancesFacts {
  services: BalanceService[];
  ai: {
    ok: boolean;
    day_usd?: number;
    day_cap_usd?: number;
    month_usd?: number;
    month_forecast_usd?: number;
    balance_usd?: number | null;
    days_of_money?: number | null;
  };
  claude: {
    ok: boolean;
    day_no?: number;
    of_days?: number;
    norm_pct?: number;
    stop_pct?: number;
    reading_pct?: number | null;
  };
  generated_at: string;
}

export interface ReportEnvelope<F> {
  ok: boolean;
  name: string;
  text: string;
  facts: F | null;
  /** Возраст измерения в секундах. Отчет строится десятки секунд и живет в кэше. */
  age_sec?: number;
  stale?: boolean;
}

export async function fetchReport<F>(name: string, signal?: AbortSignal): Promise<ReportEnvelope<F>> {
  try {
    return await api.get<ReportEnvelope<F>>(`/api/reports/${name}`, { signal });
  } catch (e) {
    throw toFailure(e);
  }
}

/** «19 секунд назад» -> человеку. Возраст показываем всегда: это измерение, не поток. */
export function ageLabel(sec?: number): string {
  if (sec == null) return '';
  if (sec < 90) return 'только что';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} ч назад` : 'больше суток назад';
}

/**
 * Картинка из защищенного маршрута как object URL.
 *
 * Тег `<img src>` НЕ отправляет ни Authorization, ни x-user-email - браузер не
 * прикладывает к нему заголовки. Поэтому прямой src на /api/decide/image всегда
 * получал бы 401, и превью не появилось бы никогда. Тянем через fetch с теми же
 * заголовками, что и остальные вызовы, и подставляем object URL.
 *
 * Вызывающий ОБЯЗАН отозвать ссылку через URL.revokeObjectURL: иначе blob живет до
 * перезагрузки вкладки, а экран открывают по многу раз в день.
 */
export async function fetchImageObjectUrl(path: string, signal?: AbortSignal): Promise<string | null> {
  const auth = getAuth();
  const res = await fetch(path, {
    signal,
    headers: {
      ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      ...(auth ? { 'x-user-email': auth.email, 'x-user-role': auth.role } : {}),
    },
  });
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}
