import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Sparkles } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { ProjectCard } from '../components/ui/ProjectCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { api, type Project } from '../lib/api';
import { computeProgress } from '../lib/progress';
import { isLegacyDemoProject } from '../lib/demoMaterials';
import { getAuth } from '../lib/auth';

// Sprint 26 — отдельная страница «Мои проекты». Раньше список жил только на
// Dashboard. Теперь Dashboard = overview + bootstrap/CTA, а этот раздел —
// чистый список проектов клиента без вспомогательных блоков.
export default function ProjectsList() {
  const auth = getAuth();
  const role = auth?.role ?? 'FOUNDER';
  const isDemoMode = auth?.workspaceStatus === 'demo';
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    api.get<{ projects: Project[] }>('/api/projects').then((r) => setProjects(r.projects));
  }, []);

  const visible = projects?.filter((p) => role !== 'FOUNDER' || !isLegacyDemoProject(p)) ?? null;

  return (
    <AppLayout
      title={isDemoMode ? 'Демо-проекты' : 'Мои проекты'}
      action={
        !isDemoMode ? (
          <Link to="/projects/new">
            <Button size="md" iconLeft={<Plus size={14} strokeWidth={2.5} />}>
              Новый проект
            </Button>
          </Link>
        ) : undefined
      }
    >
      {visible === null ? (
        <Card>
          <div className="text-sm text-muted text-center py-8">Загрузка…</div>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Sparkles size={20} />}
            title={isDemoMode ? 'Демо-кейсы готовятся' : 'Пока нет проектов'}
            description={
              isDemoMode
                ? 'Команда ZAPUSK AI добавит показательные кейсы в ближайшее время.'
                : 'Создайте первый проект — это займёт меньше минуты.'
            }
            action={
              !isDemoMode ? (
                <Link to="/projects/new">
                  <Button iconLeft={<Plus size={14} strokeWidth={2.5} />}>Создать проект</Button>
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((p) => (
            <ProjectCard key={p.id} project={p} percent={computeProgress(p).percent} />
          ))}
        </div>
      )}
    </AppLayout>
  );
}
