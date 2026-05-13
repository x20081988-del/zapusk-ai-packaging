import { CheckCircle2, Clock3, Lock, PlayCircle } from 'lucide-react';
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

export function ProjectJourney({ stages, compact }: { stages: JourneyStage[]; compact?: boolean }) {
  return (
    <Card padded>
      <CardHeader
        title="Путь проекта по платформе"
        subtitle="От брифа и упаковки до сделок, закрытия раунда и работы с акционерами"
      />
      <div className={compact ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'space-y-3'}>
        {stages.map((stage, index) => (
          <div key={stage.id} className="rounded-md border border-hairline bg-canvas/45 p-3">
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${iconShell(stage.status)}`}>
                {iconFor(stage.status)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-muted font-num">#{index + 1}</span>
                  <h3 className="text-sm font-semibold text-primary">{stage.title}</h3>
                  <StatusBadge tone={STATUS_TONE[stage.status]} dot>{STATUS_LABEL[stage.status]}</StatusBadge>
                </div>
                <p className="text-xs text-secondary leading-relaxed mt-1">{stage.description}</p>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mt-3 text-[11px]">
                  <Meta label="Ответственный" value={stage.owner} />
                  <Meta label="Дальше" value={stage.requirement} span />
                </div>
              </div>
              <Button size="sm" variant={stage.status === 'locked' ? 'ghost' : 'secondary'} disabled={stage.status === 'locked'}>
                {stage.cta}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Meta({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={`rounded-md border border-hairline bg-surface px-3 py-2 ${span ? 'lg:col-span-2' : ''}`}>
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold">{label}</div>
      <div className="text-xs text-primary mt-0.5 leading-snug">{value}</div>
    </div>
  );
}

function iconFor(status: JourneyStatus) {
  if (status === 'done') return <CheckCircle2 size={15} />;
  if (status === 'in_progress') return <PlayCircle size={15} />;
  if (status === 'available') return <Clock3 size={15} />;
  return <Lock size={14} />;
}

function iconShell(status: JourneyStatus): string {
  if (status === 'done') return 'border-success/35 bg-success/10 text-success';
  if (status === 'in_progress') return 'border-ai/35 bg-ai/10 text-ai-glow';
  if (status === 'available') return 'border-info/35 bg-info/10 text-info';
  return 'border-line bg-elevated text-muted';
}
