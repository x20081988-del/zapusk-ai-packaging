import { useMemo, useState } from 'react';
import {
  Activity, AlertCircle, CheckCircle2, ChevronDown, Clock3, Compass, Lock,
  Sparkles, Wand2, UserRound, Briefcase, Megaphone,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { ProgressBar } from '../ui/ProgressBar';
import {
  buildInvestmentJourney, computeJourneyMetrics, whatTeamMustDo, whatsHappeningNow,
  STATUS_LABEL, STATUS_TONE, HANDOVER_LABEL, HANDOVER_TONE,
  type Stage, type StageItem, type TrackBuild,
} from '../../lib/investmentTrack';
import type { PackagingJob, Project } from '../../lib/api';

// Sprint 21 — главный блок проекта. «Путь привлечения инвестиций».
//
// Заголовок: общая готовность проекта + KPI (в работе / ждём от команды /
// плановая дата). Каждый этап — раскрывающаяся карточка со списком пунктов.
// У каждого пункта свой handover-бейдж (кто делает / проверяет) и статус.
//
// Дополнительно справа от основной колонки рендерятся:
//   • «Что требуется от команды проекта»
//   • «Что происходит сейчас»
//
// Это не CRM и не админка — это операционная система привлечения инвестиций.

interface Props {
  project: Project;
  jobs: PackagingJob[];
  /** Если фаундер ещё не выбрал трек — родитель открывает TrackPicker. */
  onChooseTrack?: () => void;
}

const STAGE_ICON: Record<string, LucideIcon> = {
  legal: Briefcase,
  packaging: Sparkles,
  investor_prep: UserRound,
  investor_gen: Megaphone,
  placement: CheckCircle2,
};

export function InvestmentJourney({ project, jobs, onChooseTrack }: Props) {
  const build = useMemo(() => buildInvestmentJourney(project, jobs), [project, jobs]);
  const metrics = useMemo(() => computeJourneyMetrics(build), [build]);
  const required = useMemo(() => whatTeamMustDo(build), [build]);
  const happening = useMemo(() => whatsHappeningNow(build), [build]);

  const trackChosen = Boolean(project.investmentTrack);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
      {/* Левая колонка — заголовок + этапы */}
      <div className="space-y-4">
        <JourneyHeader build={build} metrics={metrics} trackChosen={trackChosen} onChooseTrack={onChooseTrack} />
        {build.stages.map((stage) => (
          <StageCard key={stage.id} stage={stage} />
        ))}
      </div>

      {/* Правая колонка — что требуется + что происходит */}
      <aside className="space-y-4">
        <WhatRequiredBlock items={required} />
        <WhatsHappeningBlock items={happening} />
      </aside>
    </div>
  );
}

function JourneyHeader({
  build, metrics, trackChosen, onChooseTrack,
}: {
  build: TrackBuild;
  metrics: ReturnType<typeof computeJourneyMetrics>;
  trackChosen: boolean;
  onChooseTrack?: () => void;
}) {
  const readinessTone = metrics.readiness >= 75 ? 'success' : metrics.readiness >= 40 ? 'ai' : 'warning';
  return (
    <Card padded accent="zapusk" className="overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(196,148,58,0.12),transparent_30%),radial-gradient(circle_at_88%_0%,rgba(35,214,176,0.10),transparent_28%)]" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Compass size={14} className="text-zapusk-400" />
            <span className="text-[11px] uppercase tracking-[0.14em] text-zapusk-400 font-semibold">
              Путь привлечения инвестиций
            </span>
            <StatusBadge tone="zapusk" dot>{build.trackLabel}</StatusBadge>
          </div>
          {onChooseTrack && (
            <Button size="sm" variant="ghost" iconLeft={<Wand2 size={12} />} onClick={onChooseTrack}>
              {trackChosen ? 'Сменить формат' : 'Выбрать формат'}
            </Button>
          )}
        </div>

        <h2 className="text-2xl font-bold text-primary tracking-tight">
          Проект готов к привлечению инвестиций на{' '}
          <span className={readinessTone === 'success' ? 'text-success' : readinessTone === 'ai' ? 'text-ai-glow' : 'text-zapusk-400'}>
            {metrics.readiness}%
          </span>
        </h2>
        <p className="text-xs text-secondary mt-1.5 leading-relaxed">{build.trackHint}</p>

        <div className="mt-4">
          <ProgressBar value={metrics.readiness} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
          <Kpi label="В работе" value={metrics.inProgressItems} tone="ai" />
          <Kpi label="Ждём от команды" value={metrics.needsActionItems} tone="warning" />
          <Kpi label="Готово" value={metrics.doneItems} tone="success" />
        </div>
      </div>
    </Card>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: 'ai' | 'warning' | 'success' }) {
  const cls = tone === 'ai' ? 'border-ai/30 bg-ai/8 text-ai-glow'
    : tone === 'warning' ? 'border-warning/30 bg-warning/8 text-warning'
    : 'border-success/30 bg-success/8 text-success';
  return (
    <div className={`rounded-md border ${cls} px-3 py-2`}>
      <div className="text-xl font-bold font-num leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.1em] mt-1 font-semibold">{label}</div>
    </div>
  );
}

function StageCard({ stage }: { stage: Stage }) {
  const [open, setOpen] = useState(true);
  const Icon = STAGE_ICON[stage.id] ?? Sparkles;
  const done = stage.items.filter((i) => i.status === 'готово').length;
  const total = stage.items.length;
  const stagePct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <Card padded>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 text-left"
      >
        <div className="w-10 h-10 rounded-md border border-line bg-elevated text-secondary flex items-center justify-center shrink-0">
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-primary">{stage.title}</h3>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted font-num">{done} из {total}</span>
              <ChevronDown size={14} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
            </div>
          </div>
          <p className="text-xs text-muted mt-0.5 leading-snug">{stage.subtitle}</p>
          <div className="mt-2">
            <ProgressBar value={stagePct} />
          </div>
        </div>
      </button>

      {open && (
        <ul className="mt-4 space-y-2 pl-1">
          {stage.items.map((item) => <StageItemRow key={item.id} item={item} />)}
        </ul>
      )}
    </Card>
  );
}

function StageItemRow({ item }: { item: StageItem }) {
  return (
    <li className="flex items-start gap-3 rounded-md border border-hairline bg-canvas/40 px-3 py-2.5">
      <StatusDot status={item.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-primary">{item.title}</span>
          <StatusBadge tone={STATUS_TONE[item.status]} dot>{STATUS_LABEL[item.status]}</StatusBadge>
          <StatusBadge tone={HANDOVER_TONE[item.by]}>{HANDOVER_LABEL[item.by]}</StatusBadge>
        </div>
        {item.hint && <p className="text-[11px] text-muted mt-0.5 leading-snug">{item.hint}</p>}
      </div>
    </li>
  );
}

function StatusDot({ status }: { status: StageItem['status'] }) {
  if (status === 'готово') {
    return <CheckCircle2 size={14} className="text-success mt-0.5 shrink-0" />;
  }
  if (status === 'заблокировано') {
    return <Lock size={14} className="text-danger mt-0.5 shrink-0" />;
  }
  if (status === 'на_проверке' || status === 'в_работе') {
    return <Activity size={14} className="text-ai-glow mt-0.5 shrink-0" />;
  }
  if (status === 'ожидает_информацию') {
    return <AlertCircle size={14} className="text-warning mt-0.5 shrink-0" />;
  }
  return <Clock3 size={14} className="text-muted mt-0.5 shrink-0" />;
}

// ─── Sidebar blocks ───────────────────────────────────────────────────────

function WhatRequiredBlock({ items }: { items: StageItem[] }) {
  return (
    <Card padded className="border-warning/30">
      <CardHeader
        title="Что требуется от вас"
        subtitle="Без этого следующие этапы не запускаются"
      />
      {items.length === 0 ? (
        <div className="rounded-md border border-success/25 bg-success/8 px-3 py-3 flex items-start gap-2">
          <CheckCircle2 size={14} className="text-success mt-0.5 shrink-0" />
          <span className="text-xs text-success">Сейчас от команды проекта ничего не требуется. Все этапы движутся.</span>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning/6 px-3 py-2">
              <AlertCircle size={13} className="text-warning mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium text-primary leading-snug">{item.title}</div>
                {item.hint && <div className="text-[11px] text-muted mt-0.5">{item.hint}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function WhatsHappeningBlock({ items }: { items: StageItem[] }) {
  return (
    <Card padded accent="ai">
      <CardHeader
        title="Что происходит сейчас"
        subtitle="Активные этапы — AI собирает, специалисты проверяют"
      />
      {items.length === 0 ? (
        <p className="text-xs text-muted">Активных этапов пока нет. Выберите формат привлечения, чтобы запустить процесс.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2 rounded-md border border-ai/25 bg-ai/6 px-3 py-2">
              <Activity size={13} className="text-ai-glow mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-medium text-primary leading-snug">{item.title}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <StatusBadge tone={STATUS_TONE[item.status]} dot>{STATUS_LABEL[item.status]}</StatusBadge>
                  <StatusBadge tone={HANDOVER_TONE[item.by]}>{HANDOVER_LABEL[item.by]}</StatusBadge>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
