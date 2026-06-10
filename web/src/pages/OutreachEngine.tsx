// Sprint 62.P14 — AI Outreach Engine = Signal Engine (демо, MOCK-ONLY).
//
// Рамка: не «кому написать», а «почему стоит написать именно сейчас». Главный
// экран — лента сигналов (поводов), НЕ список инвесторов и НЕ CRM-таблица.
// Investor Fit, Drafts, Follow-Up, Zoom Pipeline, Learning — подчинённые экраны.
//
// Инварианты: агент сам не пишет (готовит черновик, отправляет человек);
// нет сигнала → нет аутрича; черновик привязан к signal_id; скоринг —
// качественный (high/medium/low fit), не точная вероятность; не называем
// человека инвестором без доказательств; канал/медиа не трактуем как человека.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Radar, ShieldCheck, Target, MessageSquareText, Reply, Video, Brain,
  ArrowLeft, Copy, Check, ExternalLink, AlertTriangle, ArrowRight, Search,
  Sparkles, CircleHelp, Clock, EyeOff, Lock, Inbox,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  SIGNALS, INVESTOR_FIT, PROJECT_ICP, SIGNAL_PERFORMANCE,
  SIGNAL_TYPE_LABEL, CONTACT_TYPE_LABEL, SOURCE_LABEL, CONFIDENCE_LABEL,
  FILTER_LABEL, FIT_LABEL, PIPELINE_LABEL, PIPELINE_ORDER,
  contactTypeTone, confidenceTone, fitTone, matchesFilter, chatDeepLink,
  DEAL_LEARNING,
  type Signal, type SignalFilter, type Confidence, type PipelineStage,
  type SignalPerformance,
} from '../lib/outreach';
import { loadDemoSignals, loadOwnerSignals } from '../lib/signalsImport';

type Tab = 'feed' | 'fit' | 'drafts' | 'followup' | 'pipeline' | 'learning';
const TABS: { id: Tab; label: string; icon: typeof Radar }[] = [
  { id: 'fit', label: 'Релевантность инвестора', icon: Target },
  { id: 'feed', label: 'Лента сигналов', icon: Radar },
  { id: 'drafts', label: 'Черновики сообщений', icon: MessageSquareText },
  { id: 'followup', label: 'Фоллоу-ап', icon: Reply },
  { id: 'pipeline', label: 'Zoom Воронка', icon: Video },
  { id: 'learning', label: 'Обучение', icon: Brain },
];

// Sprint 62.P16 — два режима данных.
//   • demo  → /signals.demo.json (обезличено), fallback на mock SIGNALS.
//   • owner → /signals.import.json (реальные данные), нет файла → пустое состояние.
// По умолчанию — Safe Demo Mode.
type Mode = 'demo' | 'owner';

// Источник ленты в demo-режиме: обезличенный импорт или mock-fallback.
type DemoSource =
  | { kind: 'demo_import'; signals: Signal[]; exportedAt?: string }
  | { kind: 'mock'; signals: Signal[] };

export default function OutreachEngine() {
  const [tab, setTab] = useState<Tab>('fit');
  const [mode, setMode] = useState<Mode>('demo');

  // Safe Demo Mode: demo-файл или mock.
  const [demoSrc, setDemoSrc] = useState<DemoSource>({ kind: 'mock', signals: SIGNALS });
  const [demoLoading, setDemoLoading] = useState(true);
  // Owner Mode: реальные сигналы (null = ещё не экспортированы).
  const [owner, setOwner] = useState<{ signals: Signal[]; exportedAt?: string } | null>(null);
  const [ownerLoading, setOwnerLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadDemoSignals()
      .then((res) => {
        if (alive && res) setDemoSrc({ kind: 'demo_import', signals: res.signals, exportedAt: res.exportedAt });
      })
      .finally(() => { if (alive) setDemoLoading(false); });
    loadOwnerSignals()
      .then((res) => { if (alive) setOwner(res ? { signals: res.signals, exportedAt: res.exportedAt } : null); })
      .finally(() => { if (alive) setOwnerLoading(false); });
    return () => { alive = false; };
  }, []);

  const ownerMode = mode === 'owner';
  const signals = ownerMode ? (owner?.signals ?? []) : demoSrc.signals;
  // Owner Mode ещё грузится или файла нет → покажем пустое состояние вместо вкладок.
  const ownerEmpty = ownerMode && !ownerLoading && owner === null;

  return (
    <AppLayout title="AI-аутрич">
      <Link
        to="/ai-leads"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft size={14} /> AI-лиды
      </Link>

      <Hero />

      <ModeBar
        mode={mode}
        onChange={setMode}
        demoSrc={demoSrc}
        demoLoading={demoLoading}
        owner={owner}
        ownerLoading={ownerLoading}
      />

      {/* вкладки: Signals Feed — главный, остальное подчинено */}
      <div className="flex flex-wrap gap-2 mt-5 mb-5">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-3.5 h-9 rounded-md text-[13px] font-medium border transition-all ${
                active
                  ? 'bg-ai/10 border-ai/40 text-primary shadow-ai-glow'
                  : 'bg-surface border-line text-secondary hover:border-ai/30'
              }`}
            >
              <t.icon size={15} className={active ? 'text-ai' : ''} /> {t.label}
            </button>
          );
        })}
      </div>

      {ownerEmpty ? (
        <OwnerEmptyState />
      ) : (
        <>
          {tab === 'feed' && <SignalsFeed signals={signals} ownerMode={ownerMode} />}
          {tab === 'fit' && <InvestabilityEngine />}
          {tab === 'drafts' && <OutreachDrafts signals={signals} ownerMode={ownerMode} />}
          {tab === 'followup' && <FollowUpEngine signals={signals} ownerMode={ownerMode} />}
          {tab === 'pipeline' && <ZoomPipeline signals={signals} />}
          {tab === 'learning' && <LearningEngine />}
        </>
      )}
    </AppLayout>
  );
}

// Переключатель режимов + бейдж текущего источника.
function ModeBar({
  mode, onChange, demoSrc, demoLoading, owner, ownerLoading,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  demoSrc: DemoSource;
  demoLoading: boolean;
  owner: { signals: Signal[]; exportedAt?: string } | null;
  ownerLoading: boolean;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
        {(['demo', 'owner'] as Mode[]).map((m) => {
          const active = mode === m;
          const isOwner = m === 'owner';
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-[12px] font-medium transition-all ${
                active
                  ? isOwner ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              {isOwner ? <Lock size={13} /> : <ShieldCheck size={13} />}
              {isOwner ? 'Режим проекта' : 'Безопасное демо'}
            </button>
          );
        })}
      </div>

      {mode === 'demo' ? (
        <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <StatusBadge tone="success" dot><EyeOff size={12} className="mr-1" />Безопасное демо — данные обезличены</StatusBadge>
          <span className="text-muted">
            {demoLoading ? 'загрузка…'
              : demoSrc.kind === 'demo_import' ? `${demoSrc.signals.length} демо-сигналов`
              : `резервные данные (${demoSrc.signals.length})`}
          </span>
        </div>
      ) : (
        <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <StatusBadge tone="warning" dot>Режим проекта — реальные данные</StatusBadge>
          <span className="text-muted">
            {ownerLoading ? 'загрузка…' : owner ? `${owner.signals.length} реальных сигналов` : 'не экспортированы'}
          </span>
        </div>
      )}
    </div>
  );
}

// Owner Mode без экспортированного файла.
function OwnerEmptyState() {
  return (
    <Card className="text-center py-12">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-elevated border border-line mb-3">
        <Inbox size={22} className="text-muted" />
      </div>
      <div className="text-[15px] font-semibold text-primary">Реальные сигналы ещё не экспортированы</div>
      <p className="text-[13px] text-muted mt-2 max-w-md mx-auto leading-relaxed">
        Режим проекта читает <code className="text-secondary">signals.import.json</code>. Файл не закоммичен и
        генерируется локально экспортом из внешнего «TG-BOT + Outreach». Пока файла нет — переключитесь в
        Безопасное демо, чтобы посмотреть механику на обезличенных данных.
      </p>
    </Card>
  );
}

function Hero() {
  return (
    <Card padded={false} accent="ai">
      <div className="relative p-6 bg-grad-ink overflow-hidden">
        <div className="absolute -top-10 -right-10 w-48 h-48 bg-ai/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-dot-grid opacity-[0.15] pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md bg-ai/15 border border-ai/30 text-ai text-[11px] font-semibold">
              <Radar size={13} /> AI-отдел привлечения капитала
            </span>
            <StatusBadge tone="neutral" dot>Демо · синтетика</StatusBadge>
          </div>
          <h2 className="text-xl sm:text-2xl font-semibold text-primary tracking-tight max-w-2xl">
            Не «кому написать», а «почему стоит написать именно сейчас»
          </h2>
          <p className="text-sm text-secondary mt-2 max-w-2xl leading-relaxed">
            Система не хранит контакты. Она изучает историю привлечения капитала проекта —
            <span className="text-primary font-medium"> кто уже инвестировал, кто рассматривал сделку и отказался, почему принимались решения</span> —
            и находит новых инвесторов, максимально похожих на тех, кто уже зашёл в проект.
            Telegram — первая интеграция; архитектура рассчитана на WhatsApp, LinkedIn, X и другие каналы.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-[12px] text-muted">
            <span className="inline-flex items-center gap-1.5"><Brain size={14} className="text-ai" /> Учится на ваших сделках — это и есть преимущество</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-success" /> Агент сам не пишет — отправляете вы</span>
            <span className="inline-flex items-center gap-1.5"><Search size={14} className="text-ai" /> Нет сигнала — нет аутрича</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── 1. Signals Feed (главный экран) ─────────────────────────────────────────
function SignalsFeed({ signals, ownerMode }: { signals: Signal[]; ownerMode: boolean }) {
  const [conf, setConf] = useState<Set<Confidence>>(new Set());
  const [filter, setFilter] = useState<SignalFilter>('all');

  const toggleConf = (c: Confidence) =>
    setConf((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });

  const visible = useMemo(
    () =>
      signals.filter((s) => (conf.size === 0 || conf.has(s.confidence)) && matchesFilter(s, filter)),
    [signals, conf, filter],
  );

  const FILTERS: SignalFilter[] = [
    'all', 'investors', 'existing_base', 'new_contacts', 'telegram', 'past_relationship', 'follow_up', 'project_fit',
  ];

  return (
    <div>
      {/* фильтры */}
      <Card className="!p-4 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-faint uppercase tracking-wide mr-1">Уверенность</span>
          {(['high', 'medium', 'low'] as Confidence[]).map((c) => (
            <FilterChip key={c} active={conf.has(c)} tone={confidenceTone(c)} onClick={() => toggleConf(c)}>
              {CONFIDENCE_LABEL[c]}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-hairline">
          <span className="text-[11px] text-faint uppercase tracking-wide mr-1">Фильтр</span>
          {FILTERS.map((f) => (
            <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)}>
              {FILTER_LABEL[f]}
            </FilterChip>
          ))}
        </div>
      </Card>

      <div className="text-[11px] text-muted mb-3 px-1">{visible.length} сигналов</div>

      <div className="space-y-4">
        {visible.map((s) => <SignalCard key={s.id} s={s} ownerMode={ownerMode} />)}
        {visible.length === 0 && (
          <Card className="text-center text-sm text-muted py-10">Под выбранные фильтры сигналов нет.</Card>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active, tone, onClick, children,
}: { active: boolean; tone?: 'success' | 'warning' | 'neutral'; onClick: () => void; children: React.ReactNode }) {
  const activeCls =
    tone === 'success' ? 'bg-success/10 border-success/40 text-success'
    : tone === 'warning' ? 'bg-warning/10 border-warning/40 text-warning'
    : 'bg-ai/10 border-ai/40 text-primary';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 h-8 rounded-md text-[12px] font-medium border transition-all ${
        active ? activeCls : 'bg-surface border-line text-secondary hover:border-ai/30'
      }`}
    >
      {children}
    </button>
  );
}

// карточка сигнала отвечает на 5 вопросов.
// ownerMode=false (Safe Demo): @handle не показываем; источник — обобщённый sourceTitle.
function SignalCard({ s, ownerMode }: { s: Signal; ownerMode: boolean }) {
  const sourceLabel = s.sourceTitle || SOURCE_LABEL[s.signalSource];
  return (
    <Card accent={s.confidence === 'high' ? 'ai' : null}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-primary">{s.contactName}</span>
            <StatusBadge tone={contactTypeTone(s.contactType)}>{CONTACT_TYPE_LABEL[s.contactType]}</StatusBadge>
            {ownerMode && s.handle && <span className="text-[11px] text-muted">@{s.handle}</span>}
          </div>
          <div className="mt-1.5 inline-flex items-center gap-2 text-[12px]">
            <span className="px-2 h-6 inline-flex items-center rounded-md bg-ai/10 text-ai font-medium">
              {SIGNAL_TYPE_LABEL[s.signalType]}
            </span>
            <span className="text-faint">·</span>
            <span className="text-muted">{sourceLabel}</span>
          </div>
        </div>
        <StatusBadge tone={confidenceTone(s.confidence)} dot>уверенность: {CONFIDENCE_LABEL[s.confidence]}</StatusBadge>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        <QA q="Что произошло" a={s.signalText} sub={s.whyFound} />
        <QA q="Почему это важно" a={s.whyImportant} />
        <QA q="Почему релевантно проекту" a={s.whyRelevant} />
        <QA q="Что стоит сделать" a={s.actionRecommendation} />
      </div>

      {/* риск ошибки */}
      <div className="mt-4 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
        <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
        <div className="text-[12px] text-secondary"><span className="text-warning font-medium">Риск ошибки: </span>{s.riskOfError}</div>
      </div>

      {/* черновик строится ОТ сигнала; нет повода писать как человеку → нет черновика */}
      {s.draftMessage ? (
        <DraftBlock signalId={s.id} draft={s.draftMessage} handle={s.handle} nextStep={s.nextStep} ownerMode={ownerMode} />
      ) : (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-line bg-elevated px-3 py-2 text-[12px] text-muted">
          <CircleHelp size={14} className="shrink-0 mt-0.5 text-info" />
          Черновик не предлагается: это {CONTACT_TYPE_LABEL[s.contactType]}, писать как человеку повода нет. Следующий шаг: {s.nextStep}
        </div>
      )}
    </Card>
  );
}

function QA({ q, a, sub }: { q: string; a: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] text-faint uppercase tracking-wide mb-1">{q}</div>
      <div className="text-[13px] text-secondary leading-snug">{a}</div>
      {sub && <div className="text-[11px] text-muted mt-1 leading-snug">{sub}</div>}
    </div>
  );
}

// ownerMode=false (Safe Demo): кнопка «Открыть чат» и deep-link (t.me/...) скрыты —
// в демо нет реального @handle и ссылок. Черновик копировать можно (он синтетический).
function DraftBlock({
  signalId, draft, handle, nextStep, ownerMode,
}: { signalId: string; draft: string; handle?: string; nextStep: string; ownerMode: boolean }) {
  const [copied, setCopied] = useState(false);
  const deepLink = ownerMode ? chatDeepLink(handle, draft) : null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); }
  };
  return (
    <div className="mt-4 rounded-lg border border-line bg-elevated p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-faint uppercase tracking-wide">Черновик · от сигнала {signalId}</div>
        <span className="text-[10px] text-muted">стиль владельца</span>
      </div>
      <p className="text-[13px] text-primary leading-relaxed whitespace-pre-wrap">{draft}</p>
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
        {ownerMode && (
          <Button variant="ai" size="sm" iconLeft={<ExternalLink size={14} />} disabled title="Отправка отключена — отправляете вы вручную">
            Открыть чат
          </Button>
        )}
        <Button variant="secondary" size="sm" iconLeft={copied ? <Check size={14} /> : <Copy size={14} />} onClick={copy}>
          {copied ? 'Скопировано' : 'Скопировать'}
        </Button>
        <div className="flex items-center gap-1.5 text-[11px] text-muted sm:ml-auto">
          <ShieldCheck size={13} className="text-success" /> Отправляете вы, руками
        </div>
      </div>
      <div className="mt-2 text-[11px] text-muted inline-flex items-center gap-1.5">
        <ArrowRight size={12} /> Следующий шаг: {nextStep}
      </div>
      {deepLink && (
        <code className="block mt-2 px-2 py-1.5 rounded bg-surface border border-line text-[10px] text-secondary break-all font-num">
          {deepLink}
        </code>
      )}
    </div>
  );
}

// ── 2. Investability Engine (Investor Fit) ──────────────────────────────────
function InvestabilityEngine() {
  return (
    <div className="space-y-5">
      {/* ядро продукта: обучение на реальных сделках — то, что сложно повторить */}
      <Card accent="ai">
        <CardHeader
          title={<span className="inline-flex items-center gap-2"><Brain size={15} className="text-ai" /> Ядро системы — обучение на ваших сделках</span>}
          subtitle="AI изучает не только тех, кто инвестировал, но и тех, кто отказался, и строит модель инвестиционного решения именно для этого проекта"
        />
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-line bg-elevated px-3 py-2.5 text-center">
            <div className="text-[20px] font-semibold text-primary font-num">{DEAL_LEARNING.dealsAnalyzed}</div>
            <div className="text-[10px] text-muted uppercase tracking-wide mt-0.5">сделок в анализе</div>
          </div>
          <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2.5 text-center">
            <div className="text-[20px] font-semibold text-success font-num">{DEAL_LEARNING.invested}</div>
            <div className="text-[10px] text-muted uppercase tracking-wide mt-0.5">инвестировали</div>
          </div>
          <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-center">
            <div className="text-[20px] font-semibold text-warning font-num">{DEAL_LEARNING.declined}</div>
            <div className="text-[10px] text-muted uppercase tracking-wide mt-0.5">отказались</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <div className="text-[10px] text-faint uppercase tracking-wide mb-1.5">На какие вопросы отвечает модель</div>
            <ul className="space-y-1">
              {DEAL_LEARNING.questions.map((q) => (
                <li key={q} className="text-[12px] text-secondary leading-snug flex gap-1.5">
                  <CircleHelp size={13} className="text-info shrink-0 mt-0.5" /> {q}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[10px] text-faint uppercase tracking-wide mb-1.5">Что модель уже выявила</div>
            <ul className="space-y-1">
              {DEAL_LEARNING.patterns.map((p) => (
                <li key={p} className="text-[12px] text-secondary leading-snug flex gap-1.5">
                  <Sparkles size={13} className="text-ai shrink-0 mt-0.5" /> {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-md border border-ai/30 bg-ai/5 px-3 py-2.5">
          <Target size={15} className="text-ai shrink-0 mt-0.5" />
          <div className="text-[13px] text-secondary">
            Среди контактов проекта найдено <span className="text-primary font-semibold">{DEAL_LEARNING.lookalikeCount}</span> человек
            с профилем поведения, максимально похожим на действующих инвесторов. Ниже — почему именно они.
          </div>
        </div>
      </Card>

      <Card accent="zapusk">
        <CardHeader
          title={<span className="inline-flex items-center gap-2"><Target size={15} className="text-zapusk" /> Профиль целевого инвестора</span>}
          subtitle={`Не задан вручную — выведен моделью из истории сделок проекта «${PROJECT_ICP.projectName}»`}
        />
        <p className="text-[13px] text-secondary leading-relaxed">{PROJECT_ICP.summary}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PROJECT_ICP.traits.map((t) => (
            <span key={t} className="px-2 h-6 inline-flex items-center rounded-md bg-elevated border border-line text-[11px] text-secondary">{t}</span>
          ))}
        </div>
        <div className="mt-3 text-[11px] text-muted">Темы: {PROJECT_ICP.topThemes.join(' · ')}</div>
      </Card>

      <div className="rounded-md border border-info/30 bg-info/5 px-3 py-2 text-[12px] text-secondary inline-flex items-start gap-2">
        <Sparkles size={14} className="text-info shrink-0 mt-0.5" />
        Релевантность — качественная оценка похожести, не точная вероятность. Используем градации «высокая / средняя / низкая / неизвестно» с объяснением и риском ошибки.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {INVESTOR_FIT.map((f) => (
          <Card key={f.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-primary">{f.contactName}</span>
                  <StatusBadge tone={contactTypeTone(f.contactType)}>{CONTACT_TYPE_LABEL[f.contactType]}</StatusBadge>
                </div>
              </div>
              <StatusBadge tone={fitTone(f.fit)} dot>{FIT_LABEL[f.fit]}</StatusBadge>
            </div>
            <p className="text-[13px] text-secondary leading-snug mt-3">{f.explanation}</p>
            {f.matchingTopics.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] text-faint uppercase tracking-wide mb-1">Совпадающие темы</div>
                <div className="flex flex-wrap gap-1.5">
                  {f.matchingTopics.map((t) => (
                    <span key={t} className="px-2 h-6 inline-flex items-center rounded-md bg-ai/10 text-ai text-[11px]">{t}</span>
                  ))}
                </div>
              </div>
            )}
            {f.similarInvestors.length > 0 && (
              <div className="mt-3 text-[11px] text-muted">Похожие инвесторы: {f.similarInvestors.join(' · ')}</div>
            )}
            <div className="mt-3 flex items-start gap-2 text-[11px] text-secondary">
              <AlertTriangle size={13} className="text-warning shrink-0 mt-0.5" />
              <span><span className="text-warning font-medium">Риск ошибки: </span>{f.riskOfError}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── 3. Outreach Drafts (каждый черновик от signal_id) ───────────────────────
function OutreachDrafts({ signals, ownerMode }: { signals: Signal[]; ownerMode: boolean }) {
  const withDraft = signals.filter((s) => s.draftMessage);
  return (
    <div className="space-y-4">
      <div className="text-[12px] text-muted px-1">
        Каждый черновик строится <span className="text-primary font-medium">от сигнала</span>, а не от контакта.
        Без сигнала черновик не генерируется.
      </div>
      {withDraft.map((s) => (
        <Card key={s.id} accent="ai">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-primary">{s.contactName}</span>
            <StatusBadge tone={contactTypeTone(s.contactType)}>{CONTACT_TYPE_LABEL[s.contactType]}</StatusBadge>
            <span className="px-2 h-6 inline-flex items-center rounded-md bg-ai/10 text-ai text-[11px] font-medium">
              {SIGNAL_TYPE_LABEL[s.signalType]}
            </span>
          </div>
          <div className="mt-2 text-[12px] text-muted">Повод: {s.signalText}</div>
          <DraftBlock signalId={s.id} draft={s.draftMessage!} handle={s.handle} nextStep={s.nextStep} ownerMode={ownerMode} />
        </Card>
      ))}
    </div>
  );
}

// ── 4. Follow-Up Engine (мяч на нашей стороне) ──────────────────────────────
function FollowUpEngine({ signals, ownerMode }: { signals: Signal[]; ownerMode: boolean }) {
  const items = signals.filter((s) => s.ballOnOurSide);
  return (
    <div className="space-y-4">
      <div className="text-[12px] text-muted px-1">
        Где мяч на нашей стороне: кому не ответили, где была договорённость, кого пора реактивировать.
      </div>
      {items.map((s) => (
        <Card key={s.id} accent="zapusk">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-primary">{s.contactName}</span>
                <StatusBadge tone={contactTypeTone(s.contactType)}>{CONTACT_TYPE_LABEL[s.contactType]}</StatusBadge>
                <StatusBadge tone="warning" dot>мяч на нашей стороне</StatusBadge>
              </div>
              <div className="mt-1.5 text-[12px] text-secondary">{s.signalText}</div>
            </div>
            {s.whenToFollowUp && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-zapusk font-medium">
                <Clock size={13} /> Писать: {s.whenToFollowUp}
              </span>
            )}
          </div>
          {s.draftMessage && <DraftBlock signalId={s.id} draft={s.draftMessage} handle={s.handle} nextStep={s.nextStep} ownerMode={ownerMode} />}
        </Card>
      ))}
      {items.length === 0 && <Card className="text-center text-sm text-muted py-10">Открытых фоллоу-ап нет.</Card>}
    </div>
  );
}

// ── 5. Zoom Pipeline (воронка) ──────────────────────────────────────────────
function ZoomPipeline({ signals }: { signals: Signal[] }) {
  const byStage = (stage: PipelineStage) => signals.filter((s) => s.pipelineStage === stage);
  return (
    <div>
      <div className="text-[12px] text-muted px-1 mb-4">
        Путь к сделке: Сигнал → Контакт → Коммуникация → Zoom → Проверка (DD) → Инвестиция.
        AI показывает, где находится каждый контакт и где теряются потенциальные сделки.
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {PIPELINE_ORDER.map((stage) => {
          const items = byStage(stage);
          return (
            <div key={stage} className="rounded-lg border border-line bg-surface p-3 min-h-[120px]">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-semibold text-primary leading-tight">{PIPELINE_LABEL[stage]}</div>
                <span className="text-[11px] text-muted font-num">{items.length}</span>
              </div>
              <div className="space-y-1.5">
                {items.map((s) => (
                  <div key={s.id} className="rounded-md border border-hairline bg-elevated px-2 py-1.5">
                    <div className="text-[12px] text-secondary truncate">{s.contactName}</div>
                    <div className="text-[10px] text-muted truncate">{CONTACT_TYPE_LABEL[s.contactType]}</div>
                  </div>
                ))}
                {items.length === 0 && <div className="text-[10px] text-faint">—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 6. Learning Engine (какие сигналы конвертируются) ───────────────────────
function LearningEngine() {
  const rows = [...SIGNAL_PERFORMANCE].sort((a, b) => b.investmentRate - a.investmentRate);
  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Brain size={15} className="text-ai" /> Какие сигналы конвертируются</span>}
        subtitle="Относительные показатели по историческим касаниям (демо), не прогноз по конкретному человеку"
      />
      <div className="space-y-3">
        <div className="hidden sm:grid grid-cols-12 gap-3 text-[10px] text-faint uppercase tracking-wide px-1">
          <div className="col-span-4">Тип сигнала</div>
          <div className="col-span-2">→ Ответ</div>
          <div className="col-span-2">→ Zoom</div>
          <div className="col-span-2">→ Инвестиция</div>
          <div className="col-span-2">Шум</div>
        </div>
        {rows.map((r) => <LearningRow key={r.signalType} r={r} />)}
      </div>
    </Card>
  );
}

function LearningRow({ r }: { r: SignalPerformance }) {
  const noiseTone = r.noise === 'low' ? 'success' : r.noise === 'medium' ? 'warning' : 'danger';
  const noiseLabel = r.noise === 'low' ? 'низкий' : r.noise === 'medium' ? 'средний' : 'высокий';
  return (
    <div className="grid grid-cols-2 sm:grid-cols-12 gap-3 items-center py-2 border-t border-hairline">
      <div className="col-span-2 sm:col-span-4 text-[12px] text-secondary">{SIGNAL_TYPE_LABEL[r.signalType]}</div>
      <Bar className="sm:col-span-2" value={r.replyRate} color="bg-info" />
      <Bar className="sm:col-span-2" value={r.zoomRate} color="bg-ai" />
      <Bar className="sm:col-span-2" value={r.investmentRate} color="bg-success" />
      <div className="col-span-2 sm:col-span-2">
        <StatusBadge tone={noiseTone}>{noiseLabel}</StatusBadge>
      </div>
    </div>
  );
}

function Bar({ value, color, className = '' }: { value: number; color: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-1.5 rounded-full bg-elevated overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[11px] text-muted font-num w-7 text-right">{value}</span>
    </div>
  );
}
