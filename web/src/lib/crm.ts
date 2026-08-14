import { api } from './api';
import { DecideError } from './decide';

// Sprint 63.P12 - CRM владельца (founder_crm) в кабинете.
//
// Форма доски задана источником (_crm_board в decide_bridge, telegram-agent), а не
// здесь. Здесь только описание того, что реально приходит по проводу, и вызовы.

export interface CrmCard {
  id: number;
  kind: string;
  name: string;
  handle: string;
  company: string;
  stage: string;
  amount: string;
  status: string;
  next_step: string;
  next_step_owner: string;
  /** Срок шага YYYY-MM-DD либо пустая строка. */
  due: string;
  due_ts: number;
  last_touch: string;
  source: string;
  needs_step: boolean;
  overdue_days: number;
  stale: boolean;
  severity: number;
}

export interface CrmCounters {
  total: number;
  need_step: number;
  overdue: number;
  stale: number;
}

export interface CrmStreamGroup {
  stream: string;
  label: string;
  counters: CrmCounters;
  cards: CrmCard[];
}

export interface CrmBoard {
  status: string;
  stale_days: number;
  generated_ts: number;
  counters: CrmCounters;
  streams: CrmStreamGroup[];
}

export type CrmBoardStatus = 'active' | 'won' | 'lost' | 'paused';

export type CrmActionInput =
  | { action: 'next_step'; id: number; text: string; owner: CrmStepOwner; due?: string }
  | { action: 'stage'; id: number; stage: string }
  | { action: 'touch'; id: number }
  | { action: 'complete'; id: number }
  | { action: 'snooze'; id: number; days?: number }
  | { action: 'status'; id: number; status: CrmBoardStatus };

export type CrmStepOwner = 'owner' | 'agent' | 'contact';

// Лексика та же, что в CLI и боте: владелец эти слова уже знает.
export const OWNER_LABEL: Record<CrmStepOwner, string> = {
  owner: 'мой ход',
  agent: 'ход агента',
  contact: 'ждем контакта',
};

export const CRM_KIND_LABEL: Record<string, string> = {
  client: 'клиент',
  investor: 'инвестор',
  advisor: 'эдвайзор',
  strategic: 'стратег',
  partner: 'партнер',
  founder: 'фаундер',
};

export const STATUS_TAB_LABEL: Record<CrmBoardStatus, string> = {
  active: 'В работе',
  won: 'Выиграны',
  lost: 'Проиграны',
  paused: 'На паузе',
};

function toFailure(err: unknown): DecideError {
  const raw = err instanceof Error ? err.message : String(err);
  for (const f of ['source_unreachable', 'source_not_configured', 'source_auth', 'source_rate_limited'] as const) {
    if (raw.includes(f)) return new DecideError(f, raw);
  }
  return new DecideError('unknown', raw);
}

export async function fetchCrmBoard(status: CrmBoardStatus, signal?: AbortSignal): Promise<CrmBoard> {
  try {
    const res = await api.get<{ ok: boolean; board: CrmBoard }>(`/api/crm?status=${status}`, { signal });
    return res.board;
  } catch (e) {
    throw toFailure(e);
  }
}

export async function applyCrmAction(input: CrmActionInput): Promise<{ ok: boolean; detail: string }> {
  return api.post<{ ok: boolean; detail: string }>('/api/crm/action', input);
}
