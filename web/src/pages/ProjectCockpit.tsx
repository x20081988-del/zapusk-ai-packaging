import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Sparkles, FileText, Download, ArrowLeft, ExternalLink, Rocket, ChevronRight, Wand2, Package,
  MessageCircle,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { StepCard } from '../components/ui/StepCard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ProjectMaterialCard } from '../components/ui/ProjectMaterialCard';
import { TransformationShowcase } from '../components/ui/TransformationShowcase';
import { EmptyState } from '../components/ui/EmptyState';
import { api, downloadBlob, type ArtefactReview, type InvestmentTrack, type PackagingJob, type Project } from '../lib/api';
import {
  formatMoney, formatPercent, formatDate, parseObj,
  STAGE_LABELS, INVESTOR_TYPE_LABELS,
} from '../lib/format';
import { computeProgress } from '../lib/progress';
import { buildReviewIndex, getReview } from '../lib/reviews';
import { getDemoMaterials, getDemoTransformationCase } from '../lib/demoMaterials';
import { MissingDataPanel } from '../components/ui/MissingDataPanel';
import { PersonalManagerMiniCard } from '../components/ui/PersonalManagerCard';
import { RecentMeetings } from '../components/ui/RecentMeetings';
// Sprint 21: статичный Project Journey убран в пользу нового
// «Пути привлечения инвестиций» (см. components/project/InvestmentJourney).
import { getBriefStatus, briefStatusTone, briefCtaHrefForProject } from '../lib/briefStatus';
import { AIPackagingHistory } from '../components/ui/AIPackagingHistory';
import { AIDiscoverabilityScore } from '../components/ui/AIDiscoverabilityScore';
import { InvestmentJourney } from '../components/project/InvestmentJourney';
import { TrackPicker } from '../components/project/TrackPicker';
import { ActivityHistory } from '../components/project/ActivityHistory';
import { MaterialHistoryDrawer, type MaterialKind } from '../components/ui/MaterialHistoryDrawer';
import { listMeetings } from '../lib/salesSessions';
import { listOutcomes, OUTCOME_LABELS, type AssistantOutcome } from '../lib/assistantOutcomes';
import { History } from 'lucide-react';
import { ProjectMaterialsWorkspace } from '../components/project/ProjectMaterialsWorkspace';

export default function ProjectCockpit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [generatingKind, setGeneratingKind] = useState<string | null>(null);
  const [generatingFull, setGeneratingFull] = useState(false);
  const [reviews, setReviews] = useState<ArtefactReview[]>([]);
  // Sprint 21: путь привлечения инвестиций. jobs нужны для расчёта статусов
  // пунктов; trackPickerOpen открывается автоматически если трек не выбран.
  // Sprint 28: meetingsCount + leadsLaunched питают честный stage status.
  const [jobs, setJobs] = useState<PackagingJob[]>([]);
  const [meetingsCount, setMeetingsCount] = useState(0);
  const [leadsLaunched, setLeadsLaunched] = useState(false);
  const [trackPickerOpen, setTrackPickerOpen] = useState(false);
  const [savingTrack, setSavingTrack] = useState(false);
  // Sprint 33 — какое material history drawer открыт. null = закрыт.
  const [historyDrawer, setHistoryDrawer] = useState<{ kind: MaterialKind; promptKind?: string; title: string } | null>(null);

  async function load() {
    if (!id) return;
    // Sprint 62.P10.HOTFIX — раньше /api/projects/:id и /api/reviews/project/:id
    // шли в Promise.all БЕЗ .catch(). Для demo-viewer'ов reviews отдаёт 403
    // (investor) или 404 (founder не владелец демо-проекта), весь Promise.all
    // реджектился, setProject не вызывался → бесконечная «Загрузка…».
    // Теперь: only /api/projects/:id критичен (его падение → loadError-экран);
    // все вторичные ресурсы деградируют до пустых значений и не блокируют рендер.
    try {
      const p = await api.get<{ project: Project }>(`/api/projects/${id}`);
      const [rs, j, meetings, aiLeads] = await Promise.all([
        api.get<{ reviews: ArtefactReview[] }>(`/api/reviews/project/${id}`).catch(() => ({ reviews: [] as ArtefactReview[] })),
        api.get<{ jobs: PackagingJob[] }>(`/api/packaging-jobs/project/${id}`).catch(() => ({ jobs: [] as PackagingJob[] })),
        listMeetings({ projectId: id }).catch(() => ({ sessions: [] })),
        api.get<{ mode?: string }>(`/api/ai-leads?projectId=${encodeURIComponent(id)}`).catch(() => ({ mode: undefined })),
      ]);
      setProject(p.project);
      setReviews(rs.reviews);
      setJobs(j.jobs);
      setMeetingsCount(meetings.sessions?.length ?? 0);
      setLeadsLaunched(aiLeads.mode === 'live');
      setLoadError(null);
      // Sprint 21: если фаундер ещё не выбрал формат привлечения — открываем
      // TrackPicker автоматически. Один раз, только при первом загрузке проекта.
      if (!p.project.investmentTrack && !trackPickerOpen) {
        setTrackPickerOpen(true);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить проект');
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function saveTrack(track: InvestmentTrack) {
    if (!id) return;
    setSavingTrack(true);
    try {
      const r = await api.patch<{ project: Project }>(`/api/projects/${id}`, { investmentTrack: track });
      setProject(r.project);
      setTrackPickerOpen(false);
    } finally {
      setSavingTrack(false);
    }
  }

  if (!project) {
    return (
      <AppLayout title="Проект">
        <Card>
          {loadError ? (
            <div className="text-sm text-center py-8 space-y-3">
              <div className="text-danger">Не удалось открыть проект</div>
              <div className="text-muted">{loadError}</div>
              <Button variant="secondary" onClick={() => { setLoadError(null); load(); }}>Повторить</Button>
            </div>
          ) : (
            <div className="text-sm text-muted text-center py-8">Загрузка…</div>
          )}
        </Card>
      </AppLayout>
    );
  }

  const { steps, percent } = computeProgress(project);
  const napkin = parseObj<Record<string, unknown>>(project.brief?.napkin, {});

  async function generateBrief() {
    if (!id) return;
    setGeneratingBrief(true);
    try {
      await api.post(`/api/brief/${id}/generate`);
      await load();
    } finally {
      setGeneratingBrief(false);
    }
  }

  async function generatePrompt(kind: string) {
    if (!id) return;
    setGeneratingKind(kind);
    try {
      await api.post(`/api/prompts/${id}/generate/${kind}`);
      await load();
    } finally {
      setGeneratingKind(null);
    }
  }

  async function generateFullPackaging() {
    if (!id) return;
    setGeneratingFull(true);
    try {
      await api.post(`/api/prompts/${id}/generate-full-packaging`);
      await load();
    } finally {
      setGeneratingFull(false);
    }
  }

  async function regenerateWithFeedback(kind: string, feedback: string) {
    if (!id) return;
    setGeneratingKind(kind);
    try {
      await api.post(`/api/prompts/${id}/generate/${kind}`, { feedback });
      await load();
    } finally {
      setGeneratingKind(null);
    }
  }

  async function saveReview(kind: string, latestId: string | undefined, payload: { score: number; comment: string; approved: boolean; needsRework: boolean }) {
    if (!id) return;
    await api.post('/api/reviews', {
      projectId: id,
      artefactKind: 'prompt',
      artefactKey: kind,
      artefactId: latestId,
      ...payload,
    });
    await load();
  }

  const reviewIndex = buildReviewIndex(reviews);
  const transformation = getDemoTransformationCase(project);
  const materials = getDemoMaterials(project);
  // Sprint 14: brief status — единый source-of-truth для бейджей и CTA.
  const briefStatus = getBriefStatus(project);

  function latestPromptFor(kind: string) {
    return project!.generatedPrompts?.find((p) => p.kind === kind);
  }

  return (
    <AppLayout
      title={project.name}
      action={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={14} />} onClick={() => navigate('/dashboard')}>
            Рабочий стол
          </Button>
          <Link to={`/projects/${id}/review`}>
            <Button variant="secondary" size="sm">Проверка AI-материалов</Button>
          </Link>
          <Link to="/personal-manager">
            <Button variant="secondary" size="sm" iconLeft={<MessageCircle size={14} />}>Менеджер</Button>
          </Link>
          {/* Sprint 37 P0.2 — auth-download. <a href=API_URL> в новой вкладке
              не отправлял Bearer-токен; с invite-only архитектурой это давало
              401. downloadBlob делает fetch с Authorization, забирает blob и
              триггерит <a download> программно. */}
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Package size={14} />}
            onClick={() => downloadBlob(`/api/projects/${id}/export/zip`, `${project?.name ?? 'project'}.zip`)}
          >
            Скачать комплект
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<Download size={14} />}
            onClick={() => downloadBlob(`/api/projects/${id}/export`, `${project?.name ?? 'project'}.json`)}
          >
            Данные проекта
          </Button>
        </div>
      }
    >
      {/* Sprint 61.HOTFIX (P0.2) — prominent next-step block.
          Production manual test reported: «требуется уточнение» exists, but
          founder can't see what's actually blocking next stages. This block
          surfaces the SINGLE next action with explicit count + CTA at the
          top of the page so it's visible without scrolling. */}
      {(briefStatus.state === 'in_progress' || briefStatus.state === 'needs_review') && (
        <Card padded accent="ai" className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-md bg-ai/15 border border-ai/30 flex items-center justify-center shrink-0">
                <Sparkles size={14} className="text-ai-glow" />
              </div>
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-[0.12em] text-ai-glow font-semibold mb-1">
                  Следующий шаг
                </div>
                <p className="text-sm text-primary leading-snug">
                  Чтобы продолжить упаковку, закройте {briefStatus.openQuestions}{' '}
                  {pluralRu(briefStatus.openQuestions, 'открытый вопрос', 'открытых вопроса', 'открытых вопросов')} брифа.
                  Ответьте на них или отметьте «Нет данных».
                </p>
                <p className="text-xs text-muted mt-1 leading-snug">
                  Без ответов AI не может собрать финансовую модель и презентацию для инвестора.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link to={`/projects/${id}/interview`}>
                <Button variant="ai" size="md" iconLeft={<Sparkles size={14} />}>
                  Закрыть открытые вопросы брифа
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      )}
      {briefStatus.state === 'not_started' && (
        <Card padded accent="ai" className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-md bg-ai/15 border border-ai/30 flex items-center justify-center shrink-0">
                <Sparkles size={14} className="text-ai-glow" />
              </div>
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-[0.12em] text-ai-glow font-semibold mb-1">
                  Следующий шаг
                </div>
                <p className="text-sm text-primary leading-snug">
                  Нужно сгенерировать бриф — это запускает всю упаковку и AI-материалы.
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* HERO */}
      <Card padded className="mb-6 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-zapusk/10 rounded-full blur-3xl" />
        <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <StatusBadge tone={percent > 0 ? 'zapusk' : 'neutral'} dot>
                {percent > 0 ? 'Материалы' : 'Черновик'}
              </StatusBadge>
              <StatusBadge tone={briefStatusTone(briefStatus.state)} dot>
                {briefStatus.label}
              </StatusBadge>
              <span className="text-[11px] uppercase tracking-[0.1em] text-muted">{project.industry ?? 'Отрасль не указана'}</span>
            </div>
            <h1 className="text-3xl font-bold text-primary tracking-tight">{project.name}</h1>
            {project.website && (
              <a href={project.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-secondary hover:text-zapusk-400 mt-1.5">
                {project.website} <ExternalLink size={11} />
              </a>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <Metric label="Привлекает" value={formatMoney(project.raiseAmount, project.currency)} accent="zapusk" />
              <Metric label="Доля" value={formatPercent(project.equityOffered)} />
              <Metric label="Min чек" value={formatMoney(project.minCheck, project.currency)} />
              <Metric label="Стадия" value={STAGE_LABELS[project.stage ?? ''] ?? '—'} />
              <Metric label="Тип инвестора" value={INVESTOR_TYPE_LABELS[project.investorType ?? ''] ?? '—'} />
              <Metric label="Срок" value={formatDate(project.raiseDeadline)} />
              <Metric label="ИНН" value={project.inn ?? '—'} />
              <Metric label="Форма" value={project.legalStatus ?? '—'} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-line bg-canvas/50 p-5">
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold mb-1">Готовность материалов</div>
              <div className="text-4xl font-bold text-primary font-num">{percent}%</div>
              <div className="mt-3 h-1.5 bg-hairline rounded-full overflow-hidden">
                <div className="h-full bg-grad-zapusk transition-all duration-700" style={{ width: `${percent}%` }} />
              </div>
            </div>

            <Button
              variant="primary"
              size="md"
              className="w-full"
              iconLeft={<Wand2 size={14} />}
              loading={generatingFull}
              onClick={generateFullPackaging}
            >
              Сформировать полный комплект материалов
            </Button>
            <Link to={briefCtaHrefForProject(id!, briefStatus.state)} className="block">
              <Button
                variant="ai"
                size="md"
                className="w-full"
                iconLeft={<Sparkles size={14} />}
              >
                {briefStatus.cta}
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              iconLeft={<Sparkles size={12} />}
              loading={generatingBrief}
              onClick={generateBrief}
            >
              {project.brief ? `Пересобрать (v${project.brief.version + 1})` : 'Сгенерировать первый бриф'}
            </Button>
          </div>
        </div>
      </Card>

      {transformation && <TransformationShowcase item={transformation} />}

      {/* Sprint 28 — главный блок: «Путь привлечения инвестиций» сразу после
          HERO. Бриф (этап 1) виден сверху, остальные этапы — заблокированы,
          пока бриф не готов. Никаких fake completed states. */}
      <div className="mb-6">
        <InvestmentJourney
          project={project}
          jobs={jobs}
          options={{ meetingsCount, leadsLaunched, reviews }}
          onChooseTrack={() => setTrackPickerOpen(true)}
        />
      </div>

      {/* PROGRESS STEPS — старый сводный прогресс материалов. */}
      <Card padded className="mb-6">
        <CardHeader
          title="Прогресс материалов"
          subtitle="От исходных данных до готового комплекта для инвестора"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {steps.map((s, i) => (
            <StepCard
              key={s.key}
              index={i + 1}
              label={s.label}
              done={s.done}
              current={!s.done && steps.slice(0, i).every((p) => p.done)}
            />
          ))}
        </div>
      </Card>

      <ProjectMaterialsWorkspace projectId={id!} onChanged={load} />

      {/* Sprint 14: «Бизнес на салфетке» — фаундер видит, что собрала система. */}
      <div className="mb-6">
        <Card padded accent={project.brief ? 'ai' : null}>
          <CardHeader
            title="Бизнес на салфетке"
            subtitle={project.brief ? `Разбор v${project.brief.version} · ${briefStatus.longLabel}` : 'Будет собран после генерации брифа'}
            action={project.brief && (
              <div className="flex items-center gap-1.5">
                {/* Sprint 33 — Brief history drawer */}
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={<History size={12} />}
                  onClick={() => setHistoryDrawer({ kind: 'brief', title: 'История · Бриф проекта' })}
                >
                  История версий
                </Button>
                <Link to={briefCtaHrefForProject(id!, briefStatus.state)}>
                  <Button variant="ghost" size="sm" iconRight={<ChevronRight size={14} />}>{briefStatus.cta}</Button>
                </Link>
              </div>
            )}
          />
          {project.brief ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <NapkinField label="Что за бизнес" value={napkin.whatIs as string} />
              <NapkinField label="Как зарабатывает" value={napkin.howMakesMoney as string} />
              <NapkinField label="Сколько нужно" value={napkin.howMuchNeeded as string} />
              <NapkinField label="На что деньги" value={napkin.whatFor as string} />
              <NapkinField label="Доход инвестора" value={napkin.investorReturn as string} />
              <NapkinField label="Почему сейчас" value={napkin.whyNow as string} />
            </div>
          ) : (
            <EmptyState
              icon={<Sparkles size={20} />}
              title="Бриф ещё не сгенерирован"
              description="Загрузите хотя бы один материал и нажмите «Сформировать бриф». Если данных мало, система соберёт аккуратный черновик."
              action={<Button variant="ai" iconLeft={<Sparkles size={14} />} loading={generatingBrief} onClick={generateBrief}>Запустить</Button>}
            />
          )}
        </Card>
      </div>

      {/* MISSING DATA — categorized */}
      {project.brief && (
        <div className="mb-6">
          <MissingDataPanel
            rawJson={project.brief.missingByCategory}
            interviewHref={`/projects/${id}/interview`}
          />
        </div>
      )}

      {/* Sprint 14: PersonalManagerMiniCard остаётся, но Project Journey
          (статичный DEFAULT_PROJECT_JOURNEY) убран — заменён главным новым
          блоком «Путь привлечения инвестиций» из Sprint 21. */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 mb-6">
        <div /> {/* spacer для grid */}
        <PersonalManagerMiniCard />
      </div>

      {/* Память встреч: последние 3 встречи с инвесторами по этому проекту */}
      <div className="mb-6">
        <RecentMeetings projectId={id} limit={3} />
      </div>

      {/* Sprint 28 — InvestmentJourney перенесён выше под HERO. Здесь —
          история и technical-блоки команды ZAPUSK AI (упаковка, AEO). */}

      {/* История проекта — лента событий из реальных данных (файлы / бриф / job'ы). */}
      <div className="mb-6">
        <ActivityHistory project={project} jobs={jobs} />
      </div>

      {/* Sprint 20: AI Discoverability Score — собственная метрика ZAPUSK AI
          поверх AEO-инфраструктуры. Показывает, насколько материалы проекта
          видны в AI search engines / answer engines. Sprint 21: оставляем
          как technical-детали под главным «Путём привлечения инвестиций». */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 mb-6">
        <AIPackagingHistory
          projectId={id}
          onRegenerate={(templateKey) => generatePrompt(templateKey)}
          onOpenHistory={(templateKey, label) =>
            setHistoryDrawer({ kind: 'prompt', promptKind: templateKey, title: `История · ${label}` })
          }
        />
        <AIDiscoverabilityScore
          projectId={id}
          onGenerate={() => generatePrompt('ai_visibility_report')}
        />
      </div>

      {/* READY MATERIALS */}
      <Card padded className="mb-6">
        <CardHeader
          title="AI-сгенерированные материалы"
          subtitle="Здесь хранятся готовые инвестиционные материалы проекта: презентации, финансовые модели, посадочные страницы и краткие материалы для инвесторов. Вы можете открыть материал, скачать его, утвердить или отправить на доработку. Задание для создания материала доступно отдельно."
          action={
            <Link to={`/projects/${id}/packaging`}>
              <Button variant="ghost" size="sm" iconRight={<ChevronRight size={14} />}>Все материалы</Button>
            </Link>
          }
        />
        {materials.length === 0 ? (
          <EmptyState
            icon={<FileText size={20} />}
            title="Готовые материалы ещё не подключены"
            description="После упаковки здесь появятся презентации, финансовые модели, посадочные страницы и краткие материалы для инвесторов."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {materials.slice(0, 6).map((material) => {
              const kind = material.promptKind;
              const latest = kind ? latestPromptFor(kind) : undefined;
              const review = kind ? getReview(reviewIndex, 'prompt', kind) : undefined;
              return (
                <ProjectMaterialCard
                  key={material.id}
                  material={material}
                  promptBody={latest?.body}
                  promptVersion={latest?.version}
                  review={review}
                  regenerating={kind ? generatingKind === kind : false}
                  onGeneratePrompt={kind ? () => generatePrompt(kind) : undefined}
                  onRegenerateWithFeedback={kind ? (feedback) => regenerateWithFeedback(kind, feedback) : undefined}
                  onSaveReview={kind ? (p) => saveReview(kind, latest?.id, p) : undefined}
                />
              );
            })}
          </div>
        )}
      </Card>

      {/* NEXT ACTIONS */}
      <Card padded className="bg-gradient-to-br from-surface to-canvas border-zapusk/20">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-grad-zapusk shadow-glow flex items-center justify-center flex-shrink-0">
            <Rocket size={18} className="text-canvas" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-primary">Следующие шаги</h3>
            <p className="text-sm text-secondary mt-1">
              {percent < 30 && 'Загрузите презентацию или описание проекта — система соберёт первый бриф.'}
              {percent >= 30 && percent < 60 && 'Откройте интервью по проекту и ответьте на 5-7 уточняющих вопросов.'}
              {percent >= 60 && percent < 100 && 'Сформируйте оставшиеся задания и скачайте одностраничник.'}
              {percent === 100 && 'Материалы готовы — скачайте комплект и передайте команде.'}
            </p>
          </div>
          <Link to={`/projects/${id}/packaging`}>
            <Button iconRight={<ChevronRight size={14} />}>К материалам проекта</Button>
          </Link>
        </div>
      </Card>

      <TrackPicker
        open={trackPickerOpen}
        current={project.investmentTrack ?? null}
        saving={savingTrack}
        onSave={saveTrack}
        onClose={() => setTrackPickerOpen(false)}
      />
      {/* Sprint 33 — material history drawer (brief / prompt / document) */}
      {id && historyDrawer && (
        <MaterialHistoryDrawer
          open
          onClose={() => setHistoryDrawer(null)}
          kind={historyDrawer.kind}
          projectId={id}
          promptKind={historyDrawer.promptKind}
          title={historyDrawer.title}
          onRestored={() => load()}
        />
      )}

      {/* Sprint 43 P0.8 — outcomes list. Простая таблица «что произошло после
          AI-подсказок» по этому проекту. Аналитика в Sprint 44+. */}
      {id && <ProjectOutcomesList projectId={id} />}
    </AppLayout>
  );
}

// Sprint 61.HOTFIX (P0.2) — Russian plural rule (1 / 2-4 / 5+).
function pluralRu(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: 'zapusk' }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1">{label}</div>
      <div className={`text-[15px] font-semibold font-num truncate ${accent === 'zapusk' ? 'text-zapusk-400' : 'text-primary'}`}>{value}</div>
    </div>
  );
}

function NapkinField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1">{label}</div>
      <div className="text-sm text-primary leading-snug">{value || <span className="text-faint">—</span>}</div>
    </div>
  );
}

// Sprint 43 P0.8 — список результатов AI-подсказок по этому проекту.
// Без аналитики — это Sprint 44.
function ProjectOutcomesList({ projectId }: { projectId: string }) {
  const [outcomes, setOutcomes] = useState<AssistantOutcome[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listOutcomes({ projectId })
      .then((r) => { if (alive) setOutcomes(r.outcomes); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'load_failed'); });
    return () => { alive = false; };
  }, [projectId]);

  if (error) return null; // молча — старый проект может не иметь outcomes
  if (outcomes && outcomes.length === 0) return null; // не показываем пустую секцию

  return (
    <Card padded className="mt-6">
      <CardHeader
        title="Результаты AI-подсказок"
        subtitle="Что произошло после AI-помощи в этом проекте. Фиксируется командой вручную."
        action={outcomes ? <StatusBadge tone="ai" dot>{outcomes.length}</StatusBadge> : null}
      />
      {!outcomes && <div className="text-sm text-muted py-4 text-center">Загрузка…</div>}
      {outcomes && (
        <ul className="space-y-2">
          {outcomes.map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-3 py-2 rounded-md border border-hairline bg-canvas/40">
              <StatusBadge tone={outcomeTone(o.outcomeType)} dot>{OUTCOME_LABELS[o.outcomeType] ?? o.outcomeType}</StatusBadge>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-primary truncate">
                  {o.investorName ?? '—'}
                  {o.note && <span className="text-secondary text-xs ml-2">· {o.note.slice(0, 80)}{o.note.length > 80 ? '…' : ''}</span>}
                </div>
              </div>
              {typeof o.probabilityAfter === 'number' && (
                <span className="text-xs text-muted">→ {o.probabilityAfter}%</span>
              )}
              {typeof o.valueRub === 'number' && (
                <span className="text-xs text-primary font-num">{formatMoney(o.valueRub, 'RUB')}</span>
              )}
              <span className="text-[10px] text-muted">{formatDate(o.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function outcomeTone(type: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  if (type === 'investment_received' || type === 'next_meeting_booked' || type === 'investor_interested') return 'success';
  if (type === 'follow_up_sent' || type === 'investor_requested_docs') return 'info';
  if (type === 'lost') return 'danger';
  if (type === 'ghosted') return 'warning';
  return 'neutral';
}
