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
  since?: Date;
} = {}): Promise<SourceMetrics[]> {
  const outcomeWhere = opts.since ? { createdAt: { gt: opts.since } } : {};
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
  if (sourceIds.length === 0) {
    // Нет outcome-данных. Возвращаем top retrievalCount источников чтобы
    // дашборд показал хоть что-то осмысленное.
    const sources = await prisma.knowledgeSource.findMany({
      where: { archivedAt: null, status: 'published' },
      orderBy: { retrievalCount: 'desc' },
      take: opts.limit ?? 50,
      select: { id: true, title: true, sourceType: true, scope: true, retrievalCount: true },
    });
    return sources.map<SourceMetrics>((s) => ({
      sourceId: s.id,
      title: s.title,
      sourceType: s.sourceType,
      scope: s.scope,
      retrievalCount: s.retrievalCount,
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
    where: { id: { in: sourceIds } },
    select: { id: true, title: true, sourceType: true, scope: true, retrievalCount: true },
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
): Promise<SourceMetrics[]> {
  const all = await buildSourceMetrics({ limit: 200 });
  // Sort by sum of outcome counts in the filter.
  return all
    .map((s) => ({
      s,
      hits: outcomeTypes.reduce((acc, ot) => acc + (s.outcomes[ot] ?? 0), 0),
    }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map((x) => x.s);
}

export async function weakSources(limit = 10): Promise<SourceMetrics[]> {
  return topPerformingSources(NEGATIVE_OUTCOMES, limit);
}

export async function materialTypePerformance(): Promise<Array<{
  sourceType: string;
  sourceCount: number;
  outcomes: Partial<Record<OutcomeType, number>>;
  outcomesTotal: number;
  positiveRate: number;
}>> {
  const all = await buildSourceMetrics({ limit: 500 });
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

export async function spinFunnel(): Promise<SpinFunnelStage[]> {
  // Sprint 44 — funnel по SPIN-этапу. AssistantAdviceEvent.spinStage уже хранит
  // на момент совета, какой это был этап. Outcome через FK adviceEventId.
  const advices = await prisma.assistantAdviceEvent.findMany({
    select: { id: true, spinStage: true, outcomes: { select: { outcomeType: true } } },
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

export async function outcomeDistribution(sinceDays?: number): Promise<{
  byType: Partial<Record<OutcomeType, number>>;
  total: number;
}> {
  const since = sinceDays ? new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000) : undefined;
  const rows = await prisma.assistantOutcomeEvent.groupBy({
    by: ['outcomeType'],
    where: since ? { createdAt: { gt: since } } : {},
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

export async function retrievalHealth(sinceDays = 30): Promise<RetrievalHealth> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const totalRetrievals = await prisma.knowledgeRetrievalEvent.count({
    where: { createdAt: { gt: since } },
  });
  const emptyRetrievals = await prisma.knowledgeRetrievalEvent.count({
    where: { createdAt: { gt: since }, sourceCount: 0 },
  });

  // avg sources per advice — берём только full-phase события (Sprint 43 P0.3
  // fast не пишет advice, так что фильтра не нужно — все advices full).
  const advices = await prisma.assistantAdviceEvent.findMany({
    where: { createdAt: { gt: since } },
    select: { usedSourceIdsJson: true, outcomes: { select: { id: true } } },
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
export async function buildDashboardPayload(): Promise<{
  topPerforming: SourceMetrics[];
  weak: SourceMetrics[];
  materialTypes: Awaited<ReturnType<typeof materialTypePerformance>>;
  spinFunnel: SpinFunnelStage[];
  outcomes: Awaited<ReturnType<typeof outcomeDistribution>>;
  outcomes30d: Awaited<ReturnType<typeof outcomeDistribution>>;
  retrievalHealth: RetrievalHealth;
}> {
  const [topPerforming, weak, materialTypes, funnel, outcomesAll, outcomes30d, health] = await Promise.all([
    topPerformingSources(['investment_received', 'next_meeting_booked', 'investor_interested'], 10),
    weakSources(10),
    materialTypePerformance(),
    spinFunnel(),
    outcomeDistribution(),
    outcomeDistribution(30),
    retrievalHealth(30),
  ]);
  return { topPerforming, weak, materialTypes, spinFunnel: funnel, outcomes: outcomesAll, outcomes30d, retrievalHealth: health };
}
