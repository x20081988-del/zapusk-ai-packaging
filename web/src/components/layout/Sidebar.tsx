import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import {
  LayoutDashboard, FolderPlus, FileCode2, ShieldCheck, BookOpen, Headphones, Radio,
  BriefcaseBusiness, Users, Settings, UserRound, Presentation, ClipboardList, CalendarDays,
  MessageCircle, Handshake, KanbanSquare, PackageCheck, ClipboardCheck,
} from 'lucide-react';
import { Logo } from '../ui/Logo';
import { getAuth, roleLabel, type UserRole } from '../../lib/auth';

interface NavItem { to: string; icon: typeof LayoutDashboard; label: string }

const NAV: Record<UserRole, NavItem[]> = {
  client: [
    { to: '/dashboard',        icon: LayoutDashboard, label: 'Рабочий стол' },
    { to: '/projects/new',     icon: FolderPlus,      label: 'Новый проект' },
    { to: '/demo',             icon: Presentation,    label: 'Демо-кабинет' },
    { to: '/ai-leads',         icon: Radio,           label: 'AI-лиды' },
    { to: '/sales-assistant',  icon: Headphones,      label: 'AI-ассистент' },
    { to: '/meetings',         icon: ClipboardCheck,  label: 'Встречи' },
    { to: '/personal-manager', icon: MessageCircle,   label: 'Персональный менеджер' },
  ],
  manager: [
    { to: '/manager',          icon: LayoutDashboard, label: 'Рабочий стол менеджера' },
    { to: '/manager/projects', icon: BriefcaseBusiness, label: 'Мои проекты' },
    { to: '/manager/leads',    icon: Radio,           label: 'Новые лиды' },
    { to: '/meetings',         icon: ClipboardCheck,  label: 'Встречи' },
    { to: '/manager/meetings', icon: CalendarDays,    label: 'Календарь' },
    { to: '/manager/tasks',    icon: ClipboardList,   label: 'Задачи' },
    { to: '/manager/clients',  icon: Users,           label: 'Клиенты' },
  ],
  admin: [
    { to: '/admin',            icon: ShieldCheck,     label: 'Админ-панель' },
    { to: '/admin/projects',   icon: BriefcaseBusiness, label: 'Все проекты' },
    { to: '/admin/users',      icon: Users,           label: 'Пользователи' },
    { to: '/templates',        icon: FileCode2,       label: 'Шаблоны' },
    { to: '/admin/leads',      icon: Radio,           label: 'Лиды' },
    { to: '/meetings',         icon: ClipboardCheck,  label: 'Встречи' },
    { to: '/admin/materials',  icon: PackageCheck,    label: 'Материалы' },
    { to: '/admin/settings',   icon: Settings,        label: 'Настройки' },
  ],
};

export function Sidebar() {
  const role = getAuth()?.role ?? 'client';
  const visibleNav = NAV[role];

  return (
    <aside className="hidden lg:flex flex-col w-sidebar bg-ink border-r border-line shrink-0 h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-hairline">
        <Logo />
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1">
        <SectionLabel>{roleLabel(role)}</SectionLabel>
        {visibleNav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
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

        <div className="pt-6">
          <SectionLabel>Ресурсы</SectionLabel>
          <a
            href="https://zapusk.tech"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-3 h-10 rounded-md text-sm text-secondary hover:text-primary hover:bg-surface transition-all"
          >
            <BookOpen size={16} className="shrink-0" />
            База знаний
          </a>
        </div>
      </nav>

      <div className="mx-3 mb-4 p-4 rounded-lg border border-line bg-grad-ink relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-24 h-24 bg-zapusk/20 rounded-full blur-2xl" />
        {role === 'client' ? <UserRound size={16} className="text-zapusk-400 mb-2" /> : role === 'manager' ? <Handshake size={16} className="text-zapusk-400 mb-2" /> : <KanbanSquare size={16} className="text-zapusk-400 mb-2" />}
        <div className="text-[13px] font-semibold text-primary leading-tight">
          {role === 'client' ? 'Ваш менеджер' : role === 'manager' ? 'Команда сопровождения' : 'ZAPUSK AI Admin'}
        </div>
        <div className="text-[11px] text-muted mt-1 leading-snug">
          {role === 'client' ? 'Екатерина · упаковка и лиды' : role === 'manager' ? 'Фокус на проектах и следующих шагах.' : 'Роли, проекты, шаблоны и статусы.'}
        </div>
      </div>
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
