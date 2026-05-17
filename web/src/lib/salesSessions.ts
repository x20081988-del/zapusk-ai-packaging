import { api } from './api';

export type InvestorType = 'dividend' | 'growth' | 'preipo' | 'strategic' | 'unknown';
export type MeetingTone = 'hot' | 'warm' | 'cold';

export interface SessionSummary {
  summary: string;
  investorInterest: string;
  checkRange: string;
  objections: string[];
  risks: string[];
  materialsToSend: string[];
  nextStep: string;
  followUpMessage: string;
  probabilityScore: number;
  investorType: InvestorType;
  tone: MeetingTone;
  managerNote: string;
  provider: string;
  model: string;
  fellBackToMock: boolean;
}

export interface SalesSession {
  id: string;
  projectId: string | null;
  leadId: string | null;
  investorName: string | null;
  investorPhone: string | null;
  source: string;
  startedAt: string | null;
  endedAt: string | null;
  transcript: string | null;
  summary: string | null;
  investorInterest: string | null;
  checkRange: string | null;
  objections: string | null;
  risks: string | null;
  materialsToSend: string | null;
  nextStep: string | null;
  followUpMessage: string | null;
  probabilityScore: number | null;
  investorType: InvestorType | null;
  tone: MeetingTone | null;
  managerNote: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  fellBackToMock: boolean;
  // Sprint 52 P0.3 — outcome dataset
  outcome?: string | null;
  managerOutcomeNotes?: string | null;
  // Sprint 54 P0 — hybrid transcription. Optional because legacy rows
  // pre-date the schema; service treats null as draft / no-audio.
  transcriptSource?: 'realtime_draft' | 'offline_clean' | 'uploaded_audio' | 'manual' | null;
  transcriptQualityStatus?: 'draft' | 'clean' | 'failed' | 'not_available' | null;
  audioStoragePath?: string | null;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string } | null;
}

export interface CompleteResult {
  summary: SessionSummary;
  session: SalesSession;
}

export type SessionOutcome = 'success' | 'failed' | 'followup' | 'unknown';

export interface CompleteInput {
  projectId?: string | null;
  leadId?: string | null;
  investorName?: string | null;
  investorPhone?: string | null;
  transcript: string;
  adviceHistory?: unknown[];
  startedAt?: string | null;
  endedAt?: string | null;
  // Sprint 43 P0.4 — id всех full-analyze advice events этой встречи; backend
  // привяжет их к создаваемому salesSessionId для outcome attribution.
  adviceEventIds?: string[];
  // Sprint 52 P0.4 — multi-project context. Если в звонке упоминались
  // несколько проектов — передаём их id'ы здесь. Backend сохранит в
  // NegotiationMemory.projectIds.
  projectIds?: string[];
  // Sprint 52 P0.3 — outcome dataset (опционально на финализации).
  outcome?: SessionOutcome;
  managerOutcomeNotes?: string | null;
}

// Sprint 50 P0.1 — каждый «Завершить встречу» получает свой idempotency
// key. Двойной клик / повторный ретрай делает один и тот же запрос с тем
// же key → backend отдаёт сохранённый ответ, дубль не создаётся.
export function completeMeeting(input: CompleteInput, idempotencyKey?: string) {
  return api.post<CompleteResult>('/api/sales-sessions/complete', input, { idempotencyKey });
}

// Sprint 52 P0.3 — обновить outcome + manager notes после факта.
// Используется в финализационном modal'е или в карточке встречи.
export function updateMeetingOutcome(
  id: string,
  patch: { outcome?: SessionOutcome; managerOutcomeNotes?: string | null },
) {
  return api.patch<{ session: { id: string; outcome: string | null; managerOutcomeNotes: string | null } }>(
    `/api/sales-sessions/${id}/outcome`,
    patch,
  );
}

// Sprint 54 P0 — hybrid transcription: загрузить recorded audio после
// финализации. Backend запустит gpt-4o-transcribe и заменит draft на clean.
// Response status: 'clean' | 'failed' | 'not_available'.
export interface AudioUploadResult {
  status: 'clean' | 'failed' | 'not_available';
  audioStoragePath?: string;
  provider?: string | null;
  model?: string | null;
  latencyMs?: number;
}
export function uploadMeetingAudio(id: string, blob: Blob, filename: string) {
  const form = new FormData();
  form.append('audio', blob, filename);
  return api.upload<AudioUploadResult>(`/api/sales-sessions/${id}/audio`, form);
}

export function listMeetings(filters: { projectId?: string; leadId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.projectId) params.set('projectId', filters.projectId);
  if (filters.leadId) params.set('leadId', filters.leadId);
  const q = params.toString();
  return api.get<{ sessions: SalesSession[] }>(`/api/sales-sessions${q ? `?${q}` : ''}`);
}

export function archiveMeeting(id: string) {
  return api.delete<{ ok: boolean; archivedAt: string }>(`/api/sales-sessions/${id}`);
}

export function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

export const TONE_LABEL: Record<MeetingTone, string> = {
  hot: 'HOT', warm: 'WARM', cold: 'COLD',
};
export const TONE_BADGE: Record<MeetingTone, 'danger' | 'warning' | 'neutral'> = {
  hot: 'danger', warm: 'warning', cold: 'neutral',
};
export const INVESTOR_TYPE_LABEL: Record<InvestorType, string> = {
  dividend: 'Дивидендный',
  growth: 'Рост',
  preipo: 'Pre-IPO',
  strategic: 'Стратегический',
  unknown: 'Не определён',
};
