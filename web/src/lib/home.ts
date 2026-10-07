import { api } from './api';

// Sprint 70 - главная основателя. Сводку собирает мак (telegram-agent/founder_home.py)
// и раз в 5 минут кладет на сайт; здесь только типы и чтение последней версии.
// Каждая секция приходит со своим ok: упавшая секция рисуется «нет данных», а не нулем.

export type DueState = 'over' | 'today' | 'soon' | 'ok' | 'none';

interface Section {
  ok: boolean;
  error?: string;
}

export interface TgItem {
  name: string;
  handle: string;
  hours: number;
  waiting: string;
  text: string;
  deal: string;
  account: string;
}

export interface TelegramSection extends Section {
  total?: number;
  over_day?: number;
  settled?: number;
  /** База решений драфтера не прочиталась: в счет вошли и чаты, где ответ не нужен. */
  decisions_error?: string | null;
  /** Снимки аккаунтов, которые не прочитались (остальные посчитаны). */
  unreadable?: string[];
  as_of?: string | null;
  stale?: boolean;
  items?: TgItem[];
}

export interface TaskItem {
  id: number;
  title: string;
  due_state: DueState;
  due_label: string;
  dept: string;
  dept_code: string;
  priority: number;
}

export interface TasksSection extends Section {
  open?: number;
  stalled?: number;
  over14?: number;
  elsewhere?: number;
  doubt?: number;
  items?: TaskItem[];
}

export interface ReportItem {
  date: string;
  days: number;
  entity: string;
  body: string;
  what: string;
  critical: boolean;
  reminder: boolean;
  due_state: DueState;
  due_label: string;
}

export interface Fines {
  total?: number;
  count?: number;
  overdue_sum?: number;
  overdue_count?: number;
  next_date?: string;
  next_sum?: number;
}

export interface ReportingSection extends Section {
  overdue?: number;
  next30?: number;
  items?: ReportItem[];
  overdue_items?: ReportItem[];
  fines?: Fines;
}

export type ServiceLevel = 'out' | 'low' | 'charge' | 'ok';

export interface ServiceItem {
  name: string;
  level: ServiceLevel;
  value: string;
  reason: string;
  days_left: number | null;
  due_state: DueState;
  due_label: string;
  cabinet: string;
}

export interface ServicesSection extends Section {
  at_risk?: number;
  charges?: number;
  items?: ServiceItem[];
  measured?: ServiceItem[];
  /** false - замеров балансов нет (ни кэша, ни пересчета), список держится на сигналах и реестре. */
  measured_ok?: boolean;
  /** Сервисы, чей замер в этот раз не удался (частичный сбой замеров). */
  measure_errors?: string[];
  as_of?: string | null;
}

export interface DealItem {
  id: number;
  name: string;
  pipeline: string;
  pipeline_code: string;
  stage: string;
  prob: number;
  amount: number | null;
  monthly: boolean;
  amount_label: string;
  expected: number | null;
  step: string;
  owner_turn: boolean;
  due_state: DueState;
  due_label: string;
}

export interface RevenueSection extends Section {
  deals?: number;
  with_amount?: number;
  weighted?: number;
  pipeline_sum?: number;
  items?: DealItem[];
}

export interface ProductItem {
  code: string;
  name: string;
  active: number;
  far: string[];
  steps_over: number;
}

export interface DeptItem {
  code: string;
  name: string;
  open: number;
  over: number;
  today: number;
}

export interface HomePayload {
  v: number;
  generated_at: string;
  received_at: string;
  age_sec: number;
  telegram: TelegramSection;
  tasks: TasksSection;
  reporting: ReportingSection;
  services: ServicesSection;
  revenue: RevenueSection;
  products: Section & { items?: ProductItem[] };
  depts: Section & { items?: DeptItem[] };
}

export type HomeFailure = 'not_received' | 'unknown';

export class HomeError extends Error {
  constructor(public failure: HomeFailure, message: string) {
    super(message);
  }
}

export async function fetchHome(signal?: AbortSignal): Promise<HomePayload> {
  try {
    return await api.get<HomePayload>('/api/home', { signal });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    throw new HomeError(msg.includes('not_received') ? 'not_received' : 'unknown', msg);
  }
}

/** 1050000 -> «1 050 000 ₽». */
export function rub(v: number | null | undefined): string {
  if (v == null) return '';
  return `${Math.round(v).toLocaleString('ru-RU')} ₽`;
}

/** Время из ISO как «23:05» или «06.10 23:05», если не сегодня. */
export function clockLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return hm;
  return `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${hm}`;
}
