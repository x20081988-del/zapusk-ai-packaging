import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Sparkles, TrendingUp, FolderOpen, Radio, PhoneCall, MessageSquare, UserCheck, ShieldCheck } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { ProjectCard } from '../components/ui/ProjectCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PersonalManagerCard } from '../components/ui/PersonalManagerCard';
import { ProjectJourney } from '../components/ui/ProjectJourney';
import { api, type Project } from '../lib/api';
import { computeProgress } from '../lib/progress';
import { isLegacyDemoProject } from '../lib/demoMaterials';
import { DEFAULT_PROJECT_JOURNEY } from '../lib/projectJourney';
import { getAuth } from '../lib/auth';

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const role = getAuth()?.role ?? 'client';

  useEffect(() => {
    api.get<{ projects: Project[] }>('/api/projects').then((r) => setProjects(r.projects));
  }, []);

  const visibleProjects = projects?.filter((p) => role !== 'client' || !isLegacyDemoProject(p)) ?? null;
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

      <Link to="/ai-leads" className="block mb-6">
        <Card hoverable accent="ai" className="overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(35,214,176,0.14),transparent_28%),radial-gradient(circle_at_88%_0%,rgba(196,148,58,0.12),transparent_24%)]" />
          <div className="relative grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-ai-glow font-semibold mb-2">
                <Radio size={13} /> Новый раздел
              </div>
              <h2 className="text-2xl font-bold text-primary tracking-tight">
                AI привлекает инвесторов за вас
              </h2>
              <p className="text-sm text-secondary mt-2 max-w-2xl leading-relaxed">
                Получайте горячих инвесторов с чеком от 500 000 ₽ ежедневно: AI звонит, ведёт переписки, квалифицирует интерес и передаёт лиды с контекстом общения.
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                <MiniPill icon={<PhoneCall size={12} />} label="AI-прозвон" />
                <MiniPill icon={<MessageSquare size={12} />} label="AI-переписки" />
                <MiniPill icon={<UserCheck size={12} />} label="Горячие лиды" />
                <MiniPill icon={<ShieldCheck size={12} />} label="Замена нецелевых" />
              </div>
            </div>
            <div className="rounded-lg border border-ai/25 bg-canvas/55 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold">Live pipeline</div>
                  <div className="text-3xl font-bold text-primary font-num mt-1">12</div>
                  <div className="text-xs text-muted">квалифицированных лидов в demo-feed</div>
                </div>
                <Button variant="ai" iconLeft={<Sparkles size={14} />}>Запустить AI-лиды</Button>
              </div>
            </div>
          </div>
        </Card>
      </Link>

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6 mb-6">
        <PersonalManagerCard compact />
        <div className="space-y-6">
          <Link to="/demo" className="block">
            <Card hoverable accent="zapusk">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-zapusk-400 font-semibold">Демо-кабинет</div>
                  <h2 className="text-lg font-semibold text-primary mt-1">Посмотреть, как выглядит готовый проект</h2>
                  <p className="text-sm text-secondary mt-1">Главснаб: бриф, материалы, AI-лиды, запись разговора и путь сделки.</p>
                </div>
                <Button variant="secondary">Открыть демо</Button>
              </div>
            </Card>
          </Link>
          <ProjectJourney stages={DEFAULT_PROJECT_JOURNEY.slice(0, 5)} compact />
        </div>
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

function MiniPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas/60 px-3 h-7 text-xs text-secondary">
      <span className="text-ai-glow">{icon}</span>
      {label}
    </span>
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
