import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BriefcaseBusiness, Check, ChevronRight, Repeat, ShieldCheck, Sparkles, TrendingUp, UserRound } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/ui/StatusBadge';
import { OpportunityCoverArt } from '../components/ui/OpportunityCoverArt';
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
      {/* ── Premium intro / hero ── */}
      <div className="relative overflow-hidden rounded-2xl border border-hairline bg-grad-ink shadow-card mb-5">
        <div className="absolute inset-0 bg-dot-grid opacity-60 pointer-events-none" />
        <div
          className="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-25 pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgb(var(--color-ai)) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-28 -left-16 w-72 h-72 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgb(var(--color-zapusk)) 0%, transparent 70%)' }}
        />
        <div className="relative px-6 py-7 sm:px-8 sm:py-9">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ai/30 bg-ai/10 px-2.5 py-1 text-[11px] font-semibold text-ai-glow">
              <Sparkles size={12} /> Краудинвестинг ZAPUSK AI
            </span>
            {projects && (
              <StatusBadge tone="success" dot>{projects.length} {pluralDeals(projects.length)}</StatusBadge>
            )}
          </div>
          <h1 className="text-2xl sm:text-[28px] font-bold text-primary leading-tight max-w-2xl">
            Инвестируйте в проверенные проекты
          </h1>
          <p className="text-sm text-secondary leading-relaxed max-w-2xl mt-2">
            Каждая сделка упакована и проверена ZAPUSK AI: понятная экономика, финмодель,
            презентация и data room. Выберите проект, изучите условия и оставьте заявку — это
            ни к чему не обязывает.
          </p>
          <div className="flex flex-wrap gap-4 mt-5">
            <Trust icon={<ShieldCheck size={14} />} label="Проверено ZAPUSK AI" />
            <Trust icon={<Check size={14} />} label="Сделка через платформу" />
            <Trust icon={<TrendingUp size={14} />} label="Открытые материалы и data room" />
          </div>
        </div>
      </div>

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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {projects.map((p) => (
            <OpportunityCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </AppLayout>
  );
}

function pluralDeals(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'сделка в подборке';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'сделки в подборке';
  return 'сделок в подборке';
}

function Trust({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-secondary">
      <span className="text-success">{icon}</span>
      {label}
    </span>
  );
}

function OpportunityCard({ project: p }: { project: Project }) {
  const view = buildOpportunityView(p);
  return (
    <Link to={`/opportunities/${p.id}`} className="block group h-full">
      <article className="h-full flex flex-col rounded-2xl border border-hairline bg-surface shadow-card overflow-hidden transition-all duration-200 ease-smooth group-hover:-translate-y-1 group-hover:shadow-lifted group-hover:border-line">
        {/* ── Cover ── */}
        <OpportunityCoverArt cover={view.cover} className="h-36">
          <div className="absolute top-3 left-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/35 backdrop-blur-sm px-2.5 py-1 text-[11px] font-semibold text-white">
              <span className={`w-1.5 h-1.5 rounded-full ${view.statusTone === 'success' ? 'bg-emerald-300' : 'bg-white'}`} />
              {view.statusLabel}
            </span>
          </div>
          <div className="absolute bottom-3 left-4 right-4">
            <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-white/80">{view.tagline}</p>
            <h3 className="text-lg font-bold text-white leading-tight line-clamp-2 drop-shadow-sm">{p.name}</h3>
          </div>
        </OpportunityCoverArt>

        {/* ── Body ── */}
        <div className="flex flex-col flex-1 p-4">
          <p className="text-xs text-secondary leading-snug line-clamp-3">{view.shortThesis}</p>

          <div className="grid grid-cols-3 gap-2 mt-4">
            <Term label="Раунд" value={formatMoney(p.raiseAmount, p.currency)} />
            <Term label="Доля" value={formatPercent(p.equityOffered)} />
            <Term label="Мин. чек" value={formatMoney(p.minCheck, p.currency)} />
          </div>

          <div className="flex items-center gap-1.5 mt-3 text-[11px] text-zapusk-600 font-medium">
            <Sparkles size={12} className="shrink-0" />
            <span className="truncate">{view.payback ? `Окупаемость: ${view.payback}` : view.upside}</span>
          </div>

          <div className="flex items-center justify-between mt-auto pt-4">
            <span className="text-[11px] text-muted">{view.scarcity.split(' · ')[0]}</span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-grad-zapusk px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition-transform group-hover:translate-x-0.5">
              Подробнее <ChevronRight size={13} />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas/60 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-[0.06em] text-muted font-semibold">{label}</div>
      <div className="text-sm font-semibold text-primary mt-0.5 truncate font-num">{value}</div>
    </div>
  );
}
