import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { ProjectCard } from '../components/ui/ProjectCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmModal } from '../components/ui/ConfirmModal';
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
  const [projectToArchive, setProjectToArchive] = useState<Project | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ projects: Project[] }>('/api/projects').then((r) => setProjects(r.projects));
  }, []);

  const visible = projects?.filter((p) => role !== 'FOUNDER' || !isLegacyDemoProject(p)) ?? null;

  async function archiveProject() {
    if (!projectToArchive) return;
    setArchiving(true);
    setError(null);
    try {
      await api.delete(`/api/projects/${projectToArchive.id}`);
      setProjects((current) => current?.filter((p) => p.id !== projectToArchive.id) ?? current);
      setProjectToArchive(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить проект');
    } finally {
      setArchiving(false);
    }
  }

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
        <>
          {error && (
            <Card padded className="mb-4">
              <div className="text-xs text-warning">{error}</div>
            </Card>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visible.map((p) => (
              <div key={p.id} className="relative">
                <ProjectCard project={p} percent={computeProgress(p).percent} />
                {!isDemoMode && (
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    iconLeft={<Trash2 size={12} />}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setProjectToArchive(p);
                    }}
                    className="absolute right-3 top-3 opacity-95 shadow-lifted"
                    title="Удалить проект"
                  >
                    Удалить
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <ConfirmModal
        open={Boolean(projectToArchive)}
        title="Удалить проект?"
        description={
          <>
            Данные проекта «{projectToArchive?.name}» будут скрыты из списка проектов. Это архивирование, а не физическое удаление.
          </>
        }
        confirmLabel="Удалить проект"
        loading={archiving}
        onClose={() => setProjectToArchive(null)}
        onConfirm={archiveProject}
      />
    </AppLayout>
  );
}
