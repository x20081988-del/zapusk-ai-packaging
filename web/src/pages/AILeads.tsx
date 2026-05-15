import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  Headphones,
  MessageSquare,
  Mic,
  Pause,
  PhoneCall,
  Play,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Select, Textarea } from '../components/ui/Input';
import { StatusBadge } from '../components/ui/StatusBadge';
import { VoiceInputButton } from '../components/ui/VoiceInputButton';
import { RecentMeetings } from '../components/ui/RecentMeetings';
import { api, type Project } from '../lib/api';
import { getAuth } from '../lib/auth';
import { isLegacyDemoProject } from '../lib/demoMaterials';
import { getBriefStatus, briefStatusTone } from '../lib/briefStatus';

type LeadStatus = 'HOT' | 'NEW' | 'WAITING' | 'CONTACTED';
type BriefingState = 'draft' | 'in_progress' | 'ready';
type Channel = 'AI_CALL' | 'TELEGRAM' | 'WHATSAPP' | 'AVITO' | 'FOLLOW_UP';

interface AILead {
  id: string;
  status: LeadStatus;
  receivedAt: string;
  title: string;
  investor: {
    name: string;
    phone: string;
    checkRange: string;
    decisionWindow: string;
    profile: string;
  };
  tags?: string[];
  aiSummary: string;
  whatHappened: {
    summary: string;
    interest: string;
    objections: string[];
    sent: string[];
    nextStep: string;
  };
  audio: { label: string; durationSec: number; url?: string };
  communications: Array<{
    id: string;
    channel: Channel;
    at: string;
    title: string;
    body: string;
    outcome: string;
  }>;
}

// Sprint 27 — backend разделяет три состояния. UI:
// • empty — active кабинет, лиды не запущены. Скрываем «AI работает сейчас»,
//   KPI grid и LiveFeed. Показываем onboarding + briefing analyzer.
// • live  — реальные лиды в БД (когда сделаем persistence)
// • demo  — только demo workspace (Sprint 35 P0.2: ?demo=1 больше не доверяем)
type AILeadsMode = 'empty' | 'live' | 'demo';

interface AILeadsDashboard {
  mode: AILeadsMode;
  projectId: string | null;
  projectName: string;
  onboarding: {
    title: string;
    description: string;
    cta: string;
    launchEnabled: boolean;
    launchLabel: string;
  };
  readiness: {
    state: BriefingState;
    percent: number;
    criticalReady: boolean;
    extracted: Array<{ label: string; value: string; confidence: number }>;
    missing: Array<{ category: string; question: string; critical: boolean }>;
    breakdown: Array<{ label: string; percent: number; state: 'complete' | 'partial' | 'missing' }>;
  };
  strategy: {
    positioning: string;
    keyTriggers: string[];
    icpInvestors: string[];
  };
  kpis: {
    totalLeads: number;
    activeToday: number;
    avgCheck: string;
    callsToday: number;
    messagesSent: number;
  };
  replacementPolicy: {
    title: string;
    minimumTargetLeads: number;
    description: string;
    replacementTriggers: string[];
    contactAttempts: number;
    disclaimers: string[];
  };
  leads: AILead[];
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  HOT: 'HOT',
  NEW: 'NEW',
  WAITING: 'WAITING',
  CONTACTED: 'CONTACTED',
};

const STATUS_TONES: Record<LeadStatus, 'danger' | 'ai' | 'warning' | 'success'> = {
  HOT: 'danger',
  NEW: 'ai',
  WAITING: 'warning',
  CONTACTED: 'success',
};

const CHANNEL_LABELS: Record<Channel, string> = {
  AI_CALL: 'AI call',
  TELEGRAM: 'Telegram',
  WHATSAPP: 'WhatsApp',
  AVITO: 'Avito',
  FOLLOW_UP: 'Follow-up',
};

export default function AILeads() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [dashboard, setDashboard] = useState<AILeadsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [launched, setLaunched] = useState(false);
  const [briefReply, setBriefReply] = useState('');
  const role = getAuth()?.role ?? 'client';

  useEffect(() => {
    api.get<{ projects: Project[] }>('/api/projects').then((r) => {
      const visible = r.projects.filter((p) => role !== 'FOUNDER' || !isLegacyDemoProject(p));
      setProjects(visible);
      if (!selectedProjectId && visible[0]?.id) setSelectedProjectId(visible[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    setLoading(true);
    const query = selectedProjectId ? `?projectId=${encodeURIComponent(selectedProjectId)}` : '';
    api.get<AILeadsDashboard>(`/api/ai-leads${query}`)
      .then((r) => {
        setDashboard(r);
        setLaunched(r.readiness.criticalReady);
      })
      .finally(() => setLoading(false));
  }, [selectedProjectId]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  // Sprint 14: state-aware CTA для брифа. Если выбран проект — ведём в его
  // бриф. Если проектов нет — в New Project. Если есть, но дашборд ещё без
  // projectId — мягко в New Project (это редкий fallback на серверной стороне).
  const briefHref = dashboard?.projectId
    ? `/projects/${dashboard.projectId}/brief`
    : projects[0]?.id
      ? `/projects/${projects[0].id}/brief`
      : '/projects/new';
  const interviewHref = dashboard?.projectId ? `/projects/${dashboard.projectId}/interview` : '/projects/new';
  // Sprint 14: единый source-of-truth — статус брифа выбранного проекта.
  const briefStatus = selectedProject ? getBriefStatus(selectedProject) : null;
  const briefCtaLabel = briefStatus?.cta ?? 'Заполнить бриф';

  return (
    <AppLayout title="AI-лиды инвесторов">
      <div className="space-y-6">
        <LeadProductHero
          dashboard={dashboard}
          launched={launched}
          onLaunch={() => setLaunched(true)}
          briefHref={briefHref}
          briefCtaLabel={briefCtaLabel}
          briefStatus={briefStatus}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
          <div className="space-y-6 min-w-0">
            <Card padded>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-ai-glow font-semibold mb-1">
                    Операционная система привлечения инвестиций
                  </div>
                  <h2 className="text-xl font-semibold text-primary tracking-tight">Поток AI-лидов</h2>
                  <p className="text-sm text-secondary mt-1 max-w-2xl">
                    AI изучает проект, собирает бриф, запускает сценарии коммуникации и передаёт команде только заинтересованных инвесторов.
                  </p>
                </div>
                <div className="w-full md:w-72">
                  <Select
                    label="Проект"
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    options={[
                      ...(projects.length ? [] : [{ value: '', label: 'Проект не выбран' }]),
                      ...projects.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                  />
                </div>
              </div>
            </Card>

            {loading || !dashboard ? (
              <Card>
                <div className="py-10 text-center text-sm text-muted">AI собирает статус лидогенерации…</div>
              </Card>
            ) : (
              <>
                <OnboardingCard
                  dashboard={dashboard}
                  selectedProject={selectedProject}
                  briefHref={briefHref}
                  briefCtaLabel={briefCtaLabel}
                  launched={launched}
                />

                <BriefingAnalyzer
                  dashboard={dashboard}
                  reply={briefReply}
                  onReply={setBriefReply}
                  interviewHref={interviewHref}
                />

                {dashboard.readiness.criticalReady && (
                  <StrategyCard positioning={dashboard.strategy.positioning} triggers={dashboard.strategy.keyTriggers} investors={dashboard.strategy.icpInvestors} />
                )}

                {/* Sprint 27 — KPI grid и LiveFeed только в demo/live режиме.
                    Для empty (active cabinet, лиды не запущены) — пустой
                    плейсхолдер «AI-лиды появятся после запуска проекта». */}
                {dashboard.mode === 'empty' ? (
                  <EmptyLeadsState dashboard={dashboard} briefHref={briefHref} briefCtaLabel={briefCtaLabel} />
                ) : (
                  <>
                    {/* Sprint 35 P1 — явная пометка, что это не реальные лиды
                        клиента, телефоны замаскированы, записи синтетические. */}
                    {dashboard.mode === 'demo' && (
                      <div className="rounded-md border border-ai/30 bg-ai/8 px-3 py-2 text-xs text-secondary">
                        Это демонстрационные данные, не реальные лиды клиента. Телефоны и записи разговоров — синтетические.
                      </div>
                    )}
                    <KpiGrid dashboard={dashboard} />
                    <LiveFeed leads={dashboard.leads} locked={!dashboard.readiness.criticalReady} />
                  </>
                )}
              </>
            )}
          </div>

          <aside className="space-y-4">
            {dashboard && <GuaranteeCard policy={dashboard.replacementPolicy} />}
            {/* Sprint 27 — «AI работает сейчас» — это demo-витрина. В active
                кабинете её нет, она живёт в /demo/ai-leads. */}
            {dashboard?.mode === 'demo' && (
              <Card padded accent="ai">
                <CardHeader title="AI работает сейчас" subtitle="Демо-режим: поток лидов в реальном времени" />
                <div className="space-y-3">
                  <LiveStatus icon={<PhoneCall size={14} />} label="AI-прозвон базы" value="43 звонка сегодня" active />
                  <LiveStatus icon={<MessageSquare size={14} />} label="Мессенджеры" value="128 сообщений" active />
                  <LiveStatus icon={<UserCheck size={14} />} label="Квалификация" value="7 активных лидов" active />
                  <LiveStatus icon={<Radio size={14} />} label="Новый лид" value="ожидается" />
                </div>
              </Card>
            )}
            {dashboard?.mode === 'empty' && (
              <Card padded>
                <CardHeader title="Что произойдёт после запуска" subtitle="AI-каналы откроются после согласования упаковки" />
                <div className="space-y-3 text-xs text-secondary">
                  <PendingLine icon={<PhoneCall size={13} />} label="AI-прозвон базы инвесторов" />
                  <PendingLine icon={<MessageSquare size={13} />} label="Мессенджеры и продолжение общения" />
                  <PendingLine icon={<UserCheck size={13} />} label="Квалификация и передача горячих лидов" />
                  <PendingLine icon={<Radio size={13} />} label="Записи разговоров и контекст" />
                </div>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}

function LeadProductHero({
  dashboard,
  launched,
  onLaunch,
  briefHref,
  briefCtaLabel,
  briefStatus,
}: {
  dashboard: AILeadsDashboard | null;
  launched: boolean;
  onLaunch: () => void;
  briefHref: string;
  briefCtaLabel: string;
  briefStatus: ReturnType<typeof getBriefStatus> | null;
}) {
  const launchEnabled = Boolean(dashboard?.onboarding.launchEnabled);
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="relative p-5 md:p-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(35,214,176,0.16),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(196,148,58,0.13),transparent_28%)]" />
        <div className="relative grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-stretch">
          <div>
            <div className="inline-flex items-center gap-2 h-7 px-3 rounded-full border border-ai/30 bg-ai/10 text-ai-glow text-[11px] font-semibold uppercase tracking-[0.1em] mb-4">
              <Bot size={13} /> AI-отдел продаж инвесторов
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-primary tracking-tight max-w-3xl">
              AI привлекает инвесторов за вас
            </h1>
            <p className="text-lg text-primary/90 mt-3 max-w-2xl">
              Получайте горячих инвесторов с чеком от 500 000 ₽ ежедневно
            </p>
            <p className="text-sm text-secondary mt-3 max-w-3xl leading-relaxed">
              AI-агенты платформы звонят инвесторам, ведут переписки, презентуют ваш проект и передают вам только заинтересованных инвесторов.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-5">
              {[
                'AI-прозвон базы инвесторов',
                'AI-переписки в мессенджерах',
                'Квалификация инвесторов',
                'Записи разговоров',
                'Готовые горячие лиды',
                'Замена нецелевых лидов',
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-md border border-hairline bg-canvas/45 px-3 py-2 text-xs text-secondary">
                  <CheckCircle2 size={13} className="text-success shrink-0" />
                  {item}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-6">
              {launchEnabled ? (
                <Button size="lg" variant={launched ? 'secondary' : 'ai'} iconLeft={<Sparkles size={16} />} onClick={onLaunch}>
                  {launched ? 'AI-лиды запущены' : 'Запустить AI-лиды'}
                </Button>
              ) : (
                <Link to={briefHref}>
                  <Button size="lg" iconLeft={<Sparkles size={16} />}>{briefCtaLabel}</Button>
                </Link>
              )}
              {/* Sprint 14: показываем статус брифа конкретного проекта, не
                  абстрактную фразу. AI-лидогенерация не запускается без брифа. */}
              {!launchEnabled && briefStatus && (
                <div className="flex items-center gap-2 text-xs">
                  <StatusBadge tone={briefStatusTone(briefStatus.state)} dot>{briefStatus.label}</StatusBadge>
                  <span className="text-muted">
                    AI-лидогенерация станет доступна после завершения брифа.
                  </span>
                </div>
              )}
              {!launchEnabled && !briefStatus && (
                <span className="text-xs text-muted">
                  Создайте проект, чтобы AI собрал бриф и запустил поиск инвесторов.
                </span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-ai/25 bg-canvas/55 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold">Статус</div>
                <div className="text-base font-semibold text-primary mt-1">
                  {dashboard?.readiness.criticalReady ? 'AI начал поиск инвесторов' : 'AI готовит бриф'}
                </div>
              </div>
              <StatusBadge tone={dashboard?.readiness.criticalReady ? 'success' : 'warning'} dot>
                {dashboard?.readiness.criticalReady ? 'готов' : 'подготовка'}
              </StatusBadge>
            </div>
            <div className="mt-5 space-y-3">
              <PipelineStep done label="Материалы изучены" />
              <PipelineStep done={Boolean(dashboard?.readiness.percent && dashboard.readiness.percent > 45)} label="Профиль инвестора собран" />
              <PipelineStep done={Boolean(dashboard?.readiness.criticalReady)} label="Сценарии коммуникации готовы" />
              <PipelineStep done={launched} label="AI-лидогенерация активна" live={launched} />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function OnboardingCard({
  dashboard,
  selectedProject,
  briefHref,
  briefCtaLabel,
  launched,
}: {
  dashboard: AILeadsDashboard;
  selectedProject: Project | null;
  briefHref: string;
  briefCtaLabel: string;
  launched: boolean;
}) {
  return (
    <Card padded accent={dashboard.readiness.criticalReady ? 'ai' : 'zapusk'}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-md border border-ai/30 bg-ai/12 text-ai-glow flex items-center justify-center shrink-0">
            <Bot size={18} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-primary tracking-tight">{dashboard.onboarding.title}</h2>
            <p className="text-sm text-secondary mt-1 max-w-2xl leading-relaxed">{dashboard.onboarding.description}</p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <StatusBadge tone={dashboard.readiness.state === 'ready' ? 'success' : dashboard.readiness.state === 'in_progress' ? 'warning' : 'neutral'} dot>
                {stateLabel(dashboard.readiness.state)}
              </StatusBadge>
              <span className="text-xs text-muted">
                {selectedProject ? `Проект: ${selectedProject.name}` : 'Создайте проект, чтобы AI начал подготовку'}
              </span>
            </div>
          </div>
        </div>
        {dashboard.readiness.criticalReady ? (
          <Button variant={launched ? 'secondary' : 'ai'} iconLeft={<Radio size={14} />}>
            {launched ? 'Поиск активен' : dashboard.onboarding.launchLabel}
          </Button>
        ) : (
          <Link to={briefHref}>
            <Button iconLeft={<Target size={14} />}>{briefCtaLabel || dashboard.onboarding.cta}</Button>
          </Link>
        )}
      </div>
    </Card>
  );
}

function BriefingAnalyzer({
  dashboard,
  reply,
  onReply,
  interviewHref,
}: {
  dashboard: AILeadsDashboard;
  reply: string;
  onReply: (value: string) => void;
  interviewHref: string;
}) {
  return (
    <Card padded>
      <CardHeader
        title="AI-анализ брифа"
        subtitle="AI изучает материалы проекта и задаёт только недостающие вопросы"
        action={<StatusBadge tone={dashboard.readiness.criticalReady ? 'success' : 'warning'} dot>{dashboard.readiness.percent}%</StatusBadge>}
      />
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">
        <div className="space-y-5">
          <div>
            <ProgressBar value={dashboard.readiness.percent} accent="ai" />
            <div className="text-xs text-muted mt-2">Готовность проекта к инвестициям</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {dashboard.readiness.breakdown.map((item) => (
              <div key={item.label} className="rounded-md border border-hairline bg-canvas/45 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-primary">{item.label}</span>
                  <StatusBadge tone={item.state === 'complete' ? 'success' : item.state === 'partial' ? 'warning' : 'danger'}>
                    {item.percent}%
                  </StatusBadge>
                </div>
                <ProgressBar value={item.percent} size="sm" accent={item.state === 'complete' ? 'zapusk' : 'ai'} />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold mb-2">AI-заполнение брифа</div>
              <div className="space-y-2">
                {dashboard.readiness.extracted.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-canvas/45 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.confidence >= 60 ? <CheckCircle2 size={14} className="text-success shrink-0" /> : <AlertTriangle size={14} className="text-warning shrink-0" />}
                      <div className="min-w-0">
                        <div className="text-xs text-muted">{item.label}</div>
                        <div className="text-sm text-primary truncate">{item.value}</div>
                      </div>
                    </div>
                    <span className="text-[11px] text-muted font-num">{item.confidence}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold mb-2">Что нужно добрать</div>
              <div className="space-y-2">
                {dashboard.readiness.missing.length ? dashboard.readiness.missing.map((item, index) => (
                  <div key={`${item.category}-${index}`} className="rounded-md border border-warning/25 bg-warning/8 px-3 py-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={13} className="text-warning mt-0.5 shrink-0" />
                      <div>
                        <div className="text-sm text-primary leading-snug">{item.question}</div>
                        <div className="text-[11px] text-muted mt-0.5">{item.critical ? 'Критично для запуска AI-лидов' : 'Усилит качество квалификации'}</div>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-md border border-success/25 bg-success/8 px-3 py-3 text-sm text-success">
                    Критичные данные собраны. AI может запускать лидогенерацию.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-ai/20 bg-ai/8 p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-8 h-8 rounded-md bg-ai/15 border border-ai/30 text-ai-glow flex items-center justify-center shrink-0">
              <Sparkles size={15} />
            </div>
            <div>
              <div className="text-sm font-semibold text-primary">AI conversation</div>
              <p className="text-xs text-secondary mt-1 leading-relaxed">
                Я изучил материалы проекта. Ответьте на недостающие вопросы голосом, текстом или файлом.
              </p>
            </div>
          </div>
          <Textarea
            rows={4}
            value={reply}
            onChange={(e) => onReply(e.target.value)}
            placeholder="Например: структура сделки — продажа доли 10%, минимальный чек 1 млн ₽, выплаты раз в квартал…"
          />
          <div className="flex flex-wrap gap-2 mt-3">
            <VoiceInputButton label="Ответить голосом" onTranscript={(text) => onReply(reply.trim() ? `${reply.trim()} ${text}` : text)} />
            <Button size="sm" variant="ghost" iconLeft={<Upload size={12} />}>Прикрепить файл</Button>
            <Link to={interviewHref}>
              <Button size="sm" variant="secondary" iconLeft={<Send size={12} />}>Открыть интервью</Button>
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

function KpiGrid({ dashboard }: { dashboard: AILeadsDashboard }) {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
      <KpiCard label="Получено лидов" value={dashboard.kpis.totalLeads} icon={<Users size={15} />} />
      <KpiCard label="Активных сегодня" value={dashboard.kpis.activeToday} icon={<Flame size={15} />} tone="danger" />
      <KpiCard label="Средний чек" value={dashboard.kpis.avgCheck} icon={<Wallet size={15} />} tone="zapusk" />
      <KpiCard label="AI calls today" value={dashboard.kpis.callsToday} icon={<PhoneCall size={15} />} tone="ai" />
      <KpiCard label="AI messages sent" value={dashboard.kpis.messagesSent} icon={<MessageSquare size={15} />} tone="success" />
    </div>
  );
}

function KpiCard({ label, value, icon, tone }: { label: string; value: string | number; icon: React.ReactNode; tone?: 'ai' | 'zapusk' | 'success' | 'danger' }) {
  const color = tone === 'ai' ? 'text-ai-glow border-ai/30 bg-ai/12'
    : tone === 'zapusk' ? 'text-zapusk-400 border-zapusk/30 bg-zapusk/12'
      : tone === 'success' ? 'text-success border-success/30 bg-success/10'
        : tone === 'danger' ? 'text-danger border-danger/30 bg-danger/10'
          : 'text-secondary border-line bg-elevated';
  return (
    <Card padded className="min-h-[116px]">
      <div className={`w-8 h-8 rounded-md border flex items-center justify-center ${color}`}>{icon}</div>
      <div className="text-2xl font-bold text-primary mt-3 font-num">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.11em] text-muted font-semibold mt-1">{label}</div>
    </Card>
  );
}

function LiveFeed({ leads, locked }: { leads: AILead[]; locked: boolean }) {
  return (
    <Card padded>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-primary tracking-tight">Лента поступающих лидов</h2>
          <p className="text-xs text-muted mt-1">
            Каждый лид приходит с контекстом общения, записью AI-разговора и следующим шагом.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ai opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-ai" />
          </span>
          <span className="text-xs text-ai-glow font-medium">AI обрабатывает…</span>
        </div>
      </div>
      {locked && (
        <div className="mb-4 rounded-md border border-warning/25 bg-warning/8 px-4 py-3 text-sm text-warning">
          Лента показана как демо-превью. Реальный запуск станет доступен после готовности брифа.
        </div>
      )}
      <div className="space-y-3">
        {leads.map((lead) => <LeadCard key={lead.id} lead={lead} />)}
      </div>
    </Card>
  );
}

function LeadCard({ lead }: { lead: AILead }) {
  const [expanded, setExpanded] = useState(lead.status === 'HOT');
  const tags = lead.tags ?? [];
  return (
    <div className="rounded-lg border border-line bg-canvas/45 p-4 hover:border-ai/35 hover:shadow-card transition-all">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <StatusBadge tone={STATUS_TONES[lead.status]} dot>{STATUS_LABELS[lead.status]}</StatusBadge>
            {tags.filter((t) => t !== lead.status).map((tag) => (
              <span key={tag} className="inline-flex items-center h-5 px-2 rounded-full bg-ai/8 border border-ai/25 text-[10px] uppercase tracking-[0.08em] text-ai-glow font-semibold">
                {tag}
              </span>
            ))}
            <span className="text-[11px] text-muted">{relativeTime(lead.receivedAt)}</span>
            {lead.status === 'HOT' && <span className="text-[11px] text-danger font-semibold">новый лид поступил</span>}
          </div>
          <h3 className="text-base font-semibold text-primary tracking-tight">{lead.title}</h3>
          <p className="text-sm text-secondary mt-1 leading-relaxed">{lead.aiSummary}</p>
        </div>
        <Button size="sm" variant="ghost" iconLeft={expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />} onClick={() => setExpanded((v) => !v)}>
          История коммуникации
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
        <LeadMeta label="Имя" value={lead.investor.name} />
        <LeadMeta label="Телефон" value={lead.investor.phone} />
        <LeadMeta label="Чек" value={lead.investor.checkRange} />
        <LeadMeta label="Срок" value={lead.investor.decisionWindow} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-4 mt-4">
        <div className="rounded-md border border-hairline bg-surface p-4">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold mb-2">Что произошло</div>
          <p className="text-sm text-primary leading-relaxed">{lead.whatHappened.summary}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <InfoBlock label="Что заинтересовало" value={lead.whatHappened.interest} />
            <InfoBlock label="Следующий шаг" value={lead.whatHappened.nextStep} />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {lead.whatHappened.sent.map((item) => (
              <StatusBadge key={item} tone="neutral">{item}</StatusBadge>
            ))}
          </div>
          {lead.whatHappened.objections.length > 0 && (
            <div className="mt-3 rounded-md border border-warning/25 bg-warning/8 px-3 py-2 text-xs text-warning">
              {lead.whatHappened.objections.join(' ')}
            </div>
          )}
        </div>
        <AudioCard audio={lead.audio} />
      </div>

      {expanded && (
        <div className="mt-4 border-t border-hairline pt-4 space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold mb-3">История встреч с инвестором</div>
            <RecentMeetings leadId={lead.id} limit={3} />
          </div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold mb-3">История коммуникации</div>
          <div className="space-y-3">
            {lead.communications.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-md border border-ai/25 bg-ai/10 text-ai-glow flex items-center justify-center shrink-0">
                  {channelIcon(item.channel)}
                </div>
                <div className="min-w-0 flex-1 rounded-md border border-hairline bg-surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-primary">{item.title}</div>
                    <span className="text-[11px] text-muted">{CHANNEL_LABELS[item.channel]} · {relativeTime(item.at)}</span>
                  </div>
                  <p className="text-xs text-secondary mt-1 leading-relaxed">{item.body}</p>
                  <div className="text-[11px] text-ai-glow mt-2">{item.outcome}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AudioCard({ audio }: { audio: AILead['audio'] }) {
  return (
    <div className="rounded-md border border-ai/25 bg-ai/8 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold">Запись разговора</div>
          <div className="text-sm font-semibold text-primary mt-1 truncate">{audio.label}</div>
          <div className="text-xs text-muted mt-1">{formatDuration(audio.durationSec)}</div>
        </div>
        {audio.url ? (
          <a
            href={audio.url}
            target="_blank"
            rel="noreferrer"
            className="w-11 h-11 rounded-full bg-grad-ai text-canvas shadow-ai-glow inline-flex items-center justify-center hover:brightness-110 transition-all"
            title="Открыть запись"
          >
            <Play size={17} />
          </a>
        ) : (
          <button type="button" className="w-11 h-11 rounded-full bg-elevated text-muted inline-flex items-center justify-center" disabled>
            <Pause size={17} />
          </button>
        )}
      </div>
      {audio.url ? (
        <audio controls preload="none" className="mt-3 w-full h-9" src={audio.url}>
          Запись недоступна в этом браузере.
        </audio>
      ) : (
        <div className="mt-4 h-8 flex items-center gap-1">
          {Array.from({ length: 28 }).map((_, i) => (
            <span key={i} className="w-1 rounded-full bg-ai/35" style={{ height: `${8 + ((i * 7) % 20)}px` }} />
          ))}
        </div>
      )}
    </div>
  );
}

function GuaranteeCard({ policy }: { policy: AILeadsDashboard['replacementPolicy'] }) {
  return (
    <Card padded accent="zapusk">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-md bg-zapusk/12 border border-zapusk/30 text-zapusk-400 flex items-center justify-center shrink-0">
          <ShieldCheck size={17} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-primary">{policy.title}</h3>
          <p className="text-xs text-secondary mt-1 leading-relaxed">{policy.description}</p>
        </div>
      </div>
      <div className="space-y-2">
        {policy.replacementTriggers.map((item) => (
          <div key={item} className="flex items-start gap-2 text-xs text-secondary">
            <CheckCircle2 size={13} className="text-success mt-0.5 shrink-0" />
            {item}
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-md border border-hairline bg-canvas/45 p-3">
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold mb-1">Юридически важно</div>
        <div className="text-xs text-muted leading-relaxed">
          {policy.contactAttempts} попыток связи. {policy.disclaimers.join('; ')}.
        </div>
      </div>
    </Card>
  );
}

function StrategyCard({ positioning, triggers, investors }: { positioning: string; triggers: string[]; investors: string[] }) {
  return (
    <Card padded accent="ai">
      <CardHeader title="Investor strategy" subtitle="Как AI будет продавать проект инвесторам" />
      <p className="text-sm text-primary leading-relaxed">{positioning}</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold mb-2">Key triggers</div>
          <div className="flex flex-wrap gap-1.5">
            {triggers.map((trigger) => <StatusBadge key={trigger} tone="ai">{trigger}</StatusBadge>)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold mb-2">ICP investors</div>
          <ul className="space-y-1.5">
            {investors.map((item) => (
              <li key={item} className="flex items-start gap-2 text-xs text-secondary">
                <Target size={12} className="text-ai-glow mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function PipelineStep({ label, done, live }: { label: string; done?: boolean; live?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-6 h-6 rounded-full border inline-flex items-center justify-center ${done ? 'border-success/40 bg-success/10 text-success' : 'border-line bg-surface text-muted'}`}>
        {done ? <CheckCircle2 size={13} /> : <Clock size={12} />}
      </span>
      <span className={`text-sm ${done ? 'text-primary' : 'text-muted'}`}>{label}</span>
      {live && <span className="ml-auto w-2 h-2 rounded-full bg-ai animate-pulse" />}
    </div>
  );
}

// Sprint 27 — empty state для active кабинета без запущенных лидов.
// Никаких «43 звонка сегодня» — честная коммуникация: AI-лиды откроются
// после готовности материалов и согласования с менеджером.
function EmptyLeadsState({
  dashboard, briefHref, briefCtaLabel,
}: {
  dashboard: AILeadsDashboard;
  briefHref: string;
  briefCtaLabel: string;
}) {
  const briefReady = dashboard.readiness.criticalReady;
  return (
    <Card padded accent="ai" className="overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(35,214,176,0.10),transparent_30%)]" />
      <div className="relative grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-ai-glow font-semibold mb-2">
            <Sparkles size={12} /> AI-лиды · подготовка
          </div>
          <h2 className="text-xl font-semibold text-primary tracking-tight">
            {briefReady ? 'Готовы запустить поток AI-лидов' : 'AI-лиды появятся после запуска проекта'}
          </h2>
          <p className="text-sm text-secondary mt-2 max-w-2xl leading-relaxed">
            {briefReady
              ? 'Бриф готов. Следующий шаг — менеджер согласует упаковку и юридическую часть, затем мы запустим AI-каналы.'
              : 'Заполните бриф проекта — без него AI не сможет квалифицировать инвесторов и презентовать сделку.'}
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Link to={briefHref}>
              <Button variant={briefReady ? 'secondary' : 'primary'} iconLeft={<Target size={13} />}>
                {briefCtaLabel}
              </Button>
            </Link>
            <Link to="/demo/ai-leads">
              <Button variant="ghost" iconLeft={<Sparkles size={13} />}>
                Посмотреть демо AI-лидов
              </Button>
            </Link>
            <Link to="/personal-manager">
              <Button variant="ghost" iconLeft={<MessageSquare size={13} />}>
                Связаться с менеджером
              </Button>
            </Link>
          </div>
        </div>
        <div className="rounded-md border border-line bg-canvas/55 p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold">Что появится здесь</div>
          <PendingLine icon={<PhoneCall size={13} />} label="AI-звонки инвесторам" />
          <PendingLine icon={<MessageSquare size={13} />} label="AI-переписки в мессенджерах" />
          <PendingLine icon={<UserCheck size={13} />} label="Квалифицированные лиды" />
          <PendingLine icon={<Headphones size={13} />} label="Записи и транскрипты разговоров" />
        </div>
      </div>
    </Card>
  );
}

function PendingLine({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-secondary">
      <span className="text-muted">{icon}</span>
      <span>{label}</span>
      <span className="ml-auto text-[10px] uppercase tracking-[0.1em] text-muted">ожидаем данные</span>
    </div>
  );
}

function LiveStatus({ icon, label, value, active }: { icon: React.ReactNode; label: string; value: string; active?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-hairline bg-canvas/45 px-3 py-2">
      <div className={`w-8 h-8 rounded-md border flex items-center justify-center ${active ? 'border-ai/30 bg-ai/10 text-ai-glow' : 'border-line bg-elevated text-secondary'}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm text-primary">{label}</div>
        <div className="text-xs text-muted">{value}</div>
      </div>
      {active && <span className="ml-auto w-2 h-2 rounded-full bg-success animate-pulse" />}
    </div>
  );
}

function LeadMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-surface px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold">{label}</div>
      <div className="text-sm text-primary mt-1 truncate">{value}</div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-canvas/45 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold">{label}</div>
      <div className="text-xs text-primary mt-1 leading-relaxed">{value}</div>
    </div>
  );
}

function channelIcon(channel: Channel) {
  if (channel === 'AI_CALL') return <PhoneCall size={14} />;
  if (channel === 'TELEGRAM' || channel === 'WHATSAPP') return <MessageSquare size={14} />;
  if (channel === 'AVITO') return <Send size={14} />;
  return <Activity size={14} />;
}

function stateLabel(state: BriefingState): string {
  if (state === 'ready') return 'Ready for AI Leads';
  if (state === 'in_progress') return 'In Progress';
  return 'Draft';
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.max(1, Math.round(diff / 60_000));
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  return `${hours} ч назад`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
