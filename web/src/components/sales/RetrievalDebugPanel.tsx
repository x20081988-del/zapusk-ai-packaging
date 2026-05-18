// Sprint 62 P2 — Internal retrieval debug panel.
//
// What it does:
//   For ADMIN/MANAGER role on the live AI hint card, shows a collapsible
//   panel that runs /api/knowledge/search-debug-v2 against the LAST analyzed
//   transcript+projectId, displaying full score breakdown:
//     • per-chunk: title, source type, scope (project/global), final score
//     • breakdown: bm25Norm, keywordScore, qualityBoost, projectBoost,
//       typeBoost, freshnessBoost
//     • reasons array — human-readable «why this chunk won»
//     • FTS availability
//     • total chunks scanned
//     • retrieval latency
//
// Why a separate panel (not enriching the analyze response):
//   • analyze response is hot-path; debug mode would slow it (rerank cost)
//   • only admin/manager need this; founder UI stays clean
//   • debug endpoint already has auth gate (requireRole ADMIN/MANAGER)
//   • on-demand fetch lets us A/B compare with financeBoost on/off
//
// Visibility:
//   <RetrievalDebugPanel ... /> renders null for non-admin; safe to mount
//   unconditionally from SalesAssistant.

import { useState } from 'react';
import { Bug, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { api } from '../../lib/api';
import { getAuth } from '../../lib/auth';

interface ScoreBreakdown {
  bm25Score: number;
  bm25Norm: number;
  keywordScore: number;
  qualityBoost: number;
  projectBoost: number;
  typeBoost: number;
  freshnessBoost: number;
  finalScore: number;
  reasons: string[];
}

interface DebugResult {
  sourceId: string;
  chunkId?: string;
  title: string;
  sourceType: string;
  scope: 'global' | 'project';
  visibility: 'internal' | 'client_safe';
  summary: string | null;
  snippet: string;
  finalScore: number;
  breakdown?: ScoreBreakdown;
}

interface DebugResponse {
  ftsAvailable: boolean;
  hybridResults: DebugResult[];
  totalChunksScanned: number;
}

interface Props {
  /** Transcript that was sent to analyze (with manual + interim). */
  lastAnalyzedTranscript: string | null;
  /** Project context for retrieval. */
  projectId: string | null;
  /** If true, financeBoost is forced ON to match Sprint 61 auto-detection. */
  financeBoostHint: boolean;
}

export function RetrievalDebugPanel({ lastAnalyzedTranscript, projectId, financeBoostHint }: Props) {
  const auth = getAuth();
  const role = auth?.role;
  const isAdminLike = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MANAGER';

  // Always call hooks at top-level — bail with null AFTER hook section so
  // React's hook-rules contract is preserved across role changes.
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DebugResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [financeMode, setFinanceMode] = useState<boolean | null>(null); // null = auto
  const [feature, setFeature] = useState<'sales_assistant.analyze' | 'sales_assistant.analyze_fast'>('sales_assistant.analyze');

  if (!isAdminLike) return null;
  if (!lastAnalyzedTranscript || lastAnalyzedTranscript.trim().length < 3) return null;

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    setResult(null);
    const startedAt = performance.now();
    try {
      // Limit query length — search-debug-v2 caps at 8000 chars.
      const query = (lastAnalyzedTranscript ?? '').slice(-7_000);
      const r = await api.post<DebugResponse>('/api/knowledge/search-debug-v2', {
        query,
        projectId: projectId ?? null,
        topN: 12,
        financeBoost: financeMode,
        feature,
      });
      setLatencyMs(Math.round(performance.now() - startedAt));
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'debug_search_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padded accent="ai" className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-ai-glow uppercase tracking-[0.1em]">
          <Bug size={12} />
          Retrieval debug · {role}
        </span>
        {open ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <CardHeader
            title="Что AI получил из KB"
            subtitle="Внутренняя диагностика — видна только админу/менеджеру. Прогоняет тот же transcript через retrieval в debug-режиме и показывает breakdown."
          />

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted">financeBoost</span>
              <select
                value={financeMode === null ? 'auto' : financeMode ? 'on' : 'off'}
                onChange={(e) => {
                  const v = e.target.value;
                  setFinanceMode(v === 'auto' ? null : v === 'on');
                }}
                className="text-xs bg-canvas border border-line rounded px-2 py-1"
              >
                <option value="auto">auto (как в проде)</option>
                <option value="on">on (форсировано)</option>
                <option value="off">off (выключено)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted">feature</span>
              <select
                value={feature}
                onChange={(e) => setFeature(e.target.value as typeof feature)}
                className="text-xs bg-canvas border border-line rounded px-2 py-1"
              >
                <option value="sales_assistant.analyze">analyze (full)</option>
                <option value="sales_assistant.analyze_fast">analyze (fast)</option>
              </select>
            </div>
            <Button size="sm" variant="ai" onClick={run} loading={busy} disabled={busy} iconLeft={busy ? <Loader2 size={12} /> : <Bug size={12} />}>
              {busy ? 'Запрашиваю…' : 'Запустить retrieval-debug'}
            </Button>
          </div>

          {error && <div className="text-xs text-danger">Ошибка: {error}</div>}

          {result && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                {result.ftsAvailable
                  ? <StatusBadge tone="success" dot>FTS5 + hybrid</StatusBadge>
                  : <StatusBadge tone="warning" dot>FTS5 недоступен — keyword fallback</StatusBadge>}
                <span>top-{result.hybridResults.length} из {result.totalChunksScanned} сканированных chunk'ов</span>
                {latencyMs !== null && (
                  <span>· retrieval latency: <span className="font-num text-primary">{latencyMs}</span> мс</span>
                )}
              </div>

              {result.hybridResults.length === 0 ? (
                <div className="text-xs text-muted">Retrieval не нашёл ни одного chunk'а выше порога. Проверь, есть ли KB-источники для projectId.</div>
              ) : (
                <div className="space-y-2">
                  {/* Project-vs-global split summary. */}
                  <ProjectGlobalSplit results={result.hybridResults} />

                  {result.hybridResults.map((r, i) => (
                    <ResultRow key={r.sourceId} idx={i + 1} r={r} topScore={result.hybridResults[0]?.finalScore ?? 0} />
                  ))}
                </div>
              )}
            </div>
          )}

          {!result && !busy && !error && (
            <div className="text-xs text-muted">
              Запусти и увидишь, какие именно chunk'и AI получил для этой подсказки. Можешь A/B сравнить с/без financeBoost.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ProjectGlobalSplit({ results }: { results: DebugResult[] }) {
  const projectCount = results.filter((r) => r.scope === 'project').length;
  const globalCount = results.filter((r) => r.scope === 'global').length;
  return (
    <div className="text-[11px] text-muted flex items-center gap-3 flex-wrap">
      <span>scope split:</span>
      <StatusBadge tone="ai">{projectCount} project</StatusBadge>
      <StatusBadge tone="neutral">{globalCount} global</StatusBadge>
    </div>
  );
}

function ResultRow({ idx, r, topScore }: { idx: number; r: DebugResult; topScore: number }) {
  const [showSnippet, setShowSnippet] = useState(false);
  const dominancePct = topScore > 0 ? Math.round((r.finalScore / topScore) * 100) : 0;
  return (
    <div className="border border-hairline rounded-md bg-canvas/30 p-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold">#{idx} · {r.sourceType} · {r.scope === 'project' ? 'PROJECT' : 'GLOBAL'}</div>
          <div className="text-[12.5px] text-primary font-medium mt-0.5 truncate">{r.title}</div>
          {r.summary && <div className="text-[11px] text-secondary mt-0.5 leading-snug">{r.summary}</div>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-base font-num text-primary font-bold">{r.finalScore.toFixed(4)}</div>
          <div className="text-[10px] text-muted">{dominancePct}% top</div>
        </div>
      </div>
      {r.breakdown && (
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-[10.5px] font-num text-muted">
          <div>bm25Norm: <span className="text-primary">{r.breakdown.bm25Norm.toFixed(3)}</span></div>
          <div>keywordScore: <span className="text-primary">{r.breakdown.keywordScore.toFixed(3)}</span></div>
          <div>qualityBoost: <span className="text-primary">{r.breakdown.qualityBoost.toFixed(2)}</span></div>
          <div>projectBoost: <span className="text-primary">{r.breakdown.projectBoost.toFixed(2)}</span></div>
          <div>typeBoost: <span className="text-primary">{r.breakdown.typeBoost.toFixed(2)}</span></div>
          <div>freshnessBoost: <span className="text-primary">{r.breakdown.freshnessBoost.toFixed(2)}</span></div>
        </div>
      )}
      {r.breakdown?.reasons.length ? (
        <div className="mt-2 text-[10.5px] text-secondary flex flex-wrap gap-1.5">
          {r.breakdown.reasons.map((reason, ri) => (
            <StatusBadge key={`${reason}-${ri}`} tone={highlightTone(reason)}>{reason}</StatusBadge>
          ))}
        </div>
      ) : null}
      {r.snippet && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowSnippet((v) => !v)}
            className="text-[10px] text-muted hover:text-primary underline-offset-2 hover:underline"
          >
            {showSnippet ? 'Скрыть chunk' : 'Показать chunk-text'}
          </button>
          {showSnippet && (
            <pre className="mt-1 max-h-48 overflow-y-auto text-[11px] text-muted bg-canvas border border-hairline rounded p-2 whitespace-pre-wrap leading-snug">
              {r.snippet.length > 1500 ? `${r.snippet.slice(0, 1500)}…` : r.snippet}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function highlightTone(reason: string): 'ai' | 'success' | 'warning' | 'neutral' {
  if (reason.startsWith('finance_question_boosted')) return 'success';
  if (reason.startsWith('project_presentation_boosted')) return 'success';
  if (reason === 'project_source') return 'ai';
  if (reason === 'fts_match') return 'ai';
  if (reason === 'keyword_overlap') return 'neutral';
  if (reason === 'verified') return 'success';
  if (reason.startsWith('quality_')) return 'success';
  if (reason === 'fresh_<30d') return 'ai';
  return 'neutral';
}
