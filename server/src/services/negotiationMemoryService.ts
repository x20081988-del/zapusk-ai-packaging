// Sprint 52 P0.2 — Negotiation Memory Foundation.
//
// Каждый завершённый звонок / встреча превращается в запись «памяти
// переговоров»: что сказал инвестор, какие возражения встретились, что
// зацепило, какие инсайты про спикера. Foundation под будущий retrieval
// (memories по инвестору / проекту / тегу) и тренинговые dataset'ы.
//
// Никаких embeddings/vector db — простой relational store + keyword
// retrieval helpers. Когда подключим RAG, текущие записи останутся
// валидны: добавим только index/vector колонки.
//
// JSON-поля (projectIds / objections / tags) хранятся как stringified
// массивы (SQLite не имеет native JSON). Сериализацию/десериализацию
// делает этот сервис — наружу всегда отдаём типизированные массивы.

import { prisma } from '../db.js';

export interface NegotiationMemoryRow {
  id: string;
  salesSessionId: string | null;
  primaryProjectId: string | null;
  projectIds: string[];
  investorName: string | null;
  investorPhone: string | null;
  transcript: string;
  summary: string | null;
  outcome: string | null;
  objections: string[];
  tags: string[];
  speakerInsights: string | null;
  managerNotes: string | null;
  createdById: string | null;
  createdAt: Date;
}

interface CreateMemoryInput {
  salesSessionId?: string | null;
  primaryProjectId?: string | null;
  projectIds?: string[];
  investorName?: string | null;
  investorPhone?: string | null;
  transcript: string;
  summary?: string | null;
  outcome?: string | null;
  objections?: string[];
  tags?: string[];
  speakerInsights?: string | null;
  managerNotes?: string | null;
  createdById?: string | null;
  // Sprint 55 P0 — provenance. 'draft' для initial entry (из realtime),
  // 'clean' для recompute после offline transcription.
  sourceTranscriptQuality?: 'draft' | 'clean' | null;
}

// Cap transcript на ~16k символов, чтобы записи не разрастались. Анализ +
// summary уже есть; для retrieval достаточно tail-сегмента.
const TRANSCRIPT_CAP = 16_000;

function safeJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function rowFromDb(r: {
  id: string;
  salesSessionId: string | null;
  primaryProjectId: string | null;
  projectIds: string;
  investorName: string | null;
  investorPhone: string | null;
  transcript: string;
  summary: string | null;
  outcome: string | null;
  objections: string;
  tags: string;
  speakerInsights: string | null;
  managerNotes: string | null;
  createdById: string | null;
  createdAt: Date;
}): NegotiationMemoryRow {
  return {
    id: r.id,
    salesSessionId: r.salesSessionId,
    primaryProjectId: r.primaryProjectId,
    projectIds: safeJsonArray(r.projectIds),
    investorName: r.investorName,
    investorPhone: r.investorPhone,
    transcript: r.transcript,
    summary: r.summary,
    outcome: r.outcome,
    objections: safeJsonArray(r.objections),
    tags: safeJsonArray(r.tags),
    speakerInsights: r.speakerInsights,
    managerNotes: r.managerNotes,
    createdById: r.createdById,
    createdAt: r.createdAt,
  };
}

export async function createNegotiationMemory(input: CreateMemoryInput): Promise<NegotiationMemoryRow> {
  const transcript = input.transcript.length > TRANSCRIPT_CAP
    ? input.transcript.slice(-TRANSCRIPT_CAP)
    : input.transcript;
  const created = await prisma.negotiationMemory.create({
    data: {
      salesSessionId: input.salesSessionId ?? null,
      primaryProjectId: input.primaryProjectId ?? null,
      projectIds: JSON.stringify(input.projectIds ?? []),
      investorName: input.investorName ?? null,
      investorPhone: input.investorPhone ?? null,
      transcript,
      summary: input.summary ?? null,
      outcome: input.outcome ?? null,
      objections: JSON.stringify(input.objections ?? []),
      tags: JSON.stringify(input.tags ?? []),
      speakerInsights: input.speakerInsights ?? null,
      managerNotes: input.managerNotes ?? null,
      createdById: input.createdById ?? null,
      // Sprint 55 P0 — provenance.
      sourceTranscriptQuality: input.sourceTranscriptQuality ?? 'draft',
    },
  });
  return rowFromDb(created);
}

// Sprint 55 P0 — upsert по salesSessionId. После recompute из clean transcript
// ОБНОВЛЯЕМ существующую memory (одна сессия — одна память), не создаём
// дубликат. Если строки ещё нет (legacy / orphan) — создаём.
//
// Cap transcript аналогично create.
export async function upsertMemoryForSession(
  salesSessionId: string,
  input: Omit<CreateMemoryInput, 'salesSessionId'>,
): Promise<NegotiationMemoryRow> {
  const transcript = input.transcript.length > TRANSCRIPT_CAP
    ? input.transcript.slice(-TRANSCRIPT_CAP)
    : input.transcript;
  const data = {
    primaryProjectId: input.primaryProjectId ?? null,
    projectIds: JSON.stringify(input.projectIds ?? []),
    investorName: input.investorName ?? null,
    investorPhone: input.investorPhone ?? null,
    transcript,
    summary: input.summary ?? null,
    outcome: input.outcome ?? null,
    objections: JSON.stringify(input.objections ?? []),
    tags: JSON.stringify(input.tags ?? []),
    speakerInsights: input.speakerInsights ?? null,
    managerNotes: input.managerNotes ?? null,
    createdById: input.createdById ?? null,
    sourceTranscriptQuality: input.sourceTranscriptQuality ?? 'clean',
  };
  // findFirst — у NegotiationMemory нет уникального индекса на
  // salesSessionId (исторически могли быть orphan memories). Берём
  // newest и обновляем. Если нет — создаём новую.
  const existing = await prisma.negotiationMemory.findFirst({
    where: { salesSessionId },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    const updated = await prisma.negotiationMemory.update({
      where: { id: existing.id },
      data,
    });
    return rowFromDb(updated);
  }
  const created = await prisma.negotiationMemory.create({
    data: { salesSessionId, ...data },
  });
  return rowFromDb(created);
}

// Lightweight retrieval: последние N записей с фильтрами по investor/project.
// Не использует embeddings — просто WHERE+ORDER BY+LIMIT. Подходит для
// контекстного блока в prompt'е (3-5 последних взаимодействий с инвестором).
export async function getRecentMemories(opts: {
  investorName?: string | null;
  projectId?: string | null;
  outcome?: string | null;
  limit?: number;
}): Promise<NegotiationMemoryRow[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 5, 20));
  // Sprint 52 P0.2 — primaryProjectId матчим точно; investorName — точное
  // совпадение (SQLite Prisma StringNullableFilter не поддерживает `mode`;
  // case-insensitivity сделаем в retrieval helper'е, если станет нужно).
  const rows = await prisma.negotiationMemory.findMany({
    where: {
      ...(opts.investorName ? { investorName: opts.investorName } : {}),
      ...(opts.projectId ? { primaryProjectId: opts.projectId } : {}),
      ...(opts.outcome ? { outcome: opts.outcome } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(rowFromDb);
}

// Dataset export для будущего fine-tuning. Группируется по outcome.
// Возвращает массивы success / failed / followup, ограниченные limit.
export async function listMemoriesByOutcome(limit = 100): Promise<{
  success: NegotiationMemoryRow[];
  failed: NegotiationMemoryRow[];
  followup: NegotiationMemoryRow[];
}> {
  const [success, failed, followup] = await Promise.all([
    prisma.negotiationMemory.findMany({
      where: { outcome: 'success' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.negotiationMemory.findMany({
      where: { outcome: 'failed' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.negotiationMemory.findMany({
      where: { outcome: 'followup' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
  ]);
  return {
    success: success.map(rowFromDb),
    failed: failed.map(rowFromDb),
    followup: followup.map(rowFromDb),
  };
}
