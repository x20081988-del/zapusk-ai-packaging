import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Briefcase, Sparkles } from 'lucide-react';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';
import { Button } from './Button';
import { formatMoney, formatPercent, STAGE_LABELS } from '../../lib/format';
import { getBriefStatus, briefStatusTone } from '../../lib/briefStatus';
import type { Project } from '../../lib/api';

// Sprint 14: ProjectCard теперь показывает статус брифа + CTA, который ведёт
// прямо в нужное место (бриф этого проекта, не на «New Project»).
export function ProjectCard({ project, percent }: { project: Project; percent: number }) {
  const navigate = useNavigate();
  const brief = getBriefStatus(project);

  function goToBrief(e: React.MouseEvent) {
    // Не даём родительскому Link провалиться в /projects/:id, ведём прямо в бриф.
    e.preventDefault();
    e.stopPropagation();
    navigate(`/projects/${project.id}/brief`);
  }

  return (
    <Link to={`/projects/${project.id}`} className="block group">
      <Card hoverable accent={percent > 0 ? 'zapusk' : null}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Briefcase size={14} className="text-muted" />
              <span className="text-[11px] uppercase tracking-[0.1em] text-muted">{project.industry ?? 'Без отрасли'}</span>
            </div>
            <h3 className="text-base font-semibold text-primary truncate group-hover:text-zapusk-400 transition-colors">
              {project.name}
            </h3>
          </div>
          <ArrowUpRight size={16} className="text-muted group-hover:text-zapusk-400 transition-colors flex-shrink-0" />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <Metric label="Привлекает" value={formatMoney(project.raiseAmount, project.currency)} />
          <Metric label="Доля" value={formatPercent(project.equityOffered)} />
          <Metric label="Стадия" value={STAGE_LABELS[project.stage ?? ''] ?? '—'} />
          <Metric label="Min чек" value={formatMoney(project.minCheck, project.currency)} />
        </div>

        <div className="space-y-2">
          <ProgressBar value={percent} showLabel />
        </div>

        {/* Sprint 14: brief status + quick CTA. Каждый проект показывает свой
            статус — фаундер сразу видит, где AI ждёт briefing. */}
        <div className="mt-4 pt-4 border-t border-hairline space-y-3">
          <div className="flex items-center justify-between gap-2">
            <StatusBadge tone={briefStatusTone(brief.state)} dot>{brief.label}</StatusBadge>
            {brief.state !== 'not_started' && (
              <span className="text-[11px] text-muted">{brief.completion}%</span>
            )}
          </div>
          {brief.state !== 'not_started' && brief.completion < 100 && (
            <ProgressBar value={brief.completion} />
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted">
              {(project.files?.length ?? 0)} файлов
            </span>
            <Button
              size="sm"
              variant={brief.state === 'ready' ? 'secondary' : 'ai'}
              iconLeft={<Sparkles size={12} />}
              onClick={goToBrief}
            >
              {brief.cta}
            </Button>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted mb-0.5">{label}</div>
      <div className="text-[13px] font-semibold text-primary font-num truncate">{value}</div>
    </div>
  );
}
