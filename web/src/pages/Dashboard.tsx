import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Sparkles, TrendingUp, FolderOpen } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { ProjectCard } from '../components/ui/ProjectCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { api, type Project } from '../lib/api';
import { computeProgress } from '../lib/progress';
import { useMode } from '../lib/mode';
import { isLegacyDemoProject } from '../lib/demoMaterials';

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [mode] = useMode();

  useEffect(() => {
    api.get<{ projects: Project[] }>('/api/projects').then((r) => setProjects(r.projects));
  }, []);

  const visibleProjects = projects?.filter((p) => mode === 'team' || !isLegacyDemoProject(p)) ?? null;
  const total = visibleProjects?.length ?? 0;
  const ready = visibleProjects?.filter((p) => p.status === 'ready').length ?? 0;
  const inWork = visibleProjects?.filter((p) => p.status === 'packaging').length ?? 0;

  return (
    <AppLayout
      title="Рабочий стол"
      action={
        <Link to="/projects/new">
          <Button size="md" iconLeft={<Plus size={14} strokeWidth={2.5} />}>
            Новый проект
          </Button>
        </Link>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Проектов всего" value={total} icon={<FolderOpen size={16} />} />
        <StatCard label="В работе" value={inWork} icon={<Sparkles size={16} />} accent="ai" />
        <StatCard label="Готово к показу инвестору" value={ready} icon={<TrendingUp size={16} />} accent="zapusk" />
      </div>

      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold text-primary tracking-tight">Проекты</h2>
        <p className="text-xs text-muted">Каждый проект проходит путь: материалы → бизнес на салфетке → интервью по проекту → материалы для инвестора</p>
        </div>
      </div>

      {projects === null ? (
        <Card>
          <div className="text-sm text-muted text-center py-8">Загрузка…</div>
        </Card>
      ) : visibleProjects?.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Sparkles size={20} />}
            title="Пока нет проектов"
            description="Создайте первый проект, загрузите материалы — и система соберёт «бизнес на салфетке» за минуту."
            action={
              <Link to="/projects/new">
                <Button iconLeft={<Plus size={14} strokeWidth={2.5} />}>Создать проект</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleProjects?.map((p) => (
            <ProjectCard key={p.id} project={p} percent={computeProgress(p).percent} />
          ))}
        </div>
      )}
    </AppLayout>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: 'zapusk' | 'ai';
}) {
  return (
    <Card accent={accent ?? null}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold">{label}</div>
          <div className="text-3xl font-bold text-primary mt-2 font-num tracking-tight">{value}</div>
        </div>
        <div className={`w-9 h-9 rounded-md flex items-center justify-center ${accent === 'ai' ? 'bg-ai/15 text-ai-glow border border-ai/30' : accent === 'zapusk' ? 'bg-zapusk/15 text-zapusk-400 border border-zapusk/30' : 'bg-elevated text-secondary border border-line'}`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}
