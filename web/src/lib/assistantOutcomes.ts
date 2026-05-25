import { api } from './api';

// Sprint 43 P0.5 — клиент для assistant-outcomes API.

export type OutcomeType =
  | 'follow_up_sent'
  | 'next_meeting_booked'
  | 'investor_requested_docs'
  | 'investor_interested'
  | 'investment_received'
  | 'lost'
  | 'ghosted'
  | 'no_decision'
  | 'bad_fit';

export interface AssistantOutcome {
  id: string;
  adviceEventId: string | null;
  projectId: string | null;
  salesSessionId: string | null;
  conversationAnalysisId: string | null;
  investorName: string | null;
  outcomeType: OutcomeType;
  valueRub: number | null;
  probabilityAfter: number | null;
  note: string | null;
  createdById: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export interface CreateOutcomeInput {
  adviceEventId?: string | null;
  projectId?: string | null;
  salesSessionId?: string | null;
  conversationAnalysisId?: string | null;
  investorName?: string | null;
  outcomeType: OutcomeType;
  valueRub?: number | null;
  probabilityAfter?: number | null;
  note?: string | null;
}

// Sprint 50 P0.1 — каждый «Зафиксировать результат» получает свой
// idempotency key, чтобы повторный клик / retry не создавал второй
// outcome.
export function createOutcome(input: CreateOutcomeInput, idempotencyKey?: string) {
  return api.post<{ outcome: AssistantOutcome }>('/api/assistant-outcomes', input, { idempotencyKey });
}

export function listOutcomes(filters: { projectId?: string; salesSessionId?: string; salesSessionIds?: string[] } = {}) {
  const params = new URLSearchParams();
  if (filters.projectId) params.set('projectId', filters.projectId);
  if (filters.salesSessionId) params.set('salesSessionId', filters.salesSessionId);
  if (filters.salesSessionIds?.length) params.set('salesSessionIds', filters.salesSessionIds.join(','));
  const qs = params.toString();
  return api.get<{ outcomes: AssistantOutcome[] }>(`/api/assistant-outcomes${qs ? `?${qs}` : ''}`);
}

export type UpdateOutcomeInput = Partial<Pick<
  CreateOutcomeInput,
  'investorName' | 'outcomeType' | 'valueRub' | 'probabilityAfter' | 'note'
>>;

export function updateOutcome(id: string, input: UpdateOutcomeInput) {
  return api.patch<{ outcome: AssistantOutcome }>(`/api/assistant-outcomes/${id}`, input);
}

export function archiveOutcome(id: string) {
  return api.delete<{ outcome: AssistantOutcome }>(`/api/assistant-outcomes/${id}`);
}

// Sprint 43 — лейблы для UI. Order = порядок отображения кнопок.
export const OUTCOME_OPTIONS: Array<{ value: OutcomeType; label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = [
  { value: 'follow_up_sent',          label: 'Отправлено повторное касание', tone: 'info' },
  { value: 'next_meeting_booked',     label: 'Назначена встреча',       tone: 'success' },
  { value: 'investor_requested_docs', label: 'Запросил документы',      tone: 'info' },
  { value: 'investor_interested',     label: 'Инвестор заинтересован',  tone: 'success' },
  { value: 'investment_received',     label: 'Инвестиция получена',     tone: 'success' },
  { value: 'no_decision',             label: 'Без решения',             tone: 'neutral' },
  { value: 'ghosted',                 label: 'Не отвечает',             tone: 'warning' },
  { value: 'lost',                    label: 'Потерян',                 tone: 'danger' },
  { value: 'bad_fit',                 label: 'Не подходит',             tone: 'neutral' },
];

export const OUTCOME_LABELS: Record<OutcomeType, string> = Object.fromEntries(
  OUTCOME_OPTIONS.map((o) => [o.value, o.label]),
) as Record<OutcomeType, string>;
