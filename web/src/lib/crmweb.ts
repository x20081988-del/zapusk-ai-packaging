import { api } from './api';
import { DecideError } from './decide';

// Sprint 63.P13 - CRM целиком в кабинете.
//
// Формы заданы источником (crm_web в telegram-agent) и приходят по проводу как
// есть - здесь только описание и вызовы. Ничего не пересчитываем: колонки,
// подсветки и лейблы уже посчитал источник, тот же, что рендерит токен-ссылку.

// --- «Проекты и задачи» (/pm) ------------------------------------------------

export interface PmSub {
  id: number;
  task_id: number;
  text: string;
  done: number;
  owner: string;
  pos: number;
}

export interface PmRun {
  id: number;
  task_id: number;
  status: string; // queued | running | asked | done | failed
  route: string;
  question: string;
  answer: string;
  summary: string;
  artifact: string;
  detail: string;
  waiting: boolean;
}

export interface PmTask {
  id: number;
  text: string;
  title: string;
  rest: string;
  unseen: string;
  project: string;
  stream: string;
  priority: number;
  due_ts: number;
  due_state: string;
  due_label: string;
  due_date: string;
  heat: string; // over | today | soon | ok | none
  heat_label: string;
  done_n: number;
  total_n: number;
  pct: number;
  mine: string[];
  subs: PmSub[];
  turn: string;
  turn_label: string;
  run?: PmRun | null;
}

export interface PmProject {
  code: string;
  name: string;
  stage: string;
  dir: string;
  dir_name: string;
  note: string;
  open_n: number;
  over_n: number;
  result: string;
  date: string;
  due_state: string;
  due_label: string;
  due_date: string;
  heat: string;
  heat_label: string;
  top_prio: number;
}

export interface PmDirection {
  code: string;
  name: string;
  rhythm: string;
  projects: PmProject[];
  proj_n: number;
  tasks_n: number;
  over_n: number;
  flow_n: number;
  move_label: string;
  move_ts: number;
  heat: string;
  heat_label: string;
}

export interface PmPayload {
  ok: boolean;
  generated: string;
  directions: PmDirection[];
  projects: PmProject[];
  cards: PmTask[];
  autonomy: string;
  /** Sprint 64: мак недоступен, сервер отдал последний снимок от fetched_at. */
  stale?: boolean;
  fetched_at?: string;
}

/** project_payload источника - НЕ надмножество PmProject: heat/top_prio там нет. */
export interface PmProjectFull {
  code: string;
  name: string;
  stage: string;
  stage_label: string;
  dir: string;
  dir_name: string;
  note: string;
  result: string;
  date: string;
  date_h: string;
  due_date: string;
  due_label: string;
  due_state: string;
  open_n: number;
  over_n: number;
  pb_i: number;
  pb_label: string;
  pb_n: number;
  /** Подзадачи, которые берет агент, и подзадачи, ждущие владельца. */
  mine: string[];
  waits: string[];
  /** Ни одной открытой задачи с шагами - проект висит без следующего шага. */
  no_step: boolean;
  cards: PmTask[];
}

export interface PmDirectionFull extends PmDirection {
  /** Поток-задачи уровня направления - живут вне проектов. */
  cards: PmTask[];
}

// Лексика источника (_OWNER_LABEL в crm_web): «я» - это агент, он и говорит.
export const PM_OWNER_LABEL: Record<string, string> = {
  agent: 'я',
  owner: 'владелец',
  contact: 'контакт',
};

function toFailure(err: unknown): DecideError {
  const raw = err instanceof Error ? err.message : String(err);
  for (const f of ['source_unreachable', 'source_not_configured', 'source_auth', 'source_rate_limited'] as const) {
    if (raw.includes(f)) return new DecideError(f, raw);
  }
  return new DecideError('unknown', raw);
}

export async function fetchCrmwebPm(signal?: AbortSignal): Promise<PmPayload> {
  try {
    return await api.get<PmPayload>('/api/crmweb/pm', { signal });
  } catch (e) {
    throw toFailure(e);
  }
}

export async function fetchCrmwebProject(code: string, signal?: AbortSignal): Promise<PmProjectFull> {
  try {
    const res = await api.get<{ ok: boolean; project: PmProjectFull }>(
      `/api/crmweb/pm/project?code=${encodeURIComponent(code)}`, { signal });
    return res.project;
  } catch (e) {
    throw toFailure(e);
  }
}

export async function fetchCrmwebDirection(code: string, signal?: AbortSignal): Promise<PmDirectionFull> {
  try {
    const res = await api.get<{ ok: boolean; direction: PmDirectionFull }>(
      `/api/crmweb/pm/direction?code=${encodeURIComponent(code)}`, { signal });
    return res.direction;
  } catch (e) {
    throw toFailure(e);
  }
}

export type PmActionInput =
  | { action: 'close_task'; task_id: number; resolution?: string }
  | { action: 'drop_task'; task_id: number; resolution?: string }
  | { action: 'toggle_sub'; id: number; done: boolean };

export async function crmwebPmAction(input: PmActionInput): Promise<{ ok: boolean; detail?: string; card?: PmTask | null }> {
  return api.post('/api/crmweb/pm-action', input);
}

export async function crmwebAct(taskId: number): Promise<{ ok: boolean; run: PmRun; fresh: boolean }> {
  return api.post('/api/crmweb/act', { task_id: taskId });
}

export async function crmwebAnswer(runId: number, text: string): Promise<{ ok: boolean; run: PmRun }> {
  return api.post('/api/crmweb/answer', { run_id: runId, text });
}

export async function fetchCrmwebRun(runId: number, signal?: AbortSignal): Promise<PmRun> {
  const res = await api.get<{ ok: boolean; run: PmRun }>(`/api/crmweb/run?id=${runId}`, { signal });
  return res.run;
}

// --- Канбан всех карточек (founder_crm через card_view) ----------------------

export interface CrmwebCard {
  id: number;
  stream: string;
  stream_label: string;
  name: string;
  handle: string;
  handle_url: string;
  company: string;
  stage: string;
  status: string; // active | won | lost | paused
  bucket: string; // active | snoozed | declined | won
  bucket_label: string;
  step_display: string; // готовая строка источника: «текст [чей ход, до DD.MM.YYYY]» или «не задан»
  why: string;
  source: string;
  last_display: string;
}

export async function fetchCrmwebCards(
  signal?: AbortSignal,
): Promise<{ generated: string; cards: CrmwebCard[]; stale?: boolean; fetched_at?: string }> {
  try {
    return await api.get<{ ok: boolean; generated: string; cards: CrmwebCard[]; stale?: boolean; fetched_at?: string }>(
      '/api/crmweb/cards', { signal });
  } catch (e) {
    throw toFailure(e);
  }
}

// «Фокус дня» (/decide): сделки, где сегодня ход владельца, + горячие задачи.
// Как и весь модуль - формы источника, ничего не пересчитываем.
export interface FocusDeal extends CrmwebCard {
  due_state: string; // over | today
  due_label: string; // «просрочен на N дней» | «сегодня»
}

export interface CrmwebFocus {
  generated: number;
  deals: FocusDeal[];
  deals_total: number;
  no_step_n: number;
  tasks: PmTask[];
  stale?: boolean;
  fetched_at?: string;
}

export async function fetchCrmwebFocus(signal?: AbortSignal): Promise<CrmwebFocus> {
  try {
    return await api.get<CrmwebFocus>('/api/crmweb/focus', { signal });
  } catch (e) {
    throw toFailure(e);
  }
}

export type CardActionInput =
  | { action: 'decline' | 'reactivate' | 'snooze' | 'complete_step'; id: number }
  | { action: 'set_stage'; id: number; stage: string }
  | { action: 'set_next_step'; id: number; text: string; owner: 'owner' | 'agent' | 'contact'; due?: string };

export async function crmwebCardAction(input: CardActionInput): Promise<{ ok: boolean; card: CrmwebCard }> {
  return api.post('/api/crmweb/action', input);
}

// Доступность кнопок по статусу - контракт _btn_disabled источника.
export function cardButtons(status: string) {
  const active = status === 'active';
  return {
    done: active,
    snooze: active,
    decline: status === 'active' || status === 'paused',
    reactivate: status === 'lost' || status === 'paused',
  };
}

// --- Воронки сделок (crm_deals через deal_view/deal_payload) -----------------

export interface CrmwebDeal {
  id: number;
  pipeline: string;
  pipeline_label: string;
  stage: string;
  stage_label: string;
  status: string; // active | won | lost | paused
  status_label: string;
  title: string;
  name: string;
  handle: string;
  handle_url: string;
  company: string;
  amount: string;
  card_id: number;
  step_display: string;
  last_display: string;
}

export interface CrmwebDealFull extends CrmwebDeal {
  notes: string;
  source: string;
}

export interface CrmwebDealEvent {
  date: string;
  kind: string;
  kind_label: string;
  text: string;
  link: string;
  source: string;
}

export interface CrmwebDealLink {
  date: string;
  kind: string;
  kind_label: string;
  label: string;
  url: string;
}

export interface CrmwebDealRelated {
  id: number;
  pipeline: string;
  /** Путь crm_web (/p/<slug>) - в кокпите превращается в /crm/p/<slug>. */
  url: string;
  label: string;
}

export interface CrmwebDealPayload {
  deal: CrmwebDealFull;
  stages: Array<{ id: string; label: string }>;
  events: CrmwebDealEvent[];
  links: CrmwebDealLink[];
  related: CrmwebDealRelated[];
  /** Sprint 64: мак недоступен, сервер отдал последний снимок сделки. */
  stale?: boolean;
  fetched_at?: string;
}

export async function fetchCrmwebDeals(
  pipeline: string,
  signal?: AbortSignal,
): Promise<{ deals: CrmwebDeal[]; stale: boolean; fetchedAt: string | null }> {
  try {
    const res = await api.get<{ ok: boolean; deals: CrmwebDeal[]; stale?: boolean; fetched_at?: string }>(
      `/api/crmweb/deals?pipeline=${encodeURIComponent(pipeline)}`, { signal });
    return { deals: res.deals, stale: res.stale === true, fetchedAt: res.fetched_at ?? null };
  } catch (e) {
    throw toFailure(e);
  }
}

export async function fetchCrmwebDeal(id: number, signal?: AbortSignal): Promise<CrmwebDealPayload> {
  try {
    return await api.get<CrmwebDealPayload>(`/api/crmweb/deal?id=${id}`, { signal });
  } catch (e) {
    throw toFailure(e);
  }
}

export type DealActionInput =
  | { action: 'set_stage'; id: number; stage: string }
  | { action: 'set_status'; id: number; status: 'active' | 'won' | 'lost' | 'paused' }
  | { action: 'set_next_step'; id: number; text: string; owner: 'owner' | 'agent' | 'contact'; due?: string }
  | { action: 'add_note'; id: number; text: string };

export async function crmwebDealAction(input: DealActionInput): Promise<{ ok: boolean; deal: CrmwebDeal; payload: CrmwebDealPayload }> {
  return api.post('/api/crmweb/deal-action', input);
}

export const DEAL_STATUS_LABEL: Record<string, string> = {
  active: 'В работу',
  won: 'Выиграна',
  lost: 'Отказ',
  paused: 'Пауза',
};

// --- Справочники (воронки, стримы, колонки канбана) --------------------------

export interface CrmwebStage { slug: string; label: string }
export interface CrmwebPipeline { slug: string; label: string; active: number; stages: CrmwebStage[] }

export interface CrmwebMeta {
  ok: boolean;
  pipelines: CrmwebPipeline[];
  streams: Array<{ slug: string; label: string }>;
  buckets: Array<{ slug: string; label: string }>;
  deal_statuses: string[];
  next_step_owners: string[];
}

export async function fetchCrmwebMeta(signal?: AbortSignal): Promise<CrmwebMeta> {
  try {
    return await api.get<CrmwebMeta>('/api/crmweb/meta', { signal });
  } catch (e) {
    throw toFailure(e);
  }
}
