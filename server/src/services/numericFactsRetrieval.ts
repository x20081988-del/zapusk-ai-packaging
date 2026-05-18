// Sprint 62 P5 — Numeric facts retrieval helper.
//
// At analyze time, when the founder transcript triggers a financial question,
// `buildProjectFinancialFacts` (Sprint 61) injects a deterministic block
// from brief.keyMetrics / brief.napkin / InvestorTerms. Sprint 62 P5 adds
// a richer source: ProjectNumericFact rows extracted from uploaded XLSX
// sheets.
//
// Selection logic:
//   • Filter by projectId.
//   • If transcript mentions a year (2024..2032), prefer facts with that period.
//   • If transcript mentions a known metric slug (cac, ltv, profit, выручка…),
//     prefer facts whose metricSlug matches.
//   • Limit to top-15 by confidence so prompt stays compact.
//
// Output shape mirrors the FinancialFact in projectFinancialFacts.ts so the
// downstream formatter can render them uniformly with brief facts.

import { prisma } from '../db.js';

export interface NumericFactForPrompt {
  metric: string;
  metricSlug: string;
  period: string | null;
  value: number;
  unit: string | null;
  sectionLabel: string | null;
  rowLabel: string | null;
  confidence: number;
  /** For provenance string «по финмодели → Sheet: P&L 2027 / Чистая прибыль». */
  fileSummary: string | null;
}

interface RetrieveOptions {
  projectIds: string[];
  transcript: string;
  /** Hard cap on rows returned. */
  limit?: number;
}

const YEAR_RX_G = /(20\d{2})/g;
const METRIC_HINTS: Array<{ rx: RegExp; slug: string }> = [
  { rx: /выручк/i,                    slug: 'revenue' },
  { rx: /чист(?:ая|ый)\s*прибыл/i,    slug: 'net_profit' },
  { rx: /прибыл/i,                    slug: 'profit' },
  { rx: /убыток|loss/i,               slug: 'loss' },
  { rx: /margin|маржа|маржинальн/i,   slug: 'margin' },
  { rx: /ebitda/i,                    slug: 'ebitda' },
  { rx: /payback|окупаемост/i,        slug: 'payback' },
  { rx: /оценк|valuation/i,           slug: 'valuation' },
  { rx: /cac/i,                       slug: 'cac' },
  { rx: /ltv/i,                       slug: 'ltv' },
  { rx: /arpu/i,                      slug: 'arpu' },
  { rx: /mrr/i,                       slug: 'mrr' },
  { rx: /arr\b/i,                     slug: 'arr' },
  { rx: /gmv/i,                       slug: 'gmv' },
  { rx: /capex/i,                     slug: 'capex' },
  { rx: /opex/i,                      slug: 'opex' },
  { rx: /cash[\s_-]?flow|денежн.*поток/i, slug: 'cash_flow' },
];

function extractYearsFromTranscript(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  YEAR_RX_G.lastIndex = 0;
  while ((m = YEAR_RX_G.exec(text)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  }
  return out;
}

function extractMetricSlugsFromTranscript(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { rx, slug } of METRIC_HINTS) {
    if (rx.test(text) && !seen.has(slug)) { seen.add(slug); out.push(slug); }
  }
  return out;
}

export async function retrieveProjectNumericFacts(opts: RetrieveOptions): Promise<NumericFactForPrompt[]> {
  const { projectIds, transcript } = opts;
  if (!projectIds.length || !transcript) return [];
  const limit = opts.limit ?? 15;
  const years = extractYearsFromTranscript(transcript);
  const slugs = extractMetricSlugsFromTranscript(transcript);

  // Fetch up to 200 facts for the project(s) so we can rank in memory.
  // (200 is plenty — a single XLSX rarely yields >100 facts.)
  const rows = await prisma.projectNumericFact.findMany({
    where: { projectId: { in: projectIds } },
    orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });
  if (rows.length === 0) return [];

  // Score = base confidence + year match boost + slug match boost.
  const scored = rows.map((r) => {
    let score = r.confidence;
    if (r.period && years.includes(r.period)) score += 30;
    if (slugs.includes(r.metricSlug)) score += 20;
    return { row: r, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // If transcript has clear hints, filter to relevant only; otherwise
  // surface the top-confidence overall.
  const relevant = (years.length > 0 || slugs.length > 0)
    ? scored.filter((s) => {
        if (years.length > 0 && s.row.period && years.includes(s.row.period)) return true;
        if (slugs.length > 0 && slugs.includes(s.row.metricSlug)) return true;
        return false;
      })
    : scored;

  const pick = (relevant.length > 0 ? relevant : scored).slice(0, limit);
  return pick.map(({ row }) => ({
    metric: row.metric,
    metricSlug: row.metricSlug,
    period: row.period,
    value: row.value,
    unit: row.unit,
    sectionLabel: row.sectionLabel,
    rowLabel: row.rowLabel,
    confidence: row.confidence,
    fileSummary: row.sectionLabel,
  }));
}

// Pure helper for tests / smoke. Mirrors retrieveProjectNumericFacts ranking
// logic but against an in-memory rows array. Same scoring, same filter,
// same top-N cap.
export function rankNumericFactsInMemory(
  rows: Array<{ projectId: string; metric: string; metricSlug: string; period: string | null; value: number; unit: string | null; sectionLabel: string | null; rowLabel: string | null; confidence: number }>,
  transcript: string,
  limit = 15,
): NumericFactForPrompt[] {
  const years = extractYearsFromTranscript(transcript);
  const slugs = extractMetricSlugsFromTranscript(transcript);
  const scored = rows.map((r) => {
    let score = r.confidence;
    if (r.period && years.includes(r.period)) score += 30;
    if (slugs.includes(r.metricSlug)) score += 20;
    return { row: r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const relevant = (years.length > 0 || slugs.length > 0)
    ? scored.filter((s) => {
        if (years.length > 0 && s.row.period && years.includes(s.row.period)) return true;
        if (slugs.length > 0 && slugs.includes(s.row.metricSlug)) return true;
        return false;
      })
    : scored;
  const pick = (relevant.length > 0 ? relevant : scored).slice(0, limit);
  return pick.map(({ row }) => ({
    metric: row.metric, metricSlug: row.metricSlug, period: row.period,
    value: row.value, unit: row.unit, sectionLabel: row.sectionLabel,
    rowLabel: row.rowLabel, confidence: row.confidence,
    fileSummary: row.sectionLabel,
  }));
}
