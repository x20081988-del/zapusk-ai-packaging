import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware, requireRole } from '../auth.js';
import { getAiCircuitBreakerStatus } from '../ai/client.js';

export const aiReliabilityRoutes = Router();
aiReliabilityRoutes.use(authMiddleware);
aiReliabilityRoutes.use(requireRole(['ADMIN', 'MANAGER']));

aiReliabilityRoutes.get('/dashboard', async (_req, res) => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await prisma.aiRequestLedger.findMany({
    where: { createdAt: { gte: since24h } },
    orderBy: { createdAt: 'desc' },
    take: 10_000,
  });

  const requests24h = rows.length;
  const failures24h = rows.filter((r) => !r.success).length;
  const fallbackCount = rows.filter((r) => r.fallbackUsed).length;
  const timeoutCount = rows.filter((r) => r.timeoutHit).length;
  const totalLatency = rows.reduce((sum, r) => sum + (r.latencyMs ?? 0), 0);
  const costRows = rows.filter((r) => r.estimatedCostUsd != null);
  const totalCost = costRows.reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0);

  res.json({
    requests24h,
    failures24h,
    fallbackRate: ratio(fallbackCount, requests24h),
    avgLatency: requests24h ? Math.round(totalLatency / requests24h) : 0,
    avgCost: costRows.length ? roundMoney(totalCost / costRows.length) : null,
    timeoutRate: ratio(timeoutCount, requests24h),
    providerSplit: splitBy(rows, 'provider'),
    featureSplit: splitBy(rows, 'feature'),
    topFailingFeatures: topByFeature(rows, (items) => items.filter((r) => !r.success).length, 8)
      .filter((r) => r.value > 0)
      .map((r) => ({ feature: r.feature, failures: r.value, requests: r.requests })),
    topExpensiveFeatures: topByFeature(rows, (items) => items.reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0), 8)
      .filter((r) => r.value > 0)
      .map((r) => ({ feature: r.feature, estimatedCostUsd: roundMoney(r.value), requests: r.requests })),
    providerHealth: getAiCircuitBreakerStatus(),
  });
});

function ratio(value: number, total: number): number {
  return total ? Number((value / total).toFixed(4)) : 0;
}

function roundMoney(value: number): number {
  return Number(value.toFixed(6));
}

function splitBy<T extends 'provider' | 'feature'>(
  rows: Array<{ provider: string; feature: string; success: boolean; fallbackUsed: boolean; timeoutHit: boolean; estimatedCostUsd: number | null }>,
  key: T,
) {
  const map = new Map<string, typeof rows>();
  for (const row of rows) {
    const k = row[key];
    map.set(k, [...(map.get(k) ?? []), row]);
  }
  return Array.from(map.entries())
    .map(([name, items]) => ({
      name,
      requests: items.length,
      failures: items.filter((r) => !r.success).length,
      fallbackRate: ratio(items.filter((r) => r.fallbackUsed).length, items.length),
      timeoutRate: ratio(items.filter((r) => r.timeoutHit).length, items.length),
      estimatedCostUsd: roundMoney(items.reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0)),
    }))
    .sort((a, b) => b.requests - a.requests);
}

function topByFeature(
  rows: Array<{ feature: string; estimatedCostUsd: number | null; success: boolean }>,
  score: (items: typeof rows) => number,
  limit: number,
) {
  const map = new Map<string, typeof rows>();
  for (const row of rows) {
    map.set(row.feature, [...(map.get(row.feature) ?? []), row]);
  }
  return Array.from(map.entries())
    .map(([feature, items]) => ({ feature, value: score(items), requests: items.length }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}
