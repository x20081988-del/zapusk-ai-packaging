import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Star, CheckCircle2, AlertTriangle, MessageSquare, Sparkles } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { ReviewBlock } from '../components/ui/ReviewBlock';
import { api, type ArtefactReview, type Project } from '../lib/api';
import { PROMPT_KIND_LABELS, formatDate } from '../lib/format';
import { ALL_PROMPT_KINDS } from '../lib/promptKinds';
import { buildReviewIndex, computePackagingQualityScore, getReview } from '../lib/reviews';

export default function ProjectReview() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [reviews, setReviews] = useState<ArtefactReview[]>([]);

  async function load() {
    if (!id) return;
    const [{ project: p }, { reviews: rs }] = await Promise.all([
      api.get<{ project: Project }>(`/api/projects/${id}`),
      api.get<{ reviews: ArtefactReview[] }>(`/api/reviews/project/${id}`),
    ]);
    setProject(p);
    setReviews(rs);
  }
  useEffect(() => { load(); }, [id]);

  const idx = useMemo(() => buildReviewIndex(reviews), [reviews]);

  // Expected keys: brief + 10 prompts
  const expectedKeys = useMemo(
    () => ['brief:brief', ...ALL_PROMPT_KINDS.map((k) => `prompt:${k}`)],
    [],
  );
  const pqs = useMemo(() => computePackagingQualityScore(reviews, expectedKeys), [reviews, expectedKeys]);

  async function saveReview(payload: {
    artefactKind: 'prompt' | 'document' | 'brief';
    artefactKey: string;
    artefactId?: string | null;
    score: number;
    comment: string;
    approved: boolean;
    needsRework: boolean;
  }) {
    if (!id) return;
    await api.post('/api/reviews', { projectId: id, ...payload });
    await load();
  }

  if (!project) {
    return <AppLayout title="Проверка материалов"><Card><div className="text-sm text-muted text-center py-8">Загрузка…</div></Card></AppLayout>;
  }

  const briefReview = getReview(idx, 'brief', 'brief');

  return (
    <AppLayout
      title={`${project.name} · Проверка материалов`}
      action={
        <Link to={`/projects/${id}`}>
          <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={14} />}>К проекту</Button>
        </Link>
      }
    >
      {/* PQS HERO */}
      <Card padded className="mb-6 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-zapusk/10 rounded-full blur-3xl" />
        <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          <div className="lg:col-span-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold mb-2">Оценка качества материалов</div>
            <div className="flex items-end gap-4">
              <div className="text-6xl font-bold text-primary font-num tracking-tight">{pqs.score}</div>
              <div className="text-2xl text-muted font-num pb-2">/ 100</div>
            </div>
            <p className="text-sm text-secondary mt-3 max-w-md">
              Средняя оценка качества материалов. Неоценённые позиции считаются пробелами, поэтому чем больше заданий проверены и одобрены — тем выше итоговая оценка.
            </p>
          </div>
          <div className="space-y-2">
            <Stat label="Оценено" value={`${pqs.reviewedCount} / ${pqs.totalCount}`} />
            <Stat label="Годится в работу" value={String(reviews.filter((r) => r.approved).length)} tone="success" />
            <Stat label="Нужно доработать" value={String(reviews.filter((r) => r.needsRework).length)} tone="warning" />
          </div>
        </div>
      </Card>

      {/* BRIEF REVIEW */}
      <Card padded accent="ai" className="mb-6">
        <CardHeader
          title="Бриф и бизнес на салфетке"
          subtitle={project.brief ? `v${project.brief.version} · обновлён ${formatDate(project.brief.updatedAt)}` : 'не сгенерирован'}
          action={briefReview?.score ? <ScoreChip score={briefReview.score} /> : null}
        />
        {project.brief ? (
          <ReviewBlock
            current={briefReview}
            onSave={(payload) => saveReview({
              artefactKind: 'brief',
              artefactKey: 'brief',
              artefactId: project.brief?.id,
              ...payload,
            })}
          />
        ) : (
          <EmptyState title="Бриф ещё не сгенерирован" />
        )}
      </Card>

      {/* ARTEFACTS TABLE */}
      <Card padded>
        <CardHeader title="Материалы" subtitle="Оценка каждого материала командой Zapusk" />
        <div className="space-y-3">
          {ALL_PROMPT_KINDS.map((kind) => {
            const latest = project.generatedPrompts?.find((p) => p.kind === kind);
            const review = getReview(idx, 'prompt', kind);
            const meta = PROMPT_KIND_LABELS[kind];
            return (
              <div key={kind} className="rounded-md border border-hairline bg-canvas/40 p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-primary">{meta.title}</h3>
                      {latest ? <StatusBadge tone={meta.accent} dot>v{latest.version}</StatusBadge> : <StatusBadge tone="neutral">не сгенерирован</StatusBadge>}
                      {review?.approved && <StatusBadge tone="success" dot>Годится</StatusBadge>}
                      {review?.needsRework && <StatusBadge tone="warning" dot>Доработать</StatusBadge>}
                    </div>
                    <p className="text-xs text-muted mt-0.5">{meta.subtitle}</p>
                    {review?.comment && (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-secondary">
                        <MessageSquare size={11} className="text-muted mt-0.5 shrink-0" />
                        <span className="leading-snug">{review.comment}</span>
                      </div>
                    )}
                  </div>
                  {review?.score ? <ScoreChip score={review.score} /> : <span className="text-[11px] text-faint uppercase tracking-wide">без оценки</span>}
                </div>
                {latest && (
                  <ReviewBlock
                    current={review}
                    onSave={(payload) => saveReview({
                      artefactKind: 'prompt',
                      artefactKey: kind,
                      artefactId: latest.id,
                      ...payload,
                    })}
                    compact
                  />
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </AppLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-md bg-canvas/50 border border-hairline">
      <span className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className={`text-sm font-semibold font-num ${tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-primary'}`}>{value}</span>
    </div>
  );
}

function ScoreChip({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 h-7 rounded-full bg-zapusk/12 border border-zapusk/30 text-zapusk-400 text-[12px] font-semibold font-num">
      <Star size={11} fill="currentColor" /> {score}/5
    </span>
  );
}
