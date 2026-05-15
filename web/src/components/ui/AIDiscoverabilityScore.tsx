import { useEffect, useState } from 'react';
import { Cpu, Eye, FileText, Hash, Quote, Sparkles } from 'lucide-react';
import { Card, CardHeader } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';
import { api, type PackagingJob } from '../../lib/api';

// Sprint 20 — AI Discoverability Score block.
//
// Показывает, насколько готовая инвестиционная упаковка проекта видна для
// AI search engines (ChatGPT / Claude / Perplexity / answer engines). Это
// собственная метрика Zapusk AI поверх AEO-инфраструктуры — не «SEO», не
// «Semrush»: клиент не должен видеть никаких vendor names.
//
// Источник данных — последний PackagingJob с outputType=ai_visibility_report.
// Если такого ещё нет (проект только что создан) — показываем плейсхолдер
// с CTA «Сгенерировать AI Discoverability отчёт». Если job свежий, но
// status awaiting_manager / queued — рендерим демо-baseline (50/50 уровень)
// чтобы UX не пустовал.
//
// MVP: оценки вычисляются эвристикой по PackagingJob count'ам + наличию
// FAQ-материала в проекте. В будущем мы можем парсить markdown-отчёт от
// AI и доставать оттуда явные числа.

interface Props {
  projectId: string | undefined;
  /** Опциональный hook на запуск генерации отчёта. */
  onGenerate?: () => void;
}

interface ScoreSegment {
  key: string;
  label: string;
  icon: React.ReactNode;
  hint: string;
}

const SEGMENTS: ScoreSegment[] = [
  { key: 'readability', label: 'Читаемость для AI', icon: <Eye size={13} />, hint: 'Насколько структуру страницы понимают AI-краулеры' },
  { key: 'keywords', label: 'Инвестиционные ключевые слова', icon: <Hash size={13} />, hint: 'Покрытие ключевых слов, важных для инвесторов' },
  { key: 'faq', label: 'Качество FAQ', icon: <FileText size={13} />, hint: 'Готовность FAQ-блоков к AI-цитированию' },
  { key: 'structure', label: 'Семантическая структура', icon: <Sparkles size={13} />, hint: 'Иерархия H1/H2/H3 и структурированные резюме' },
  { key: 'citation', label: 'Готовность к цитированию', icon: <Quote size={13} />, hint: 'Могут ли AI-поисковики цитировать страницу' },
];

interface Scores {
  overall: number;
  readability: number;
  keywords: number;
  faq: number;
  structure: number;
  citation: number;
  source: 'ai' | 'heuristic' | 'baseline';
  generatedAt: string | null;
  reportJobId: string | null;
}

export function AIDiscoverabilityScore({ projectId, onGenerate }: Props) {
  const [scores, setScores] = useState<Scores | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setScores(null);
    if (!projectId) {
      setLoading(false);
      return;
    }
    api.get<{ jobs: PackagingJob[] }>(`/api/packaging-jobs/project/${projectId}`)
      .then((r) => {
        setScores(deriveScores(r.jobs));
      })
      .catch(() => setScores(null))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const overallTone = scores
    ? scores.overall >= 75 ? 'success'
      : scores.overall >= 50 ? 'ai'
      : 'warning'
    : 'neutral';

  return (
    <Card padded accent="ai">
      <CardHeader
        title="Видимость в AI-поиске"
        subtitle="Готовность проекта к AI-поиску и AI-поисковикам"
        action={
          scores?.source === 'baseline' ? (
            <Button
              size="sm"
              variant="ai"
              iconLeft={<Sparkles size={13} />}
              onClick={onGenerate}
              disabled={!onGenerate}
            >
              Сгенерировать отчёт
            </Button>
          ) : (
            <StatusBadge tone={scores?.source === 'ai' ? 'success' : 'ai'} dot>
              {scores?.source === 'ai' ? 'AI отчёт' : 'эвристика'}
            </StatusBadge>
          )
        }
      />

      {/* OVERALL score — большая цифра + краткое summary */}
      <div className="flex items-center gap-4 mb-4">
        <div className="w-16 h-16 rounded-lg bg-grad-ai/15 border border-ai/30 flex flex-col items-center justify-center text-ai-glow">
          <Cpu size={16} className="mb-0.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-primary font-num leading-none">
              {loading ? '—' : scores?.overall ?? '—'}
            </span>
            <span className="text-sm text-muted font-num">/100</span>
            {!loading && scores && (
              <StatusBadge tone={overallTone} dot>
                {scores.overall >= 75 ? 'Готов к AI-поиску'
                  : scores.overall >= 50 ? 'Подготовка в работе'
                    : 'нужны улучшения'}
              </StatusBadge>
            )}
          </div>
          <p className="text-xs text-muted mt-1 leading-snug">
            Метрика собственной инфраструктуры ZAPUSK AI · видимость в AI-поисковиках
          </p>
        </div>
      </div>

      {/* Сегменты — progress bars по 5 направлениям */}
      <div className="space-y-2.5">
        {SEGMENTS.map((seg) => {
          const value = scores?.[seg.key as keyof Scores] as number | undefined;
          return (
            <div key={seg.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 text-[12px] text-secondary">
                  <span className="text-ai-glow">{seg.icon}</span>
                  {seg.label}
                </span>
                <span className="text-[11px] text-muted font-num">
                  {loading ? '—' : value !== undefined ? `${value}%` : '—'}
                </span>
              </div>
              <ProgressBar value={value ?? 0} />
              <p className="text-[10px] text-faint mt-0.5">{seg.hint}</p>
            </div>
          );
        })}
      </div>

      {scores?.generatedAt && (
        <p className="text-[11px] text-muted mt-4 pt-3 border-t border-hairline">
          Последний отчёт обновлён {formatRelative(scores.generatedAt)} · собственная инфраструктура ZAPUSK AI
        </p>
      )}
    </Card>
  );
}

// MVP heuristic: считаем сколько artefact'ов уже собрано на проекте, и какие
// именно. Если на проекте есть live AI Discoverability отчёт (succeeded job
// с outputType=ai_visibility_report) — пробуем распарсить из его resultJson
// явные оценки; иначе оцениваем эвристически по покрытию pipeline'а.
function deriveScores(jobs: PackagingJob[]): Scores {
  const succeededByType = new Map<string, PackagingJob>();
  for (const j of jobs) {
    if (j.status === 'succeeded' && !succeededByType.has(j.outputType)) {
      succeededByType.set(j.outputType, j);
    }
  }

  const reportJob = succeededByType.get('ai_visibility_report') ?? null;
  if (reportJob) {
    const parsed = tryParseReportScores(reportJob.resultJson);
    if (parsed) {
      return {
        ...parsed,
        source: 'ai',
        generatedAt: reportJob.completedAt ?? reportJob.createdAt,
        reportJobId: reportJob.id,
      };
    }
  }

  // Эвристика: каждый succeeded artefact даёт прирост к соответствующему
  // measurement'у. landing + faq + summary поднимают readability/keywords/
  // citation; pitch/calculator структуру; ничего вообще — baseline ~30.
  const hasLanding = succeededByType.has('landing') || succeededByType.has('one_pager');
  const hasPitch = succeededByType.has('pitch_deck') || succeededByType.has('pitch_structure');
  const hasFaq = succeededByType.has('faq');
  const hasSummary = succeededByType.has('investor_summary');
  const hasFinancial = succeededByType.has('financial_model');

  const readability = base(40)
    + (hasLanding ? 22 : 0)
    + (hasSummary ? 12 : 0)
    + (hasPitch ? 8 : 0);
  const keywords = base(35)
    + (hasSummary ? 18 : 0)
    + (hasLanding ? 14 : 0)
    + (hasFaq ? 10 : 0)
    + (hasFinancial ? 6 : 0);
  const faq = base(30)
    + (hasFaq ? 40 : 0)
    + (hasLanding ? 14 : 0);
  const structure = base(35)
    + (hasLanding ? 18 : 0)
    + (hasPitch ? 18 : 0)
    + (hasSummary ? 10 : 0);
  const citation = base(40)
    + (hasFaq ? 20 : 0)
    + (hasSummary ? 14 : 0)
    + (hasLanding ? 12 : 0);

  const overall = Math.round((readability + keywords + faq + structure + citation) / 5);
  return {
    overall: clip(overall),
    readability: clip(readability),
    keywords: clip(keywords),
    faq: clip(faq),
    structure: clip(structure),
    citation: clip(citation),
    // Если хотя бы один материал есть — это heuristic; если ничего — baseline.
    source: succeededByType.size > 0 ? 'heuristic' : 'baseline',
    generatedAt: null,
    reportJobId: null,
  };
}

function tryParseReportScores(resultJson: string | null): Omit<Scores, 'source' | 'generatedAt' | 'reportJobId'> | null {
  if (!resultJson) return null;
  try {
    const parsed = JSON.parse(resultJson) as { text?: string };
    const text = parsed.text ?? '';
    // Парсим из markdown'а патерн «**AI Readability** — 78» или «Readability: 78».
    // Это best-effort: если report сгенерирован моделью с правильным шаблоном
    // (см. ai_visibility_report seed), оценки будут читаемы.
    const find = (label: string): number | null => {
      const re = new RegExp(`${label}[^\\d]{0,30}(\\d{1,3})`, 'i');
      const m = text.match(re);
      if (!m) return null;
      const n = Number(m[1]);
      return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
    };
    const readability = find('AI Readability');
    const keywords = find('Investor Keyword') ?? find('Keyword Coverage');
    const faq = find('FAQ Quality') ?? find('FAQ');
    const structure = find('Semantic Structure') ?? find('Structure');
    const citation = find('Citation Readiness') ?? find('Citation');
    const overall = find('Discoverability Score') ?? find('Готовность');
    if (overall === null && readability === null) return null;
    const segs = [readability, keywords, faq, structure, citation].filter((v): v is number => v !== null);
    const computedOverall = overall ?? (segs.length > 0 ? Math.round(segs.reduce((a, b) => a + b, 0) / segs.length) : 50);
    return {
      overall: clip(computedOverall),
      readability: clip(readability ?? computedOverall),
      keywords: clip(keywords ?? computedOverall),
      faq: clip(faq ?? computedOverall),
      structure: clip(structure ?? computedOverall),
      citation: clip(citation ?? computedOverall),
    };
  } catch {
    return null;
  }
}

function clip(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function base(n: number): number {
  return n;
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
    if (diffMin < 1) return 'только что';
    if (diffMin < 60) return `${diffMin} мин назад`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} ч назад`;
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
  } catch {
    return iso;
  }
}
