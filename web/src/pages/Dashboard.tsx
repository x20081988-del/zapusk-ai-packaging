import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Sparkles, TrendingUp, FolderOpen, Radio, PhoneCall, MessageSquare, UserCheck, ShieldCheck } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { ProjectCard } from '../components/ui/ProjectCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PersonalManagerMiniCard } from '../components/ui/PersonalManagerCard';
import { BootstrapWelcome } from '../components/ui/BootstrapWelcome';
import { api, type Project } from '../lib/api';
import { computeProgress } from '../lib/progress';
import { isLegacyDemoProject } from '../lib/demoMaterials';
import { getAuth } from '../lib/auth';

export default function Dashboard() {
  const auth = getAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const role = auth?.role ?? 'FOUNDER';
  // Sprint 24: demo workspace = отдельная демо-витрина. Backend уже фильтрует
  // /api/projects по isDemo для demo пользователей; фронт меняет тексты и
  // скрывает «Новый проект» CTA.
  const isDemoMode = auth?.workspaceStatus === 'demo';
  const isActiveWorkspace = auth?.workspaceStatus === 'active';

  useEffect(() => {
    api.get<{ projects: Project[] }>('/api/projects').then((r) => setProjects(r.projects));
  }, []);

  const visibleProjects = projects?.filter((p) => role !== 'FOUNDER' || !isLegacyDemoProject(p)) ?? null;
  const total = visibleProjects?.length ?? 0;
  const ready = visibleProjects?.filter((p) => p.status === 'ready').length ?? 0;
  const inWork = visibleProjects?.filter((p) => p.status === 'packaging').length ?? 0;

  // Sprint 26 — bootstrap state. Активный кабинет без проектов = новый клиент,
  // только что оплативший доступ. Показываем приветствие + большой CTA, а не
  // fake AI-лиды и fake progress. Demo workspace отдельная ветка ниже.
  const isBootstrap = isActiveWorkspace && role === 'FOUNDER' && projects !== null && visibleProjects?.length === 0;

  if (isBootstrap) {
    return (
      <AppLayout title="Рабочий стол">
        <BootstrapWelcome userName={auth?.name} />
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title={isDemoMode ? 'Демо-кабинет ZAPUSK AI' : 'Рабочий стол'}
      action={
        // Sprint 24: «Новый проект» виден только в активном кабинете. Demo —
        // только просмотр, никаких CTA на создание.
        !isDemoMode ? (
          <Link to="/projects/new">
            <Button size="md" iconLeft={<Plus size={14} strokeWidth={2.5} />}>
              Новый проект
            </Button>
          </Link>
        ) : (
          <a href="mailto:hello@zapusk.tech?subject=Получить%20рабочий%20кабинет%20ZAPUSK%20AI">
            <Button size="md" variant="primary">
              Получить рабочий доступ
            </Button>
          </a>
        )
      }
    >
      {/* Sprint 24: demo-объяснялка. Показывается только в demo-кабинете. */}
      {isDemoMode && (
        <Card padded accent="zapusk" className="mb-6 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(196,148,58,0.14),transparent_30%)]" />
          <div className="relative flex flex-col md:flex-row md:items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-zapusk/15 border border-zapusk/30 text-zapusk-400 flex items-center justify-center shrink-0">
              <Sparkles size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-zapusk-400 font-semibold mb-1">
                Демо-кабинет ZAPUSK AI
              </div>
              <h2 className="text-base font-semibold text-primary">
                Посмотрите, как выглядит путь привлечения инвестиций внутри платформы
              </h2>
              <p className="text-xs text-secondary mt-1 leading-relaxed max-w-2xl">
                Это глобальные демо-кейсы реальных проектов. После подключения откроется ваш
                рабочий кабинет — пустой, под ваши проекты, с активной упаковкой, AI-лидами и
                сопровождением сделки.
              </p>
            </div>
            <a href="mailto:hello@zapusk.tech?subject=Активировать%20рабочий%20кабинет%20ZAPUSK%20AI" className="shrink-0">
              <Button variant="primary" size="md">Получить рабочий доступ</Button>
            </a>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label={isDemoMode ? 'Демо-проектов' : 'Проектов всего'} value={total} icon={<FolderOpen size={16} />} />
        <StatCard label="В работе" value={inWork} icon={<Sparkles size={16} />} accent="ai" />
        <StatCard label="Готово к показу инвестору" value={ready} icon={<TrendingUp size={16} />} accent="zapusk" />
      </div>

      {/* Sprint 20: AEO / AI-search positioning баннер. Объясняет на главной
          странице, что упаковка проекта собирается под AI search engines —
          собственная инфраструктура ZAPUSK AI, без vendor names.
          Sprint 24: оставляем только в активном кабинете — в demo-режиме
          уже есть свой demo-баннер. */}
      {!isDemoMode && (
        <Card padded accent="ai" className="mb-6 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(35,214,176,0.12),transparent_30%),radial-gradient(circle_at_88%_0%,rgba(196,148,58,0.10),transparent_28%)]" />
          <div className="relative flex flex-col md:flex-row md:items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-grad-ai/15 border border-ai/30 text-ai-glow flex items-center justify-center shrink-0">
              <Sparkles size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-ai-glow font-semibold mb-1">
                AI Search Ready · собственная инфраструктура
              </div>
              <h2 className="text-base font-semibold text-primary">AI-ready упаковка проекта</h2>
              <p className="text-xs text-secondary mt-1 leading-relaxed max-w-2xl">
                Лендинги, презентации и one-pager'ы собираются с semantic structure и AEO-слоем — их
                видят и могут процитировать ChatGPT, Claude, Perplexity и другие AI answer engines.
                Каждый проект получает собственный AI Discoverability Score.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Sprint 14: «Проекты» сразу под KPI — пользователь должен видеть свои
          проекты, а не искать их ниже AI-плашки. */}
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold text-primary tracking-tight">
            {isDemoMode ? 'Демо-проекты' : 'Проекты'}
          </h2>
          <p className="text-xs text-muted">
            {isDemoMode
              ? 'Реальные кейсы, упакованные через ZAPUSK AI. Откройте проект, чтобы посмотреть путь привлечения изнутри.'
              : 'Каждый проект проходит путь: материалы → бизнес на салфетке → интервью по проекту → материалы для инвестора'}
          </p>
        </div>
      </div>

      {projects === null ? (
        <Card className="mb-6">
          <div className="text-sm text-muted text-center py-8">Загрузка…</div>
        </Card>
      ) : visibleProjects?.length === 0 ? (
        <Card className="mb-6">
          {isDemoMode ? (
            <EmptyState
              icon={<Sparkles size={20} />}
              title="Демо-кейсы готовятся"
              description="Команда ZAPUSK AI добавит показательные проекты в ближайшее время. Свяжитесь с менеджером для активации рабочего кабинета."
              action={
                <a href="mailto:hello@zapusk.tech?subject=Активация%20кабинета%20ZAPUSK%20AI">
                  <Button>Обсудить подключение</Button>
                </a>
              }
            />
          ) : (
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
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
          {visibleProjects?.map((p) => (
            <ProjectCard key={p.id} project={p} percent={computeProgress(p).percent} />
          ))}
        </div>
      )}

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
            {/* Sprint 27 — убрали фиктивный «12 квалифицированных лидов в
                demo-feed»: для active кабинета без запущенных лидов это
                вводило в заблуждение. Теперь — нейтральный CTA в /ai-leads. */}
            <div className="rounded-lg border border-ai/25 bg-canvas/55 p-4">
              <div className="flex flex-col gap-2">
                <div className="text-[10px] uppercase tracking-[0.12em] text-ai-glow font-semibold">AI-лидогенерация</div>
                <p className="text-xs text-secondary leading-relaxed">
                  AI-каналы запускаются после готовности упаковки. Откройте раздел,
                  чтобы увидеть статус и следующий шаг.
                </p>
                <Button variant="ai" iconLeft={<Sparkles size={14} />} className="self-start mt-1">
                  Открыть AI-лиды
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </Link>

      {/* Sprint 14: compactMini менеджер не занимает пол-экрана. Под ним —
          ссылка в демо-кабинет. Sprint 26 — убрали global ProjectJourney
          (это project-specific, живёт на cockpit'е каждого проекта). */}
      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6 mb-6">
        <PersonalManagerMiniCard />
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
      </div>
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
