import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight, Headphones, MessageSquare, PhoneCall, Radio, Sparkles, TrendingUp,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ProjectCard } from '../components/ui/ProjectCard';
import { EmptyState } from '../components/ui/EmptyState';
import { PersonalManagerMiniCard } from '../components/ui/PersonalManagerCard';
import { api, type Project } from '../lib/api';
import { computeProgress } from '../lib/progress';

// Sprint 62.P10 — «Демо-кабинет» теперь data-driven: тянет показательные
// проекты (isDemo=true) из /api/projects/showcase вместо захардкоженного
// «Главснаб». Так список демо-кейсов = единый источник правды (seed), а
// карточки ведут в реальную карточку проекта (/projects/:id), которую
// демо-фаундеру открывает бэкенд (where { isDemo: true }).
export default function DemoCabinet() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ projects: Project[] }>('/api/projects/showcase')
      .then((r) => setProjects(r.projects))
      .catch((e) => setError(e instanceof Error ? e.message : 'Не удалось загрузить демо-кейсы'));
  }, []);

  return (
    <AppLayout title="Демо-кабинет · ZAPUSK AI">
      <div className="space-y-6">
        <Card padded className="overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,90,31,0.13),transparent_30%),radial-gradient(circle_at_82%_0%,rgba(124,92,255,0.12),transparent_26%)]" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <StatusBadge tone="success" dot>готовые инвест-кейсы</StatusBadge>
              <StatusBadge tone="ai" dot>AI-лиды активны</StatusBadge>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-primary tracking-tight">Демо-кабинет ZAPUSK AI</h1>
            <p className="text-sm text-secondary mt-3 max-w-3xl leading-relaxed">
              Показательные проекты, упакованные платформой: заполненный бриф, AI-готовая упаковка,
              презентация, финансовая модель, посадочная страница и AI-лиды. Откройте любой кейс,
              чтобы увидеть кабинет так, как его видит фаундер.
            </p>
          </div>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-6">
            <Card padded>
              <CardHeader
                title="Демо-кейсы"
                subtitle="Реальные показательные проекты на платформе"
                action={projects ? <StatusBadge tone="zapusk" dot>{projects.length}</StatusBadge> : undefined}
              />
              {error ? (
                <EmptyState icon={<Sparkles size={20} />} title="Не удалось загрузить" description={error} />
              ) : projects === null ? (
                <div className="text-sm text-muted text-center py-8">Загрузка…</div>
              ) : projects.length === 0 ? (
                <EmptyState
                  icon={<Sparkles size={20} />}
                  title="Демо-кейсы готовятся"
                  description="Команда ZAPUSK AI добавит показательные кейсы в ближайшее время."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {projects.map((p) => (
                    <ProjectCard key={p.id} project={p} percent={computeProgress(p).percent} />
                  ))}
                </div>
              )}
            </Card>

            <Card padded accent="ai">
              <CardHeader
                title="AI-лиды"
                subtitle="В демо-кабинете — превью. Полный feed, записи разговоров и контекст — на странице AI-лидов."
                action={<StatusBadge tone="danger" dot>HOT</StatusBadge>}
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <PreviewStat icon={<Radio size={14} />} label="Активные лиды" value="12" tone="ai" />
                <PreviewStat icon={<PhoneCall size={14} />} label="Звонков за сутки" value="43" tone="zapusk" />
                <PreviewStat icon={<MessageSquare size={14} />} label="Сообщений отправлено" value="128" tone="zapusk" />
              </div>
              <div className="rounded-md border border-ai/25 bg-ai/8 p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-grad-ai text-canvas flex items-center justify-center shadow-ai-glow shrink-0">
                  <Headphones size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-primary">Новый квалифицированный лид · от 1 млн ₽ · 1 месяц</div>
                  <p className="text-xs text-secondary mt-1 leading-relaxed">
                    В разделе AI-лиды можно посмотреть больше примеров, прослушать записи звонков и
                    увидеть контекст коммуникации с каждым инвестором.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Link to="/demo/conversations">
                  <Button variant="secondary" iconRight={<ChevronRight size={14} />}>AI-переговоры</Button>
                </Link>
                <Link to="/demo/ai-leads">
                  <Button variant="ai" iconRight={<ChevronRight size={14} />}>Открыть AI-лиды</Button>
                </Link>
              </div>
            </Card>
          </div>
          <aside className="space-y-4">
            <PersonalManagerMiniCard />
            <Card padded accent="zapusk">
              <CardHeader title="Как читать демо-кабинет" subtitle="Что показывает каждый кейс" />
              <div className="space-y-2 text-sm text-secondary">
                <DealLine icon={<Sparkles size={13} />} text="Бриф и AI-упаковка готовы к показу инвестору" />
                <DealLine icon={<TrendingUp size={13} />} text="Сделка, доля и финмодель — в карточке проекта" />
                <DealLine icon={<Radio size={13} />} text="AI-лиды и записи разговоров — в разделах демо" />
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}

function PreviewStat({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: string; tone: 'ai' | 'zapusk' }) {
  return (
    <div className={`rounded-md border ${tone === 'ai' ? 'border-ai/25 bg-ai/8' : 'border-zapusk/25 bg-zapusk/8'} px-3 py-3`}>
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] font-semibold ${tone === 'ai' ? 'text-ai-glow' : 'text-zapusk-400'}`}>
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold text-primary font-num mt-1">{value}</div>
    </div>
  );
}

function DealLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-hairline bg-canvas/45 px-3 py-2">
      <span className="text-zapusk-400 mt-0.5 shrink-0">{icon}</span>
      <span className="text-xs text-primary">{text}</span>
    </div>
  );
}
