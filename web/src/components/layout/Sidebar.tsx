import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { LayoutDashboard, FolderPlus, FileCode2, ShieldCheck, BookOpen, Rocket, BookText, Headphones } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { ModeToggle } from '../ui/ModeToggle';
import { useMode } from '../../lib/mode';

interface NavItem { to: string; icon: typeof LayoutDashboard; label: string; teamOnly?: boolean }

const NAV: NavItem[] = [
  { to: '/dashboard',       icon: LayoutDashboard, label: 'Рабочий стол' },
  { to: '/projects/new',    icon: FolderPlus,      label: 'Новый проект' },
  { to: '/guide',           icon: BookText,        label: 'Гайд команды' },
  { to: '/sales-assistant', icon: Headphones,      label: 'AI-ассистент на продажах' },
  // team-only navigation lives below — hidden from clients
  { to: '/templates',       icon: FileCode2,       label: 'Шаблоны заданий', teamOnly: true },
  { to: '/admin/projects',  icon: ShieldCheck,     label: 'Админ', teamOnly: true },
];

export function Sidebar() {
  const [mode] = useMode();
  const visibleNav = NAV.filter((n) => !n.teamOnly || mode === 'team');

  return (
    <aside className="hidden lg:flex flex-col w-sidebar bg-ink border-r border-line shrink-0 h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-hairline">
        <Logo />
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1">
        <SectionLabel>Навигация</SectionLabel>
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

      <div className="mx-3 mb-3">
        <div className="text-[10px] uppercase tracking-[0.14em] text-faint font-semibold mb-1.5 px-1">
          Режим интерфейса
        </div>
        <ModeToggle />
      </div>

      <div className="mx-3 mb-4 p-4 rounded-lg border border-line bg-grad-ink relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-24 h-24 bg-zapusk/20 rounded-full blur-2xl" />
        <Rocket size={16} className="text-zapusk-400 mb-2" />
        <div className="text-[13px] font-semibold text-primary leading-tight">
          ZAPUSK AI
        </div>
        <div className="text-[11px] text-muted mt-1 leading-snug">
          Платформа подготовки проектов к инвесторам.
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
