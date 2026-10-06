import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  LayoutDashboard, FolderPlus, FolderOpen, FileCode2, ShieldCheck, BookOpen, Headphones, Radio,
  BriefcaseBusiness, Users, Settings, UserRound, Presentation, ClipboardList, CalendarDays,
  MessageCircle, Handshake, KanbanSquare, PackageCheck, ClipboardCheck, Brain, Building2,
  Mail, TrendingUp, Repeat, X, Archive, Activity, Radar, ListChecks, HeartPulse, PhoneIncoming,
  ChevronDown, LogOut,
} from 'lucide-react';
import { Logo } from '../ui/Logo';
import { getAuth, clearAuth, roleLabel, type UserRole } from '../../lib/auth';

// Sprint 50 hotfix — sidebar active-state used to be `NavLink` with default
// prefix-match. That meant `/projects` highlighted on `/projects/new`
// (the bug the user filed) and the same pattern silently bit `/admin`,
// `/manager`, `/demo`. Two opt-in knobs:
//   - `end: true`      → exact-match only (parent dashboards that share
//                        a prefix with their siblings).
//   - `matchExclude`   → child paths that, when active, prevent the
//                        parent from also lighting up. Lets `/projects`
//                        keep matching `/projects/:id` (detail page) but
//                        not `/projects/new` (sibling nav item).
interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  end?: boolean;
  matchExclude?: string[];
}
interface NavSection {
  label?: string;
  items: NavItem[];
  /** Design pass 06.10.2026: the section folds, state remembered per browser. */
  collapsible?: boolean;
}

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.matchExclude?.some((ex) => pathname === ex || pathname.startsWith(ex + '/'))) {
    return false;
  }
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(item.to + '/');
}

// Sprint 25 — нормальная RBAC. Каждая роль видит свой набор пунктов.
// Sprint 26 — навигация FOUNDER разнесена на секции: «Рабочий кабинет»,
// «Демо ZAPUSK AI» (showcase отдельно), «Инструменты». Это убирает путаницу
// «где у меня настоящие данные, а где готовый пример».
const NAV: Partial<Record<UserRole, NavSection[]>> = {
  SUPER_ADMIN: [
    // Две секции вместо плоского списка: четыре экрана дня тонули в четырнадцати
    // админских пунктах. «Мой день» - то, ради чего владелец заходит каждый день;
    // все остальное - управление платформой, туда он ходит по случаю, поэтому
    // с 06.10.2026 секция свернута по умолчанию и раскрывается по клику.
    { label: 'Мой день', items: [
      { to: '/decide',           icon: ListChecks,        label: 'Решения' },
      // Sprint 63.P12 - доска founder_crm из telegram-agent, рядом с решениями:
      // очередь отвечает «что решить», CRM - «что двигать дальше».
      { to: '/crm',              icon: KanbanSquare,      label: 'CRM', matchExclude: ['/crm/depts'] },
      // 28.09.2026 - CRM по отделам: клиенты, эфиры, юристы... текущее и сделанное.
      { to: '/crm/depts',        icon: Building2,         label: 'Отделы' },
      { to: '/system',           icon: HeartPulse,        label: 'Здоровье системы' },
      // Конверт у Почты, а не у Приглашений: «Почта» и «Входящие» и так путались
      // по смыслу, одинаково почтовые иконки добивали.
      { to: '/mail',             icon: Mail,              label: 'Почта' },
      { to: '/inbound',          icon: PhoneIncoming,     label: 'Заявки и чаты' },
    ]},
    { label: 'Админка платформы', collapsible: true, items: [
      { to: '/admin',            icon: ShieldCheck,       label: 'Админ-панель', end: true },
      { to: '/admin/invites',    icon: UserRound,         label: 'Приглашения' },
      { to: '/admin/users',      icon: Users,             label: 'Пользователи' },
      { to: '/admin/projects',   icon: BriefcaseBusiness, label: 'Все проекты' },
      { to: '/templates',        icon: FileCode2,         label: 'Шаблоны' },
      { to: '/admin/leads',      icon: Radio,             label: 'Лиды' },
      { to: '/admin/materials',  icon: PackageCheck,      label: 'Материалы' },
      { to: '/conversation-analysis', icon: Brain,        label: 'AI-разбор переговоров' },
      { to: '/meetings',         icon: ClipboardCheck,    label: 'Встречи' },
      // Sprint 39 — управление базой знаний AI-продаж.
      { to: '/admin/knowledge',  icon: BookOpen,          label: 'База знаний AI-продаж' },
      // Sprint 44 — learning dashboard.
      { to: '/admin/learning',   icon: Activity,          label: 'Learning Dashboard' },
      { to: '/admin/ai-reliability', icon: Activity,      label: 'AI Reliability' },
      { to: '/admin/audit',      icon: Archive,           label: 'Журнал и архив' },
      { to: '/admin/settings',   icon: Settings,          label: 'Системные настройки' },
    ]},
  ],
  ADMIN: [
    { items: [
      { to: '/admin',            icon: ShieldCheck,       label: 'Админ-панель', end: true },
      { to: '/admin/invites',    icon: Mail,              label: 'Приглашения' },
      { to: '/admin/users',      icon: Users,             label: 'Пользователи' },
      { to: '/admin/projects',   icon: BriefcaseBusiness, label: 'Все проекты' },
      { to: '/admin/leads',      icon: Radio,             label: 'Лиды' },
      { to: '/admin/materials',  icon: PackageCheck,      label: 'Материалы' },
      { to: '/conversation-analysis', icon: Brain,        label: 'AI-разбор переговоров' },
      { to: '/meetings',         icon: ClipboardCheck,    label: 'Встречи' },
      // Sprint 39 — управление базой знаний AI-продаж.
      { to: '/admin/knowledge',  icon: BookOpen,          label: 'База знаний AI-продаж' },
      // Sprint 44 — learning dashboard.
      { to: '/admin/learning',   icon: Activity,          label: 'Learning Dashboard' },
      { to: '/admin/ai-reliability', icon: Activity,      label: 'AI Reliability' },
      { to: '/admin/audit',      icon: Archive,           label: 'Журнал и архив' },
    ]},
  ],
  MANAGER: [
    { items: [
      { to: '/manager',          icon: LayoutDashboard,   label: 'Рабочий стол менеджера', end: true },
      { to: '/manager/projects', icon: BriefcaseBusiness, label: 'Мои проекты' },
      { to: '/manager/leads',    icon: Radio,             label: 'Новые лиды' },
      { to: '/conversation-analysis', icon: Brain,        label: 'AI-разбор переговоров' },
      { to: '/meetings',         icon: ClipboardCheck,    label: 'Встречи' },
      { to: '/manager/meetings', icon: CalendarDays,      label: 'Календарь' },
      { to: '/manager/tasks',    icon: ClipboardList,     label: 'Задачи' },
      { to: '/manager/clients',  icon: Users,             label: 'Клиенты' },
      // Sprint 39 — менеджеры тоже могут управлять KB (загружать скрипты,
      // кейсы из своих сделок).
      { to: '/admin/knowledge',  icon: BookOpen,          label: 'База знаний AI-продаж' },
      // Sprint 44 — learning dashboard для менеджеров.
      { to: '/admin/learning',   icon: Activity,          label: 'Learning Dashboard' },
      { to: '/admin/ai-reliability', icon: Activity,      label: 'AI Reliability' },
    ]},
  ],
  FOUNDER: [
    { label: 'Рабочий кабинет', items: [
      { to: '/dashboard',        icon: LayoutDashboard,   label: 'Рабочий стол' },
      // Sprint 50 hotfix — `/projects/new` is exact-only so it never bleeds
      // into a (theoretical) `/projects/new/...` child. `/projects` keeps
      // prefix-matching so it stays lit on `/projects/:id`, but the
      // matchExclude prevents it from co-lighting with `/projects/new`.
      { to: '/projects/new',     icon: FolderPlus,        label: 'Новый проект', end: true },
      { to: '/projects',         icon: FolderOpen,        label: 'Мои проекты', matchExclude: ['/projects/new'] },
    ]},
    { label: 'Инструменты', items: [
      { to: '/ai-leads',         icon: Radio,             label: 'AI-лиды', matchExclude: ['/ai-leads/outreach'] },
      { to: '/ai-leads/outreach', icon: Radar,            label: 'AI-аутрич' },
      { to: '/conversation-analysis', icon: Brain,        label: 'AI-разбор переговоров' },
      { to: '/sales-assistant',  icon: Headphones,        label: 'AI-ассистент' },
      { to: '/meetings',         icon: ClipboardCheck,    label: 'Встречи' },
      { to: '/personal-manager', icon: MessageCircle,     label: 'Ваш менеджер' },
    ]},
    { label: 'Демо ZAPUSK AI', items: [
      // Sprint 50 hotfix — same parent/sibling collision pattern as /admin.
      { to: '/demo',             icon: Presentation,      label: 'Демо-кабинет', end: true },
      { to: '/demo/ai-leads',    icon: Radio,             label: 'Демо AI-лиды' },
      { to: '/demo/conversations', icon: Brain,           label: 'Демо AI-переговоры' },
    ]},
  ],
  INVESTOR: [
    { items: [
      { to: '/opportunities',    icon: TrendingUp,        label: 'Инвест-возможности' },
      { to: '/portfolio',        icon: BriefcaseBusiness, label: 'Портфель' },
      { to: '/secondary',        icon: Repeat,            label: 'Вторичный рынок' },
      { to: '/profile',          icon: UserRound,         label: 'Профиль' },
    ]},
  ],
};

const COLLAPSE_KEY = 'zapusk.nav.collapsed';

function readCollapsed(): Record<string, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '{}') as unknown;
    return raw && typeof raw === 'object' ? (raw as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

interface SidebarProps {
  /** Sprint 14: mobile-drawer mode. */
  mobile?: boolean;
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ mobile, open, onClose }: SidebarProps = {}) {
  const auth = getAuth();
  const navigate = useNavigate();
  const role = auth?.role ?? 'FOUNDER';
  // Sprint 50 hotfix — active state is computed manually instead of relying
  // on NavLink's prefix-match default. See isItemActive() above for the rule
  // (exact / prefix / with sibling exclusions).
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsed);
  const baseSections = NAV[role] ?? NAV.FOUNDER ?? [];
  // Sprint 24: в demo-режиме скрываем «Новый проект» — фаундер не создаёт
  // реальные проекты в показательной витрине.
  // Sprint 26: в demo-кабинете «Мои проекты» тоже скрываем — у demo юзера
  // их нет, есть только глобальные демо-кейсы.
  const isDemoMode = auth?.workspaceStatus === 'demo';
  const HIDE_IN_DEMO = new Set(['/projects/new', '/projects']);
  const visibleSections: NavSection[] = baseSections
    .map((section) => ({
      ...section,
      items: isDemoMode ? section.items.filter((i) => !HIDE_IN_DEMO.has(i.to)) : section.items,
    }))
    .filter((section) => section.items.length > 0);

  function toggleSection(label: string) {
    setCollapsed((prev) => {
      // Свернутая секция - состояние по умолчанию, поэтому отсутствие ключа = свернуто.
      const next = { ...prev, [label]: !(prev[label] ?? true) };
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        // без localStorage запоминаем на один заход
      }
      return next;
    });
  }

  const displayName = auth?.name && auth.name !== auth.email ? auth.name : (auth?.email ?? '');
  const initial = (displayName || '?').charAt(0).toUpperCase();

  const sidebarBody = (
    <>
      <div className="px-5 h-14 border-b border-hairline flex items-center justify-between shrink-0">
        <Logo />
        {mobile && (
          <button
            onClick={onClose}
            aria-label="Закрыть меню"
            className="w-9 h-9 rounded-md flex items-center justify-center text-secondary hover:text-primary hover:bg-hairline transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {visibleSections.map((section, sectionIndex) => {
          const label = section.label;
          const hasActive = section.items.some((it) => isItemActive(pathname, it));
          // Раздел с текущим экраном всегда раскрыт: прятать подсветку активного
          // пункта за свернутой шапкой значит потерять ориентир «где я».
          const isOpen = !section.collapsible || hasActive || !(collapsed[label ?? ''] ?? true);
          return (
            <div key={label ?? `section-${sectionIndex}`} className={sectionIndex > 0 ? 'pt-4' : ''}>
              {label && section.collapsible ? (
                <button
                  type="button"
                  onClick={() => toggleSection(label)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint hover:text-muted transition-colors"
                >
                  <span>{label}</span>
                  <ChevronDown size={14} className={clsx('transition-transform', !isOpen && '-rotate-90')} />
                </button>
              ) : label ? (
                <SectionLabel>{label}</SectionLabel>
              ) : null}
              {isOpen && (
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavLinkItem key={item.to} item={item} active={isItemActive(pathname, item)} onClick={mobile ? onClose : undefined} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="pt-4">
          <SectionLabel>Ресурсы</SectionLabel>
          <a
            href="https://zapusk.tech"
            target="_blank"
            rel="noreferrer"
            onClick={mobile ? onClose : undefined}
            className="flex items-center gap-2.5 px-3 h-9 rounded-md text-[13.5px] text-secondary hover:text-primary hover:bg-hairline transition-colors"
          >
            <BookOpen size={16} className="shrink-0 text-muted" />
            База знаний
          </a>
        </div>
      </nav>

      {role !== 'SUPER_ADMIN' && (
        <div className="mx-3 mb-3 p-3.5 rounded-lg border border-line bg-canvas/60">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-primary leading-tight">
            {role === 'FOUNDER' ? <UserRound size={15} className="text-zapusk shrink-0" />
              : role === 'MANAGER' ? <Handshake size={15} className="text-zapusk shrink-0" />
              : role === 'INVESTOR' ? <TrendingUp size={15} className="text-zapusk shrink-0" />
              : <KanbanSquare size={15} className="text-zapusk shrink-0" />}
            {role === 'FOUNDER' ? 'Ваш менеджер'
              : role === 'MANAGER' ? 'Команда сопровождения'
              : role === 'INVESTOR' ? 'Поддержка инвестора'
              : 'ZAPUSK AI Admin'}
          </div>
          <div className="text-[11.5px] text-muted mt-1 leading-snug">
            {role === 'FOUNDER' ? 'Екатерина · упаковка и лиды'
              : role === 'MANAGER' ? 'Фокус на проектах и следующих шагах.'
              : role === 'INVESTOR' ? 'Помощь с инвестициями через ZAPUSK AI.'
              : 'Роли, проекты, шаблоны и статусы.'}
          </div>
        </div>
      )}

      {/* Аккаунт живет внизу сайдбара: на десктопе всегда виден, на телефоне
          доступен из того же меню, и у «Выйти» наконец есть место на телефоне. */}
      {auth && (
        <div className="px-3 py-3 border-t border-hairline shrink-0">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-8 h-8 rounded-full bg-zapusk text-white text-xs font-bold flex items-center justify-center shrink-0">
              {initial}
            </div>
            <div className="min-w-0 flex-1" title={auth.email}>
              <div className="text-[13px] font-medium text-primary truncate">{displayName}</div>
              <div className="text-[11px] text-muted truncate">{roleLabel(role)}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                clearAuth();
                navigate('/login');
              }}
              title="Выйти"
              aria-label="Выйти"
              className="w-8 h-8 rounded-md flex items-center justify-center text-muted hover:text-danger hover:bg-hairline transition-colors shrink-0"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );

  if (mobile) {
    return (
      <div
        className={clsx(
          'lg:hidden fixed inset-0 z-50 transition-opacity',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        aria-hidden={!open}
      >
        <div
          className="absolute inset-0 bg-canvas/80 backdrop-blur-sm"
          onClick={onClose}
        />
        <aside
          className={clsx(
            'absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-ink border-r border-line flex flex-col shadow-lifted transition-transform',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Главное меню"
        >
          {sidebarBody}
        </aside>
      </div>
    );
  }

  return (
    <aside className="hidden lg:flex flex-col w-sidebar bg-ink border-r border-line shrink-0 h-screen sticky top-0">
      {sidebarBody}
    </aside>
  );
}

function NavLinkItem({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'flex items-center gap-2.5 px-3 h-9 rounded-md text-[13.5px] transition-colors',
        active
          ? 'bg-zapusk/10 text-primary font-medium'
          : 'text-secondary hover:text-primary hover:bg-hairline',
      )}
    >
      <Icon size={16} className={clsx('shrink-0', active ? 'text-zapusk' : 'text-muted')} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
      {children}
    </div>
  );
}
