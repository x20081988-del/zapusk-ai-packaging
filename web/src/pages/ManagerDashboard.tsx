import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, BriefcaseBusiness, CalendarDays, Clock3, MessageCircle, Radio } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PersonalManagerCard } from '../components/ui/PersonalManagerCard';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';

interface ManagerProject {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  updatedAt: string;
  user: { email: string; name: string | null };
  brief: { missingData: string | null; missingByCategory: string | null; updatedAt: string } | null;
  _count: { files: number; generatedPrompts: number; generatedDocs: number; artefactReviews: number };
}

interface ManagerTask {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  owner: string;
}

interface ManagerDashboardResponse {
  kpis: {
    myProjects: number;
    stuckProjects: number;
    newLeads: number;
    openQuestions: number;
    inactiveProjects: number;
  };
  projects: ManagerProject[];
  tasks: ManagerTask[];
}

export default function ManagerDashboard() {
  const [data, setData] = useState<ManagerDashboardResponse | null>(null);
  const { view } = useParams<{ view?: string }>();

  useEffect(() => {
    api.get<ManagerDashboardResponse>('/api/manager/dashboard').then(setData);
  }, []);

  const title = view === 'leads' ? 'Менеджер · Новые лиды'
    : view === 'meetings' ? 'Менеджер · Встречи'
      : view === 'tasks' ? 'Менеджер · Задачи'
        : view === 'clients' ? 'Менеджер · Клиенты'
          : 'Рабочий стол менеджера';

  return (
    <AppLayout title={title}>
      {!data ? (
        <Card><div className="text-sm text-muted text-center py-8">Загрузка кабинета менеджера…</div></Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
            <Kpi label="Мои проекты" value={data.kpis.myProjects} icon={<BriefcaseBusiness size={15} />} />
            <Kpi label="Где застряли" value={data.kpis.stuckProjects} icon={<AlertTriangle size={15} />} tone="warning" />
            <Kpi label="Новые лиды" value={data.kpis.newLeads} icon={<Radio size={15} />} tone="ai" />
            <Kpi label="Вопросы брифа" value={data.kpis.openQuestions} icon={<MessageCircle size={15} />} tone="zapusk" />
            <Kpi label="Без активности" value={data.kpis.inactiveProjects} icon={<Clock3 size={15} />} tone="warning" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
            <div className="space-y-6">
              <TasksToday tasks={data.tasks} />
              <ProjectsTable projects={data.projects} />
            </div>
            <aside className="space-y-4">
              <PersonalManagerCard compact />
              <Card padded accent="ai">
                <CardHeader title="Что сделать дальше" subtitle="Подсказки менеджеру по текущему pipeline" />
                <div className="space-y-2">
                  <Hint icon={<Radio size={14} />} text="Проверить 7 новых AI-лидов и назначить звонки фаундерам." />
                  <Hint icon={<MessageCircle size={14} />} text="Добрать ответы по незакрытым вопросам брифов." />
                  <Hint icon={<CalendarDays size={14} />} text="Подготовить фаундеров к ближайшим встречам." />
                </div>
              </Card>
            </aside>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function Kpi({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone?: 'ai' | 'zapusk' | 'warning' }) {
  const cls = tone === 'ai' ? 'text-ai-glow border-ai/30 bg-ai/12'
    : tone === 'zapusk' ? 'text-zapusk-400 border-zapusk/30 bg-zapusk/12'
      : tone === 'warning' ? 'text-warning border-warning/30 bg-warning/10'
        : 'text-secondary border-line bg-elevated';
  return (
    <Card padded className="min-h-[106px]">
      <div className={`w-8 h-8 rounded-md border flex items-center justify-center ${cls}`}>{icon}</div>
      <div className="text-2xl font-bold text-primary mt-3 font-num">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.11em] text-muted font-semibold mt-1">{label}</div>
    </Card>
  );
}

function TasksToday({ tasks }: { tasks: ManagerTask[] }) {
  return (
    <Card padded>
      <CardHeader title="Что нужно сделать сегодня" subtitle="Проекты, где клиенту нужна помощь или следующий шаг" />
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <div className="rounded-md border border-success/25 bg-success/8 px-4 py-3 text-sm text-success">Критичных задач нет.</div>
        ) : tasks.map((task) => (
          <div key={task.id} className="rounded-md border border-hairline bg-canvas/45 px-3 py-3 flex flex-col md:flex-row md:items-center gap-3">
            <StatusBadge tone={task.priority === 'high' ? 'danger' : task.priority === 'medium' ? 'warning' : 'neutral'} dot>
              {task.priority === 'high' ? 'срочно' : task.priority === 'medium' ? 'важно' : 'план'}
            </StatusBadge>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-primary">{task.title}</div>
              <div className="text-xs text-muted">{task.projectName} · ответственный: {task.owner}</div>
            </div>
            <Link to={`/projects/${task.projectId}`}><Button size="sm" variant="secondary">Открыть</Button></Link>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProjectsTable({ projects }: { projects: ManagerProject[] }) {
  return (
    <Card padded>
      <CardHeader title="Мои проекты" subtitle="Статусы сопровождения, лиды, материалы и незакрытые вопросы" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[780px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-muted">
              <th className="py-2 pr-4">Проект</th>
              <th className="py-2 pr-4">Клиент</th>
              <th className="py-2 pr-4">Где застрял</th>
              <th className="py-2 pr-4">Лиды</th>
              <th className="py-2 pr-4">Материалы</th>
              <th className="py-2 pr-4">Активность</th>
              <th className="py-2 pr-4">Действия</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="border-t border-hairline hover:bg-surface/40">
                <td className="py-3 pr-4">
                  <Link to={`/projects/${p.id}`} className="font-medium text-primary hover:text-zapusk-400">{p.name}</Link>
                  <div className="text-[11px] text-muted">{p.industry ?? 'отрасль не указана'}</div>
                </td>
                <td className="py-3 pr-4 text-secondary">{p.user.name ?? p.user.email}</td>
                <td className="py-3 pr-4">{p.brief ? <StatusBadge tone="ai">бриф / материалы</StatusBadge> : <StatusBadge tone="warning">бриф</StatusBadge>}</td>
                <td className="py-3 pr-4"><StatusBadge tone="success">{p.brief ? 'есть новые' : 'ждут бриф'}</StatusBadge></td>
                <td className="py-3 pr-4 font-num">{p._count.files + p._count.generatedPrompts}</td>
                <td className="py-3 pr-4 text-xs text-muted">{formatDate(p.updatedAt)}</td>
                <td className="py-3 pr-4">
                  <div className="flex gap-1.5">
                    <Link to={`/projects/${p.id}`}><Button size="sm" variant="ghost">Проект</Button></Link>
                    <Link to="/ai-leads"><Button size="sm" variant="ghost">Лиды</Button></Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Hint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-hairline bg-canvas/45 px-3 py-2 text-sm text-secondary">
      <span className="text-ai-glow mt-0.5">{icon}</span>
      {text}
    </div>
  );
}
