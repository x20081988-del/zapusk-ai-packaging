import { CheckCircle2, Clock3, Lock, Loader2, ArrowRight } from 'lucide-react';
import { Card, CardHeader } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import type { JourneyStage, JourneyStatus } from '../../lib/projectJourney';

const STATUS_LABEL: Record<JourneyStatus, string> = {
  locked: 'Закрыт',
  available: 'Доступен',
  in_progress: 'В работе',
  done: 'Готово',
};

const STATUS_TONE: Record<JourneyStatus, 'neutral' | 'info' | 'ai' | 'success'> = {
  locked: 'neutral',
  available: 'info',
  in_progress: 'ai',
  done: 'success',
};

// Operating-workflow look: каждый этап — карточка с чётким номером, статусом,
// 1-строчным описанием и одной кнопкой действия. Никаких длинных абзацев.
export function ProjectJourney({ stages, compact }: { stages: JourneyStage[]; compact?: boolean }) {
  return (
    <Card padded>
      <CardHeader
        title="Путь проекта по платформе"
        subtitle="На каком этапе сейчас проект и что нужно сделать дальше"
      />
      <div className={compact ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'}>
        {stages.map((stage, index) => (
          <StageCard key={stage.id} stage={stage} index={index + 1} />
        ))}
      </div>
    </Card>
  );
}

function StageCard({ stage, index }: { stage: JourneyStage; index: number }) {
  const isLocked = stage.status === 'locked';
  const isDone = stage.status === 'done';
  return (
    <div className={`group rounded-lg border p-4 transition-all ${shellClass(stage.status)}`}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${iconShell(stage.status)}`}>
          {iconFor(stage.status)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-muted font-num font-semibold">ЭТАП {index}</span>
            <StatusBadge tone={STATUS_TONE[stage.status]} dot>{STATUS_LABEL[stage.status]}</StatusBadge>
          </div>
          <h3 className="text-sm font-semibold text-primary leading-snug">{stage.title}</h3>
        </div>
      </div>

      <p className="text-xs text-secondary leading-relaxed mb-3 min-h-[2.5rem]">{stage.description}</p>

      <div className="flex items-center gap-2 text-[11px] text-muted mb-3">
        <span className="rounded-full bg-canvas/60 border border-hairline px-2 py-0.5">{stage.owner}</span>
        {!isDone && !isLocked && (
          <span className="flex items-center gap-1 text-primary">
            <ArrowRight size={11} className="text-zapusk-400" />
            <span className="font-medium">{stage.nextAction}</span>
          </span>
        )}
      </div>

      <Button
        size="sm"
        variant={isDone ? 'ghost' : isLocked ? 'ghost' : 'secondary'}
        disabled={isLocked}
        className="w-full"
      >
        {stage.cta}
      </Button>
    </div>
  );
}

function shellClass(status: JourneyStatus): string {
  if (status === 'done') return 'border-success/25 bg-success/4 hover:border-success/45';
  if (status === 'in_progress') return 'border-ai/30 bg-ai/4 hover:border-ai/50';
  if (status === 'available') return 'border-info/25 bg-canvas/40 hover:border-info/45';
  return 'border-hairline bg-canvas/30 opacity-70';
}

function iconFor(status: JourneyStatus) {
  if (status === 'done') return <CheckCircle2 size={16} />;
  if (status === 'in_progress') return <Loader2 size={16} className="animate-spin" />;
  if (status === 'available') return <Clock3 size={16} />;
  return <Lock size={14} />;
}

function iconShell(status: JourneyStatus): string {
  if (status === 'done') return 'border-success/35 bg-success/10 text-success';
  if (status === 'in_progress') return 'border-ai/35 bg-ai/10 text-ai-glow';
  if (status === 'available') return 'border-info/35 bg-info/10 text-info';
  return 'border-line bg-elevated text-muted';
}
