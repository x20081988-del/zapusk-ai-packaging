import { getAuth } from './auth';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

// Hotfix 2026-05-15 — поддержка AbortSignal. SalesAssistant использует это,
// чтобы отменять «висящий» AI-запрос, когда пользователь нажимает «Обновить
// подсказку» во второй раз: новый запрос abort'ит предыдущий, и UI не остаётся
// заблокированным на старом fetch'е к OpenAI.
export interface ApiRequestOptions {
  signal?: AbortSignal;
  // Sprint 50 P0.1 — opt-in idempotency. UI passes a uuid here on the
  // POSTs we want replay-safe (meeting finalize, outcome creation). api.ts
  // adds the X-Idempotency-Key header and otherwise behaves the same.
  idempotencyKey?: string;
  // Sprint 50 — generic headers escape hatch. Not used yet; keeps the door
  // open without each call-site touching `fetch` directly.
  headers?: Record<string, string>;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = getAuth();
  const headers: Record<string, string> = {
    ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    // Sprint 19: Bearer JWT — основной способ авторизации. Если token'а нет
    // (например, после legacy localStorage записи) — fall back на header'ы
    // x-user-email / x-user-role. Это back-compat на время миграции.
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
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

// Sprint 50 P0.1 — merge per-call headers (X-Idempotency-Key, custom)
// into the standard auth headers in request().
function buildHeaders(opts?: ApiRequestOptions): Record<string, string> | undefined {
  const extra: Record<string, string> = {};
  if (opts?.idempotencyKey) extra['X-Idempotency-Key'] = opts.idempotencyKey;
  if (opts?.headers) Object.assign(extra, opts.headers);
  return Object.keys(extra).length ? extra : undefined;
}

export const api = {
  get: <T>(path: string, opts?: ApiRequestOptions) => request<T>(path, { signal: opts?.signal, headers: buildHeaders(opts) }),
  post: <T>(path: string, body?: unknown, opts?: ApiRequestOptions) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      signal: opts?.signal,
      headers: buildHeaders(opts),
    }),
  patch: <T>(path: string, body?: unknown, opts?: ApiRequestOptions) =>
    request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
      signal: opts?.signal,
      headers: buildHeaders(opts),
    }),
  delete: <T>(path: string, opts?: ApiRequestOptions) =>
    request<T>(path, { method: 'DELETE', signal: opts?.signal, headers: buildHeaders(opts) }),
  upload: <T>(path: string, form: FormData, opts?: ApiRequestOptions) =>
    request<T>(path, { method: 'POST', body: form, signal: opts?.signal, headers: buildHeaders(opts) }),
};

// Sprint 50 P0.1 — uuid-shaped opaque key for idempotency. Uses
// crypto.randomUUID when available (all evergreen browsers), with a
// best-effort fallback that's still long enough to clear the server's
// 16-char minimum.
export function newIdempotencyKey(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID();
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Sprint 37 P0.1 — защищённое скачивание файлов с Bearer-токеном.
//
// Раньше UI делал `<a href="/api/projects/X/export.zip">` или
// `window.open('/api/.../prompts/Y.md')` — браузер открывал URL без
// Authorization header, ловил 401 и в проде падал на login. После закрытия
// публичного /uploads в Sprint 36 единственный путь к файлу — этот helper.
//
// Логика:
//   1. fetch с авторизацией;
//   2. response.blob() → создаём object-URL;
//   3. триггерим <a download="..."> программно;
//   4. revokeObjectURL чтобы не утекали URL'ы в текущей вкладке.
//
// filename: если задан явно — используется; иначе пытаемся вытянуть из
// Content-Disposition; иначе берём последний сегмент URL.
export async function downloadBlob(
  path: string,
  filename?: string,
  opts?: ApiRequestOptions,
): Promise<void> {
  const auth = getAuth();
  const headers: Record<string, string> = {
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    ...(auth ? { 'x-user-email': auth.email } : {}),
    ...(auth ? { 'x-user-role': auth.role } : {}),
  };
  const res = await fetch(`${BASE}${path}`, { headers, signal: opts?.signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  const blob = await res.blob();
  const resolvedName =
    filename ||
    parseFilenameFromContentDisposition(res.headers.get('content-disposition')) ||
    path.split('/').filter(Boolean).pop() ||
    'download';

  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = resolvedName;
    // Не вставляем в DOM навсегда — клик работает и без append на современных
    // браузерах, но Firefox старее требовал DOM-присоединения. Делаем безопасный
    // append + remove чтобы не было различий.
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // revoke даём микротик — Safari иначе теряет blob раньше времени.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

function parseFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  // Сначала RFC 5987 filename*=UTF-8''… (приоритетный — поддерживает не-ASCII).
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match?.[1]) {
    try { return decodeURIComponent(utf8Match[1]); } catch { /* ignore */ }
  }
  // Старый формат filename="..." без кодировки.
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];
  const bare = /filename=([^;]+)/i.exec(header);
  if (bare?.[1]) return bare[1].trim();
  return null;
}

// ─── typed surface ───────────────────────────────────────────

// Sprint 21: формат привлечения инвестиций для проекта. null = не выбран.
export type InvestmentTrack =
  | 'shareholding'
  | 'llc_share'
  | 'convertible'
  | 'safe'
  | 'pre_ipo'
  | 'packaging_only';

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
  // Sprint 62.P11 — показательный/демо-проект (бэкенд всегда возвращает это поле).
  isDemo?: boolean;
  // Sprint 21: выбранный трек привлечения инвестиций.
  investmentTrack: InvestmentTrack | null;
  createdAt: string;
  updatedAt: string;
  files?: UploadedFile[];
  brief?: ProjectBrief | null;
  generatedPrompts?: GeneratedPrompt[];
  generatedDocs?: GeneratedDocument[];
  sourceMaterialsCount?: number;
  generatedMaterialsCount?: number;
  aiContextMaterialsCount?: number;
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

export type MaterialAiContextStatus = 'connected' | 'analyzing' | 'storage_only' | 'error';

export interface SourceMaterialRegistryItem {
  id: string;
  materialType: 'source';
  version: number;
  file: UploadedFile;
  aiContext: {
    status: MaterialAiContextStatus;
    label: string;
    badges: string[];
    knowledgeSourceId: string | null;
    knowledgeSourceStatus: string | null;
    scope: string | null;
    sourceType: string | null;
    projectId: string | null;
    uploadedFileId: string | null;
    isCandidate: boolean | null;
    visibility: string | null;
    chunkCount: number;
    numericFactsCount: number;
    retrievalCount: number;
    lastAnalyzedAt: string | null;
    lastRetrievedAt: string | null;
  };
}

export interface GeneratedMaterialRegistryItem {
  id: string;
  materialType: 'generated';
  generatedType: 'document' | 'prompt';
  kind: string;
  title: string;
  version: number;
  format: string;
  createdAt: string;
}

export interface ProjectMaterialsRegistry {
  sourceMaterials: SourceMaterialRegistryItem[];
  generatedMaterials: GeneratedMaterialRegistryItem[];
  summary: {
    sourceCount: number;
    generatedCount: number;
    aiContextCount: number;
    analyzingCount: number;
    storageOnlyCount: number;
    errorCount: number;
    chunkCount: number;
    numericFactsCount: number;
  };
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
  // Sprint 62.P3 — добавлен 'legal' для отметок готовности юридических items
  // (legal_structure, llc_agreement, sale_contracts, legal_dd, и т.д.).
  // UI buildLegalStage использует review.approved=true чтобы маркировать
  // item как «готово».
  artefactKind: 'prompt' | 'document' | 'brief' | 'legal';
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
// Sprint 17: добавлены provider-result поля (previewUrl, resultUrl,
// providerJobId, errorCode, errorMessage, completedAt, resultJson).
export interface PackagingJob {
  id: string;
  projectId: string;
  templateId: string | null;
  templateKey: string;
  provider: string;
  tool: string;
  model: string | null;
  outputType: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'mock' | 'awaiting_manager';
  prompt: string;
  resultPreview: string | null;
  generatedPromptId: string | null;
  generatedDocumentId: string | null;
  // Sprint 17: real-provider result fields
  providerJobId: string | null;
  previewUrl: string | null;
  resultUrl: string | null;
  resultJson: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  completedAt: string | null;
  // Sprint 18: managed packaging flow
  managerComment: string | null;
  completedBy: string | null;
  createdAt: string;
}

// Sprint 62.P11 — заявка инвестора с публичной витрины /opportunities.
export type InvestorCheckRange = '500k_1m' | '1m_3m' | '3m_10m' | '10m_plus';
export type InvestorInterest = 'materials' | 'discuss' | 'invest' | 'compare';

export interface InvestorApplicationInput {
  projectId: string;
  name: string;
  contact: string;
  email?: string;
  checkRange: InvestorCheckRange;
  interest: InvestorInterest;
  comment?: string;
}

export interface InvestorApplicationResult {
  application: { id: string; status: string; createdAt: string };
  message: string;
}

export const investorApplications = {
  create: (input: InvestorApplicationInput) =>
    api.post<InvestorApplicationResult>('/api/investor-applications', input),
};
