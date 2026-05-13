import { getAuth } from './auth';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = getAuth();
  const headers: Record<string, string> = {
    ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(auth ? { 'x-user-email': auth.email } : {}),
    ...(auth ? { 'x-user-role': auth.role } : {}),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
};

// ─── typed surface ───────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  inn: string | null;
  website: string | null;
  industry: string | null;
  legalStatus: string | null;
  stage: string | null;
  raiseAmount: number | null;
  currency: string;
  minCheck: number | null;
  equityOffered: number | null;
  raiseDeadline: string | null;
  investorType: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  files?: UploadedFile[];
  brief?: ProjectBrief | null;
  generatedPrompts?: GeneratedPrompt[];
  generatedDocs?: GeneratedDocument[];
}

export interface UploadedFile {
  id: string;
  projectId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: string;
  path: string;
  url: string | null;
  createdAt: string;
}

export interface ProjectBrief {
  id: string;
  projectId: string;
  version: number;
  businessSummary: string | null;
  monetization: string | null;
  keyMetrics: string | null;
  investmentAsk: string | null;
  strengths: string | null;
  weaknesses: string | null;
  missingData: string | null;
  missingByCategory: string | null;
  interviewAnswers: string | null;
  napkin: string | null;
  rawAIResponse: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArtefactReview {
  id: string;
  projectId: string;
  artefactKind: 'prompt' | 'document' | 'brief';
  artefactKey: string;
  artefactId: string | null;
  score: number;
  comment: string | null;
  approved: boolean;
  needsRework: boolean;
  reviewer: string;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedPrompt {
  id: string;
  projectId: string;
  kind: string;
  version: number;
  body: string;
  feedback: string | null;
  createdAt: string;
}

export interface GeneratedDocument {
  id: string;
  projectId: string;
  kind: string;
  version: number;
  format: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface PromptTemplate {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string | null;
  body: string;
  active: boolean;

  // Sprint 15: orchestration metadata — null для кастомных шаблонов без
  // зарегистрированной оркестрации; единый registry на бэкенде гарантирует
  // согласованность для seed-шаблонов.
  provider: string | null;
  tool: string | null;
  model: string | null;
  outputType: string | null;
}

// Sprint 15: каждый запуск AI-orchestrator'а пишет PackagingJob — это
// аудит-трейл «какой AI собрал какой артефакт».
export interface PackagingJob {
  id: string;
  projectId: string;
  templateId: string | null;
  templateKey: string;
  provider: string;
  tool: string;
  model: string | null;
  outputType: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'mock';
  prompt: string;
  resultPreview: string | null;
  generatedPromptId: string | null;
  generatedDocumentId: string | null;
  createdAt: string;
}
