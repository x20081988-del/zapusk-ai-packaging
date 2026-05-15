import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import {
  LayoutDashboard, FolderPlus, FolderOpen, FileCode2, ShieldCheck, BookOpen, Headphones, Radio,
  BriefcaseBusiness, Users, Settings, UserRound, Presentation, ClipboardList, CalendarDays,
  MessageCircle, Handshake, KanbanSquare, PackageCheck, ClipboardCheck, Brain,
  Mail, TrendingUp, Repeat, X, Archive,
} from 'lucide-react';
import { Logo } from '../ui/Logo';
import { getAuth, roleLabel, type UserRole } from '../../lib/auth';

interface NavItem { to: string; icon: typeof LayoutDashboard; label: string }
interface NavSection { label?: string; items: NavItem[] }

// Sprint 25 — нормальная RBAC. Каждая роль видит свой набор пунктов.
// Sprint 26 — навигация FOUNDER разнесена на секции: «Рабочий кабинет»,
// «Демо ZAPUSK AI» (showcase отдельно), «Инструменты». Это убирает путаницу
// «где у меня настоящие данные, а где готовый пример».
const NAV: Partial<Record<UserRole, NavSection[]>> = {
  SUPER_ADMIN: [
    { items: [
      { to: '/admin',            icon: ShieldCheck,       label: 'Админ-панель' },
      { to: '/admin/invites',    icon: Mail,              label: 'Приглашения' },
      { to: '/admin/users',      icon: Users,             label: 'Пользователи' },
      { to: '/admin/projects',   icon: BriefcaseBusiness, label: 'Все проекты' },
      { to: '/templates',        icon: FileCode2,         label: 'Шаблоны' },
      { to: '/admin/leads',      icon: Radio,             label: 'Лиды' },
      { to: '/admin/materials',  icon: PackageCheck,      label: 'Материалы' },
      { to: '/conversation-analysis', icon: Brain,        label: 'AI-разбор переговоров' },
      { to: '/meetings',         icon: ClipboardCheck,    label: 'Встречи' },
      // Sprint 39 — управление базой знаний AI-продаж.
      { to: '/admin/knowledge',  icon: BookOpen,          label: 'База знаний AI-продаж' },
      { to: '/admin/audit',      icon: Archive,           label: 'Журнал и архив' },
      { to: '/admin/settings',   icon: Settings,          label: 'Системные настройки' },
    ]},
  ],
  ADMIN: [
    { items: [
      { to: '/admin',            icon: ShieldCheck,       label: 'Админ-панель' },
      { to: '/admin/invites',    icon: Mail,              label: 'Приглашения' },
      { to: '/admin/users',      icon: Users,             label: 'Пользователи' },
      { to: '/admin/projects',   icon: BriefcaseBusiness, label: 'Все проекты' },
      { to: '/admin/leads',      icon: Radio,             label: 'Лиды' },
      { to: '/admin/materials',  icon: PackageCheck,      label: 'Материалы' },
      { to: '/conversation-analysis', icon: Brain,        label: 'AI-разбор переговоров' },
      { to: '/meetings',         icon: ClipboardCheck,    label: 'Встречи' },
      // Sprint 39 — управление базой знаний AI-продаж.
      { to: '/admin/knowledge',  icon: BookOpen,          label: 'База знаний AI-продаж' },
      { to: '/admin/audit',      icon: Archive,           label: 'Журнал и архив' },
    ]},
  ],
  MANAGER: [
    { items: [
      { to: '/manager',          icon: LayoutDashboard,   label: 'Рабочий стол менеджера' },
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
    ]},
  ],
  FOUNDER: [
    { label: 'Рабочий кабинет', items: [
      { to: '/dashboard',        icon: LayoutDashboard,   label: 'Рабочий стол' },
      { to: '/projects/new',     icon: FolderPlus,        label: 'Новый проект' },
      { to: '/projects',         icon: FolderOpen,        label: 'Мои проекты' },
    ]},
    { label: 'Инструменты', items: [
      { to: '/ai-leads',         icon: Radio,             label: 'AI-лиды' },
      { to: '/conversation-analysis', icon: Brain,        label: 'AI-разбор переговоров' },
      { to: '/sales-assistant',  icon: Headphones,        label: 'AI-ассистент' },
      { to: '/meetings',         icon: ClipboardCheck,    label: 'Встречи' },
      { to: '/personal-manager', icon: MessageCircle,     label: 'Ваш менеджер' },
    ]},
    { label: 'Демо ZAPUSK AI', items: [
      { to: '/demo',             icon: Presentation,      label: 'Демо-кабинет' },
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

interface SidebarProps {
  /** Sprint 14: mobile-drawer mode. */
  mobile?: boolean;
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ mobile, open, onClose }: SidebarProps = {}) {
  const auth = getAuth();
  const role = auth?.role ?? 'FOUNDER';
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

  const sidebarBody = (
    <>
      <div className="px-5 py-5 border-b border-hairline flex items-center justify-between">
        <Logo />
        {mobile && (
          <button
            onClick={onClose}
            aria-label="Закрыть меню"
            className="w-9 h-9 rounded-md flex items-center justify-center text-secondary hover:text-primary hover:bg-surface transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
        <SectionLabel>{roleLabel(role)}</SectionLabel>
        {visibleSections.map((section, sectionIndex) => (
          <div key={section.label ?? `section-${sectionIndex}`} className={sectionIndex > 0 ? 'pt-5' : ''}>
            {section.label && <SectionLabel>{section.label}</SectionLabel>}
            {section.items.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={mobile ? onClose : undefined}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 h-10 rounded-md text-sm transition-all',
                    isActive
                      ? 'bg-zapusk/10 text-primary border border-zapusk/30 shadow-glow'
                      : 'text-secondary hover:text-primary hover:bg-surface',
                  )
                }
              >
                <Icon size={16} className="shrink-0" />
                {label}
              </NavLink>
            ))}
          </div>
        ))}

        <div className="pt-6">
          <SectionLabel>Ресурсы</SectionLabel>
          <a
            href="https://zapusk.tech"
            target="_blank"
            rel="noreferrer"
            onClick={mobile ? onClose : undefined}
            className="flex items-center gap-3 px-3 h-10 rounded-md text-sm text-secondary hover:text-primary hover:bg-surface transition-all"
          >
            <BookOpen size={16} className="shrink-0" />
            База знаний
          </a>
        </div>
      </nav>

      <div className="mx-3 mb-4 p-4 rounded-lg border border-line bg-grad-ink relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-24 h-24 bg-zapusk/20 rounded-full blur-2xl" />
        {role === 'FOUNDER' ? <UserRound size={16} className="text-zapusk-400 mb-2" />
          : role === 'MANAGER' ? <Handshake size={16} className="text-zapusk-400 mb-2" />
          : role === 'INVESTOR' ? <TrendingUp size={16} className="text-zapusk-400 mb-2" />
          : <KanbanSquare size={16} className="text-zapusk-400 mb-2" />}
        <div className="text-[13px] font-semibold text-primary leading-tight">
          {role === 'FOUNDER' ? 'Ваш менеджер'
            : role === 'MANAGER' ? 'Команда сопровождения'
            : role === 'INVESTOR' ? 'Поддержка инвестора'
            : 'ZAPUSK AI Admin'}
        </div>
        <div className="text-[11px] text-muted mt-1 leading-snug">
          {role === 'FOUNDER' ? 'Екатерина · упаковка и лиды'
            : role === 'MANAGER' ? 'Фокус на проектах и следующих шагах.'
            : role === 'INVESTOR' ? 'Помощь с инвестициями через ZAPUSK AI.'
            : 'Роли, проекты, шаблоны и статусы.'}
        </div>
      </div>
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
            'absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-ink border-r border-line flex flex-col shadow-xl transition-transform',
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

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
      {children}
    </div>
  );
}
