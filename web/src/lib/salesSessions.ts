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
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string } | null;
}

export interface CompleteResult {
  summary: SessionSummary;
  session: SalesSession;
}

export interface CompleteInput {
  projectId?: string | null;
  leadId?: string | null;
  investorName?: string | null;
  investorPhone?: string | null;
  transcript: string;
  adviceHistory?: unknown[];
  startedAt?: string | null;
  endedAt?: string | null;
}

export function completeMeeting(input: CompleteInput) {
  return api.post<CompleteResult>('/api/sales-sessions/complete', input);
}

export function listMeetings(filters: { projectId?: string; leadId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.projectId) params.set('projectId', filters.projectId);
  if (filters.leadId) params.set('leadId', filters.leadId);
  const q = params.toString();
  return api.get<{ sessions: SalesSession[] }>(`/api/sales-sessions${q ? `?${q}` : ''}`);
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
