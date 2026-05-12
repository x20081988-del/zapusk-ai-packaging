import { Link } from 'react-router-dom';
import { ArrowUpRight, Briefcase } from 'lucide-react';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';
import { formatMoney, formatPercent, STAGE_LABELS } from '../../lib/format';
import type { Project } from '../../lib/api';

export function ProjectCard({ project, percent }: { project: Project; percent: number }) {
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

        <div className="mt-4 pt-4 border-t border-hairline flex items-center justify-between">
          <StatusBadge tone={project.status === 'ready' ? 'success' : percent > 0 ? 'zapusk' : 'neutral'} dot>
            {project.status === 'ready' ? 'Готов' : percent > 0 ? 'Материалы' : 'Черновик'}
          </StatusBadge>
          <span className="text-[11px] text-muted">
            {(project.files?.length ?? 0)} файлов
          </span>
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
