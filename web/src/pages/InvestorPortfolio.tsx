import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BriefcaseBusiness, ChevronRight, Repeat, TrendingUp, UserRound, Wallet } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/ui/StatusBadge';
import { api, type Project } from '../lib/api';
import { formatMoney, formatPercent } from '../lib/format';
import { buildOpportunityView } from '../lib/opportunities';

// Sprint 25 — INVESTOR placeholder. Sprint 62.P10 — /opportunities оживлён:
// читает реальные инвест-витрины (isDemo=true проекты) через /api/projects.
// Бэкенд сам отдаёт демо-инвестору только показательные проекты (where
// { isDemo: true }). Остальные три раздела (/portfolio /secondary /profile)
// остаются заглушками до отдельного investor-спринта.

const SECTIONS: Record<string, { title: string; subtitle: string; icon: React.ReactNode; description: string }> = {
  '/portfolio': {
    title: 'Портфель',
    subtitle: 'Ваши инвестиции на платформе',
    icon: <BriefcaseBusiness size={24} />,
    description: 'Здесь будут видны ваши инвестиционные позиции: суммы, доли, ожидаемая доходность и сценарии выхода. Раздел активируется после первой сделки через платформу.',
  },
  '/secondary': {
    title: 'Вторичный рынок',
    subtitle: 'Перепродажа долей между инвесторами',
    icon: <Repeat size={24} />,
    description: 'Платформа постепенно открывает возможность переуступки долей. Если вы хотите выйти из позиции досрочно — менеджер подберёт покупателя через нашу сеть инвесторов.',
  },
  '/profile': {
    title: 'Профиль инвестора',
    subtitle: 'Ваши данные и предпочтения по инвестициям',
    icon: <UserRound size={24} />,
    description: 'Здесь появятся настройки профиля инвестора: предпочитаемые отрасли, средний чек, горизонт инвестиций, KYC-документы. Сейчас уточняем формат — менеджер свяжется с вами для верификации.',
  },
};

export default function InvestorPortfolio() {
  const location = useLocation();
  if (location.pathname === '/opportunities') return <Opportunities />;

  const section = SECTIONS[location.pathname] ?? SECTIONS['/portfolio'];
  return (
    <AppLayout title={`${section.title} · ZAPUSK AI`}>
      <Card padded>
        <CardHeader title={section.title} subtitle={section.subtitle} />
        <EmptyState
          icon={section.icon}
          title="Раздел в подготовке"
          description={section.description}
          action={
            <a href="mailto:hello@zapusk.tech?subject=Запрос%20по%20разделу%20инвестора">
              <span className="text-sm text-zapusk-400 font-semibold hover:text-zapusk-300">
                Связаться с менеджером
              </span>
            </a>
          }
        />
      </Card>
    </AppLayout>
  );
}

function Opportunities() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ projects: Project[] }>('/api/projects')
      .then((r) => setProjects(r.projects))
      .catch((e) => setError(e instanceof Error ? e.message : 'Не удалось загрузить инвест-возможности'));
  }, []);

  return (
    <AppLayout title="Инвест-возможности · ZAPUSK AI">
      <Card padded className="mb-4">
        <CardHeader
          title="Инвест-возможности"
          subtitle="Открытые раунды на платформе ZAPUSK AI"
          action={projects ? <StatusBadge tone="ai" dot>{projects.length} в подборке</StatusBadge> : undefined}
        />
        <p className="text-sm text-secondary leading-relaxed max-w-3xl">
          Подобранные проекты, упакованные ZAPUSK AI: понятная сделка, финмодель, презентация
          и материалы для инвестора. Откройте карточку, чтобы изучить условия.
        </p>
      </Card>

      {error ? (
        <Card padded>
          <EmptyState
            icon={<TrendingUp size={20} />}
            title="Не удалось загрузить"
            description={error}
          />
        </Card>
      ) : projects === null ? (
        <Card>
          <div className="text-sm text-muted text-center py-8">Загрузка…</div>
        </Card>
      ) : projects.length === 0 ? (
        <Card padded>
          <EmptyState
            icon={<TrendingUp size={20} />}
            title="Раздел в подготовке"
            description="Команда ZAPUSK AI готовит первый поток сделок — мы напишем, как только список будет открыт."
            action={
              <a href="mailto:hello@zapusk.tech?subject=Запрос%20по%20инвест-возможностям">
                <span className="text-sm text-zapusk-400 font-semibold hover:text-zapusk-300">
                  Связаться с менеджером
                </span>
              </a>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p) => (
            <OpportunityCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </AppLayout>
  );
}

function OpportunityCard({ project: p }: { project: Project }) {
  const view = buildOpportunityView(p);
  return (
    <Link to={`/opportunities/${p.id}`} className="block group">
      <Card padded hoverable accent="zapusk" className="h-full flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="text-base font-semibold text-primary leading-tight">{p.name}</h3>
          <StatusBadge tone={view.statusTone} dot>{view.statusLabel}</StatusBadge>
        </div>
        <p className="text-[11px] uppercase tracking-[0.06em] text-zapusk-400 font-semibold mb-2">{view.sector}</p>
        <p className="text-xs text-secondary leading-snug line-clamp-3">{view.shortThesis}</p>

        <div className="flex flex-wrap gap-1 mt-3">
          {view.badges.slice(0, 3).map((b) => (
            <StatusBadge key={b.label} tone={b.tone}>{b.label}</StatusBadge>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <Term icon={<Wallet size={13} />} label="Раунд" value={formatMoney(p.raiseAmount, p.currency)} />
          <Term icon={<TrendingUp size={13} />} label="Доля" value={formatPercent(p.equityOffered)} />
          <Term icon={<Wallet size={13} />} label="Мин. чек" value={formatMoney(p.minCheck, p.currency)} />
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-hairline">
          <span className="text-[11px] text-muted truncate pr-2">{view.payback ? `Окупаемость: ${view.payback}` : 'Инвест-возможность'}</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-zapusk-400 group-hover:text-zapusk-300 shrink-0">
            Подробнее <ChevronRight size={13} />
          </span>
        </div>
      </Card>
    </Link>
  );
}

function Term({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-canvas/45 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-muted font-semibold">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold text-primary mt-0.5 truncate">{value}</div>
    </div>
  );
}
