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
  Sparkles, CircleHelp, Clock, Download, FlaskConical,
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
  type Signal, type SignalFilter, type Confidence, type PipelineStage,
  type SignalPerformance,
} from '../lib/outreach';
import { loadImportedSignals } from '../lib/signalsImport';

type Tab = 'feed' | 'fit' | 'drafts' | 'followup' | 'pipeline' | 'learning';
const TABS: { id: Tab; label: string; icon: typeof Radar }[] = [
  { id: 'feed', label: 'Signals Feed', icon: Radar },
  { id: 'fit', label: 'Investor Fit', icon: Target },
  { id: 'drafts', label: 'Outreach Drafts', icon: MessageSquareText },
  { id: 'followup', label: 'Follow-Up', icon: Reply },
  { id: 'pipeline', label: 'Zoom Pipeline', icon: Video },
  { id: 'learning', label: 'Learning', icon: Brain },
];

// Источник ленты: реальный импорт TG-BOT (signals.import.json) или mock-fallback.
type SignalSourceInfo =
  | { kind: 'import'; signals: Signal[]; exportedAt?: string; note?: string }
  | { kind: 'mock'; signals: Signal[] };

export default function OutreachEngine() {
  const [tab, setTab] = useState<Tab>('feed');
  // По умолчанию — mock; если найдётся валидный импорт, переключимся на него.
  const [src, setSrc] = useState<SignalSourceInfo>({ kind: 'mock', signals: SIGNALS });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadImportedSignals()
      .then((res) => {
        if (!alive) return;
        if (res) setSrc({ kind: 'import', signals: res.signals, exportedAt: res.exportedAt, note: res.note });
        // res === null → оставляем mock-fallback, заданный в initial state.
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const signals = src.signals;

  return (
    <AppLayout title="AI Outreach Engine">
      <Link
        to="/ai-leads"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft size={14} /> AI-лиды
      </Link>

      <Hero />

      <SourceBanner src={src} loading={loading} />

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

      {tab === 'feed' && <SignalsFeed signals={signals} />}
      {tab === 'fit' && <InvestabilityEngine />}
      {tab === 'drafts' && <OutreachDrafts signals={signals} />}
      {tab === 'followup' && <FollowUpEngine signals={signals} />}
      {tab === 'pipeline' && <ZoomPipeline signals={signals} />}
      {tab === 'learning' && <LearningEngine />}
    </AppLayout>
  );
}

// Индикатор источника ленты: импорт реальных результатов vs mock-fallback.
function SourceBanner({ src, loading }: { src: SignalSourceInfo; loading: boolean }) {
  if (loading) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-[12px] text-muted">
        <Clock size={14} className="text-muted shrink-0" /> Проверяю импорт signals.import.json…
      </div>
    );
  }
  if (src.kind === 'import') {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-ai/30 bg-ai/5 px-3 py-2 text-[12px] text-secondary">
        <span className="inline-flex items-center gap-1.5 text-ai font-medium">
          <Download size={14} /> Импорт TG-BOT + Outreach
        </span>
        <span className="text-muted">{src.signals.length} сигналов из signals.import.json</span>
        {src.exportedAt && <span className="text-faint">· экспорт {new Date(src.exportedAt).toLocaleString('ru-RU')}</span>}
      </div>
    );
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-surface px-3 py-2 text-[12px] text-secondary">
      <span className="inline-flex items-center gap-1.5 text-secondary font-medium">
        <FlaskConical size={14} className="text-info" /> Демо-набор (fallback)
      </span>
      <span className="text-muted">signals.import.json не найден или пуст — показываю синтетику ({src.signals.length})</span>
    </div>
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
              <Radar size={13} /> Signal Engine
            </span>
            <StatusBadge tone="neutral" dot>Демо · синтетика</StatusBadge>
          </div>
          <h2 className="text-xl sm:text-2xl font-semibold text-primary tracking-tight max-w-2xl">
            Не «кому написать», а «почему стоит написать именно сейчас»
          </h2>
          <p className="text-sm text-secondary mt-2 max-w-2xl leading-relaxed">
            Движок анализирует Telegram-чаты, каналы, базу инвесторов, историю диалогов, Zoom и CRM
            и показывает не людей, а <span className="text-primary font-medium">поводы для коммуникации</span>.
            Каждый сигнал отвечает: что произошло, почему важно, чем релевантно проекту, что сделать и какой риск ошибки.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-[12px] text-muted">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-success" /> Агент сам не пишет — отправляете вы</span>
            <span className="inline-flex items-center gap-1.5"><Search size={14} className="text-ai" /> Нет сигнала — нет аутрича</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── 1. Signals Feed (главный экран) ─────────────────────────────────────────
function SignalsFeed({ signals }: { signals: Signal[] }) {
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
        {visible.map((s) => <SignalCard key={s.id} s={s} />)}
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
function SignalCard({ s }: { s: Signal }) {
  return (
    <Card accent={s.confidence === 'high' ? 'ai' : null}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-primary">{s.contactName}</span>
            <StatusBadge tone={contactTypeTone(s.contactType)}>{CONTACT_TYPE_LABEL[s.contactType]}</StatusBadge>
            {s.handle && <span className="text-[11px] text-muted">@{s.handle}</span>}
          </div>
          <div className="mt-1.5 inline-flex items-center gap-2 text-[12px]">
            <span className="px-2 h-6 inline-flex items-center rounded-md bg-ai/10 text-ai font-medium">
              {SIGNAL_TYPE_LABEL[s.signalType]}
            </span>
            <span className="text-faint">·</span>
            <span className="text-muted">{SOURCE_LABEL[s.signalSource]}</span>
          </div>
        </div>
        <StatusBadge tone={confidenceTone(s.confidence)} dot>confidence: {CONFIDENCE_LABEL[s.confidence]}</StatusBadge>
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
        <DraftBlock signalId={s.id} draft={s.draftMessage} handle={s.handle} nextStep={s.nextStep} />
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

function DraftBlock({
  signalId, draft, handle, nextStep,
}: { signalId: string; draft: string; handle?: string; nextStep: string }) {
  const [copied, setCopied] = useState(false);
  const deepLink = chatDeepLink(handle, draft);
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
        <Button variant="ai" size="sm" iconLeft={<ExternalLink size={14} />} disabled title="В демо отправка отключена">
          Открыть чат
        </Button>
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
      <Card accent="zapusk">
        <CardHeader
          title={<span className="inline-flex items-center gap-2"><Target size={15} className="text-zapusk" /> ICP проекта</span>}
          subtitle={`Целевой инвестор проекта «${PROJECT_ICP.projectName}» — база для сравнения`}
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
        Fit — качественная оценка похожести, не точная вероятность. Используем high / medium / low / unknown с объяснением и риском ошибки.
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
function OutreachDrafts({ signals }: { signals: Signal[] }) {
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
          <DraftBlock signalId={s.id} draft={s.draftMessage!} handle={s.handle} nextStep={s.nextStep} />
        </Card>
      ))}
    </div>
  );
}

// ── 4. Follow-Up Engine (мяч на нашей стороне) ──────────────────────────────
function FollowUpEngine({ signals }: { signals: Signal[] }) {
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
          {s.draftMessage && <DraftBlock signalId={s.id} draft={s.draftMessage} handle={s.handle} nextStep={s.nextStep} />}
        </Card>
      ))}
      {items.length === 0 && <Card className="text-center text-sm text-muted py-10">Открытых follow-up нет.</Card>}
    </div>
  );
}

// ── 5. Zoom Pipeline (воронка) ──────────────────────────────────────────────
function ZoomPipeline({ signals }: { signals: Signal[] }) {
  const byStage = (stage: PipelineStage) => signals.filter((s) => s.pipelineStage === stage);
  return (
    <div>
      <div className="text-[12px] text-muted px-1 mb-4">
        Сигнал → Аутрич → Ответ → Zoom назначен → Zoom проведён → Follow-up → Сделка.
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
