import { api } from './api';
import { getAuth } from './auth';

export type Sentiment = 'positive' | 'neutral' | 'negative';
export type SpinStage = 'S' | 'P' | 'I' | 'N';

export interface AnalysisScoreBreakdown {
  rapport: number;
  spin: number;
  nextStepFixation: number;
  objectionHandling: number;
  clarity: number;
  confidence: number;
}

export interface ConversationAnalysisCard {
  summary: string;
  spinStage: SpinStage;
  conversationQuality: number;
  investorInterest: string;
  investorConcerns: string[];
  mistakes: string[];
  whatWorked: string[];
  nextBestAction: string;
  followUpMessage: string;
  probabilityScore: number;
  recommendedMaterials: string[];
  managerAdvice: string;
  sentiment: Sentiment;
  aiScore: number;
  aiScoreBreakdown: AnalysisScoreBreakdown;
  provider: string;
  model: string;
  fellBackToMock: boolean;
}

export interface ConversationAnalysisRow {
  id: string;
  projectId: string | null;
  investorName: string | null;
  source: string;
  originalFileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  audioUrl: string | null;
  transcript: string | null;
  transcriptProvider: string | null;
  transcriptModel: string | null;
  transcriptDurationSec: number | null;
  analysis: string | null;
  aiScore: number | null;
  probabilityScore: number | null;
  sentiment: Sentiment | null;
  spinStage: SpinStage | null;
  aiProvider: string | null;
  aiModel: string | null;
  fellBackToMock: boolean;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string } | null;
}

export interface AnalyzeResult {
  analysis: ConversationAnalysisCard;
  row: ConversationAnalysisRow;
}

// Multipart upload — для аудио. Использует тот же x-user-email header что и
// остальной API (см. lib/api.ts).
export async function analyzeConversationUpload(form: FormData): Promise<AnalyzeResult> {
  const base = import.meta.env.VITE_API_BASE_URL ?? '';
  const auth = getAuth();
  const headers: Record<string, string> = {};
  if (auth) {
    headers['x-user-email'] = auth.email;
    headers['x-user-role'] = auth.role;
  }
  const res = await fetch(`${base}/api/conversation-analysis`, {
    method: 'POST',
    body: form,
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<AnalyzeResult>;
}

// Text-only — paste transcript или audio URL.
export function analyzeConversationText(payload: {
  transcript?: string;
  audioUrl?: string;
  projectId?: string | null;
  investorName?: string | null;
}): Promise<AnalyzeResult> {
  return api.post<AnalyzeResult>('/api/conversation-analysis', payload);
}

export function listAnalyses(projectId?: string) {
  const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  return api.get<{ analyses: ConversationAnalysisRow[] }>(`/api/conversation-analysis${q}`);
}

export const SENTIMENT_TONE: Record<Sentiment, 'success' | 'warning' | 'danger'> = {
  positive: 'success',
  neutral: 'warning',
  negative: 'danger',
};

export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: 'Позитив',
  neutral: 'Нейтрально',
  negative: 'Без интереса',
};

export const SCORE_LABELS: Array<{ key: keyof AnalysisScoreBreakdown; label: string }> = [
  { key: 'rapport', label: 'Контакт с инвестором' },
  { key: 'spin', label: 'SPIN-структура' },
  { key: 'nextStepFixation', label: 'Фиксация следующего шага' },
  { key: 'objectionHandling', label: 'Работа с возражениями' },
  { key: 'clarity', label: 'Чёткость цифр и оффера' },
  { key: 'confidence', label: 'Уверенность ведущего' },
];

export function parseAnalysisJSON(raw: string | null | undefined): ConversationAnalysisCard | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as ConversationAnalysisCard; } catch { return null; }
}
