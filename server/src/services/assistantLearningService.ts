import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

// Sprint 44 — agg-функции для learning dashboard.
//
// Архитектура наблюдаемости (Sprint 40-43):
//   KnowledgeSource ← KnowledgeRetrievalEvent.sourceIdsJson
//                   ← AssistantAdviceEvent.usedSourceIdsJson + .retrievalEventId
//                   ← AssistantOutcomeEvent.adviceEventId
//
// Sprint 44 — соединяем эти таблицы и считаем агрегаты на app-уровне. SQLite
// нативного JSON-GROUP-BY на массивах не умеет, и для текущих объёмов (<10k
// событий) парсинг в Node быстрее любых WITH-RECURSIVE ухищрений.
//
// Никаких ML, ranking'а или auto-disable. Только explainable observability.

// ─── Public types ─────────────────────────────────────────────────────────

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

export const POSITIVE_OUTCOMES: OutcomeType[] = [
  'follow_up_sent',
  'next_meeting_booked',
  'investor_requested_docs',
  'investor_interested',
  'investment_received',
];
export const NEGATIVE_OUTCOMES: OutcomeType[] = ['lost', 'ghosted', 'no_decision', 'bad_fit'];

export interface SourceMetrics {
  sourceId: string;
  title: string;
  sourceType: string;
  scope: string;
  retrievalCount: number;
  lastRetrievedAt: Date | null;
  // Counts per outcomeType (sum across all outcomes linked to advice events
  // that retrieved this source).
  outcomes: Partial<Record<OutcomeType, number>>;
  outcomesTotal: number;
  positive: number;
  negative: number;
  // Sprint 44 P1 — heuristics. Не auto-disable, только сигнал админу.
  successRate: number; // positive / total, 0..1
  lossRate: number;    // negative / total, 0..1
  classification: 'high_performing' | 'risky' | 'dead' | 'normal';
}

export interface SpinFunnelStage {
  stage: 'S' | 'P' | 'I' | 'N' | 'unknown';
  adviceCount: number;
  outcomesByType: Partial<Record<OutcomeType, number>>;
  positiveRate: number; // positive outcomes / adviceCount
}

export interface RetrievalHealth {
  totalRetrievals: number;
  emptyRetrievals: number;
  emptyRate: number;
  avgSourcesPerAdvice: number;
  avgOutcomesPerAdvice: number;
}

export interface LearningFilters {
  since?: Date;
  projectId?: string;
  outcomeType?: OutcomeType;
  actorId?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────

// Sprint 44 — safe JSON-array parsing. Используется везде вместо ручного
// try/catch вокруг JSON.parse. Возвращает [] на любом сбое — analytics не
// должна падать из-за корявой строки в одной row'е.
export function parseIdsJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function classify(positiveRate: number, lossRate: number, retrievalCount: number): SourceMetrics['classification'] {
  // Эвристики (никакого ML):
  //   • dead — published, но AI его никогда не использовал (retrievalCount=0).
  //   • risky — >50% outcomes негативны.
  //   • high_performing — >50% outcomes позитивны И есть хотя бы 3 outcomes.
  if (retrievalCount === 0) return 'dead';
  if (lossRate > 0.5) return 'risky';
  if (positiveRate > 0.5) return 'high_performing';
  return 'normal';
}

// ─── Core aggregator ──────────────────────────────────────────────────────

// Sprint 44 — собирает per-source метрики. Один проход:
//   1. Берём все outcomes.
//   2. Для каждого outcome'а, если есть adviceEventId — расширяем в usedSourceIds.
//   3. Каждый sourceId получает +1 в счётчик соответствующего outcomeType.
//   4. JOIN с KnowledgeSource (title, sourceType, scope, retrievalCount).
//
// Параметры:
//   • limit — сколько ROWS вернуть в финальном top
//   • since — фильтр по дате (опционально, для «за 7 дней»)
async function buildSourceMetrics(opts: {
  limit?: number;
  filters?: LearningFilters;
} = {}): Promise<SourceMetrics[]> {
  const filters = opts.filters ?? {};
  const outcomeWhere: Prisma.AssistantOutcomeEventWhereInput = {
    archivedAt: null,
    ...(filters.since ? { createdAt: { gt: filters.since } } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.outcomeType ? { outcomeType: filters.outcomeType } : {}),
    ...(filters.actorId
      ? { OR: [{ createdById: filters.actorId }, { adviceEvent: { is: { actorId: filters.actorId } } }] }
      : {}),
  };
  const outcomes = await prisma.assistantOutcomeEvent.findMany({
    where: outcomeWhere,
    select: {
      outcomeType: true,
      adviceEventId: true,
    },
  });

  // Соберём adviceIds, по которым нужно достать usedSourceIdsJson.
  const adviceIds = Array.from(
    new Set(outcomes.map((o) => o.adviceEventId).filter((x): x is string => Boolean(x))),
  );
  const advices = adviceIds.length
    ? await prisma.assistantAdviceEvent.findMany({
        where: { id: { in: adviceIds } },
        select: { id: true, usedSourceIdsJson: true },
      })
    : [];
  const adviceSourceMap = new Map<string, string[]>();
  for (const a of advices) adviceSourceMap.set(a.id, parseIdsJson(a.usedSourceIdsJson));

  // Per-source outcome counts.
  const perSource: Record<string, Partial<Record<OutcomeType, number>>> = {};
  for (const o of outcomes) {
    if (!o.adviceEventId) continue; // outcome без advice — не вклад в источник
    const srcs = adviceSourceMap.get(o.adviceEventId) ?? [];
    for (const sid of srcs) {
      const bucket = perSource[sid] ?? (perSource[sid] = {});
      const ot = o.outcomeType as OutcomeType;
      bucket[ot] = (bucket[ot] ?? 0) + 1;
    }
  }

  const sourceIds = Object.keys(perSource);
  if (sourceIds.length === 0 && filters.actorId) return [];
  if (sourceIds.length === 0) {
    // Нет outcome-данных. Возвращаем top retrievalCount источников чтобы
    // дашборд показал хоть что-то осмысленное.
    const sources = await prisma.knowledgeSource.findMany({
      where: {
        archivedAt: null,
        status: 'published',
        ...(filters.projectId
          ? { OR: [{ projectId: filters.projectId }, { scope: 'global' }] }
          : {}),
      },
      orderBy: { retrievalCount: 'desc' },
      take: opts.limit ?? 50,
      select: { id: true, title: true, sourceType: true, scope: true, retrievalCount: true, lastRetrievedAt: true },
    });
    return sources.map<SourceMetrics>((s) => ({
      sourceId: s.id,
      title: s.title,
      sourceType: s.sourceType,
      scope: s.scope,
      retrievalCount: s.retrievalCount,
      lastRetrievedAt: s.lastRetrievedAt,
      outcomes: {},
      outcomesTotal: 0,
      positive: 0,
      negative: 0,
      successRate: 0,
      lossRate: 0,
      classification: classify(0, 0, s.retrievalCount),
    }));
  }

  const sources = await prisma.knowledgeSource.findMany({
    where: { id: { in: sourceIds }, archivedAt: null },
    select: { id: true, title: true, sourceType: true, scope: true, retrievalCount: true, lastRetrievedAt: true },
  });

  const result: SourceMetrics[] = sources.map((s) => {
    const counts = perSource[s.id] ?? {};
    let positive = 0;
    let negative = 0;
    let total = 0;
    for (const ot of POSITIVE_OUTCOMES) positive += counts[ot] ?? 0;
    for (const ot of NEGATIVE_OUTCOMES) negative += counts[ot] ?? 0;
    total = positive + negative;
    const successRate = total > 0 ? positive / total : 0;
    const lossRate = total > 0 ? negative / total : 0;
    return {
      sourceId: s.id,
      title: s.title,
      sourceType: s.sourceType,
      scope: s.scope,
      retrievalCount: s.retrievalCount,
      lastRetrievedAt: s.lastRetrievedAt,
      outcomes: counts,
      outcomesTotal: total,
      positive,
      negative,
      successRate: Number(successRate.toFixed(3)),
      lossRate: Number(lossRate.toFixed(3)),
      classification: classify(successRate, lossRate, s.retrievalCount),
    };
  });

  // По умолчанию сортируем по total outcomes desc — самые «обсуждаемые» наверху.
  result.sort((a, b) => b.outcomesTotal - a.outcomesTotal);
  return result.slice(0, opts.limit ?? 50);
}

// ─── Public dashboards ────────────────────────────────────────────────────

export async function topPerformingSources(
  outcomeTypes: OutcomeType[],
  limit = 10,
  filters: LearningFilters = {},
): Promise<SourceMetrics[]> {
  const mergedFilters: LearningFilters = {
    ...filters,
    outcomeType: filters.outcomeType,
  };
  const all = await buildSourceMetrics({ limit: 200, filters: mergedFilters });
  // Sort by sum of outcome counts in the filter.
  const activeOutcomeTypes = filters.outcomeType ? [filters.outcomeType] : outcomeTypes;
  return all
    .map((s) => ({
      s,
      hits: activeOutcomeTypes.reduce((acc, ot) => acc + (s.outcomes[ot] ?? 0), 0),
    }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map((x) => x.s);
}

export async function weakSources(limit = 10, filters: LearningFilters = {}): Promise<SourceMetrics[]> {
  return topPerformingSources(NEGATIVE_OUTCOMES, limit, filters);
}

export async function materialTypePerformance(filters: LearningFilters = {}): Promise<Array<{
  sourceType: string;
  sourceCount: number;
  outcomes: Partial<Record<OutcomeType, number>>;
  outcomesTotal: number;
  positiveRate: number;
}>> {
  const all = await buildSourceMetrics({ limit: 500, filters });
  const byType: Record<string, {
    sourceCount: number;
    outcomes: Partial<Record<OutcomeType, number>>;
    positive: number;
    negative: number;
  }> = {};
  for (const s of all) {
    const bucket = byType[s.sourceType] ?? (byType[s.sourceType] = {
      sourceCount: 0,
      outcomes: {},
      positive: 0,
      negative: 0,
    });
    bucket.sourceCount += 1;
    for (const [ot, n] of Object.entries(s.outcomes)) {
      bucket.outcomes[ot as OutcomeType] = (bucket.outcomes[ot as OutcomeType] ?? 0) + (n as number);
    }
    bucket.positive += s.positive;
    bucket.negative += s.negative;
  }
  return Object.entries(byType).map(([sourceType, b]) => {
    const total = b.positive + b.negative;
    return {
      sourceType,
      sourceCount: b.sourceCount,
      outcomes: b.outcomes,
      outcomesTotal: total,
      positiveRate: total > 0 ? Number((b.positive / total).toFixed(3)) : 0,
    };
  }).sort((a, b) => b.outcomesTotal - a.outcomesTotal);
}

export async function spinFunnel(filters: LearningFilters = {}): Promise<SpinFunnelStage[]> {
  // Sprint 44 — funnel по SPIN-этапу. AssistantAdviceEvent.spinStage уже хранит
  // на момент совета, какой это был этап. Outcome через FK adviceEventId.
  const outcomeWhere: Prisma.AssistantOutcomeEventWhereInput = {
    archivedAt: null,
    ...(filters.since ? { createdAt: { gt: filters.since } } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.outcomeType ? { outcomeType: filters.outcomeType } : {}),
  };
  const adviceWhere: Prisma.AssistantAdviceEventWhereInput = {
    ...(filters.since ? { createdAt: { gt: filters.since } } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.outcomeType ? { outcomes: { some: outcomeWhere } } : {}),
  };
  const advices = await prisma.assistantAdviceEvent.findMany({
    where: adviceWhere,
    select: { id: true, spinStage: true, outcomes: { where: outcomeWhere, select: { outcomeType: true } } },
  });

  const stages: Array<SpinFunnelStage['stage']> = ['S', 'P', 'I', 'N', 'unknown'];
  const result: SpinFunnelStage[] = stages.map((stage) => ({
    stage, adviceCount: 0, outcomesByType: {}, positiveRate: 0,
  }));

  for (const a of advices) {
    const s = (a.spinStage === 'S' || a.spinStage === 'P' || a.spinStage === 'I' || a.spinStage === 'N')
      ? a.spinStage
      : 'unknown';
    const slot = result.find((r) => r.stage === s)!;
    slot.adviceCount += 1;
    for (const o of a.outcomes) {
      const ot = o.outcomeType as OutcomeType;
      slot.outcomesByType[ot] = (slot.outcomesByType[ot] ?? 0) + 1;
    }
  }

  for (const slot of result) {
    let positive = 0;
    let total = 0;
    for (const ot of POSITIVE_OUTCOMES) positive += slot.outcomesByType[ot] ?? 0;
    for (const ot of NEGATIVE_OUTCOMES) total += slot.outcomesByType[ot] ?? 0;
    total += positive;
    slot.positiveRate = total > 0 ? Number((positive / total).toFixed(3)) : 0;
  }

  return result;
}

export async function outcomeDistribution(filters: LearningFilters = {}): Promise<{
  byType: Partial<Record<OutcomeType, number>>;
  total: number;
}> {
  const rows = await prisma.assistantOutcomeEvent.groupBy({
    by: ['outcomeType'],
    where: {
      archivedAt: null,
      ...(filters.since ? { createdAt: { gt: filters.since } } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.outcomeType ? { outcomeType: filters.outcomeType } : {}),
      ...(filters.actorId
        ? { OR: [{ createdById: filters.actorId }, { adviceEvent: { is: { actorId: filters.actorId } } }] }
        : {}),
    },
    _count: { _all: true },
  });
  const byType: Partial<Record<OutcomeType, number>> = {};
  let total = 0;
  for (const r of rows) {
    byType[r.outcomeType as OutcomeType] = r._count._all;
    total += r._count._all;
  }
  return { byType, total };
}

export async function retrievalHealth(filters: LearningFilters = {}): Promise<RetrievalHealth> {
  const since = filters.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const retrievalWhere: Prisma.KnowledgeRetrievalEventWhereInput = {
    createdAt: { gt: since },
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
  };
  const totalRetrievals = await prisma.knowledgeRetrievalEvent.count({
    where: retrievalWhere,
  });
  const emptyRetrievals = await prisma.knowledgeRetrievalEvent.count({
    where: { ...retrievalWhere, sourceCount: 0 },
  });

  // avg sources per advice — берём только full-phase события (Sprint 43 P0.3
  // fast не пишет advice, так что фильтра не нужно — все advices full).
  const advices = await prisma.assistantAdviceEvent.findMany({
    where: {
      createdAt: { gt: since },
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
    },
    select: {
      usedSourceIdsJson: true,
      outcomes: {
        where: {
          archivedAt: null,
          ...(filters.projectId ? { projectId: filters.projectId } : {}),
          ...(filters.outcomeType ? { outcomeType: filters.outcomeType } : {}),
        },
        select: { id: true },
      },
    },
  });
  const adviceCount = advices.length;
  let totalSourcesAcross = 0;
  let totalOutcomesAcross = 0;
  for (const a of advices) {
    totalSourcesAcross += parseIdsJson(a.usedSourceIdsJson).length;
    totalOutcomesAcross += a.outcomes.length;
  }
  return {
    totalRetrievals,
    emptyRetrievals,
    emptyRate: totalRetrievals > 0 ? Number((emptyRetrievals / totalRetrievals).toFixed(3)) : 0,
    avgSourcesPerAdvice: adviceCount > 0 ? Number((totalSourcesAcross / adviceCount).toFixed(2)) : 0,
    avgOutcomesPerAdvice: adviceCount > 0 ? Number((totalOutcomesAcross / adviceCount).toFixed(2)) : 0,
  };
}

// Composite dashboard payload.
export async function buildDashboardPayload(filters: LearningFilters = {}): Promise<{
  topPerforming: SourceMetrics[];
  weak: SourceMetrics[];
  materialTypes: Awaited<ReturnType<typeof materialTypePerformance>>;
  spinFunnel: SpinFunnelStage[];
  outcomes: Awaited<ReturnType<typeof outcomeDistribution>>;
  outcomes30d: Awaited<ReturnType<typeof outcomeDistribution>>;
  retrievalHealth: RetrievalHealth;
}> {
  const outcomes30dFilters: LearningFilters = {
    ...filters,
    since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  };
  const [topPerforming, weak, materialTypes, funnel, outcomesAll, outcomes30d, health] = await Promise.all([
    topPerformingSources(['investment_received', 'next_meeting_booked', 'investor_interested'], 10, filters),
    weakSources(10, filters),
    materialTypePerformance(filters),
    spinFunnel(filters),
    outcomeDistribution(filters),
    outcomeDistribution(outcomes30dFilters),
    retrievalHealth(filters),
  ]);
  return { topPerforming, weak, materialTypes, spinFunnel: funnel, outcomes: outcomesAll, outcomes30d, retrievalHealth: health };
}

export async function exportLearningCsv(filters: LearningFilters = {}): Promise<string> {
  const sources = await buildSourceMetrics({ limit: 1000, filters });
  const header = [
    'source title',
    'materialType',
    'retrievalCount',
    'follow_up_sent',
    'next_meeting_booked',
    'investor_requested_docs',
    'investor_interested',
    'investment_received',
    'lost',
    'ghosted',
    'no_decision',
    'bad_fit',
    'success rate',
    'lost rate',
    'lastRetrievedAt',
  ];
  const rows = sources.map((s) => [
    s.title,
    s.sourceType,
    String(s.retrievalCount),
    String(s.outcomes.follow_up_sent ?? 0),
    String(s.outcomes.next_meeting_booked ?? 0),
    String(s.outcomes.investor_requested_docs ?? 0),
    String(s.outcomes.investor_interested ?? 0),
    String(s.outcomes.investment_received ?? 0),
    String(s.outcomes.lost ?? 0),
    String(s.outcomes.ghosted ?? 0),
    String(s.outcomes.no_decision ?? 0),
    String(s.outcomes.bad_fit ?? 0),
    String(s.successRate),
    String(s.lossRate),
    s.lastRetrievedAt ? s.lastRetrievedAt.toISOString() : '',
  ]);
  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

function csvEscape(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
