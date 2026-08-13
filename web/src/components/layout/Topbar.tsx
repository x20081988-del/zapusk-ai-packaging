import { useNavigate } from 'react-router-dom';
import { LogOut, Menu } from 'lucide-react';
import { getAuth, clearAuth, roleLabel } from '../../lib/auth';
import { ThemeToggle } from '../ui/ThemeToggle';
import { StatusBadge } from '../ui/StatusBadge';

interface TopbarProps {
  title: string;
  action?: React.ReactNode;
  /** Sprint 14: burger handler — only shown on screens < lg. */
  onOpenMenu?: () => void;
}

export function Topbar({ title, action, onOpenMenu }: TopbarProps) {
  const auth = getAuth();
  const navigate = useNavigate();

  return (
    <header className="h-16 bg-ink/70 backdrop-blur border-b border-hairline sticky top-0 z-30">
      <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {onOpenMenu && (
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="Открыть меню"
              className="lg:hidden w-9 h-9 rounded-md flex items-center justify-center text-secondary hover:text-primary hover:bg-surface transition-colors shrink-0"
            >
              <Menu size={18} />
            </button>
          )}
          <h1 className="text-base font-semibold text-primary tracking-tight truncate">{title}</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {action}
          <ThemeToggle />
          {auth && (
            // На 390px бейдж переносился в две строки и выдавливал заголовок экрана
            // в ноль. Для продукта с одним пользователем бейдж роли на телефоне - шум.
            <span className="hidden sm:inline-flex">
              <StatusBadge tone={auth.role === 'SUPER_ADMIN' ? 'danger' : auth.role === 'ADMIN' ? 'danger' : auth.role === 'MANAGER' ? 'ai' : auth.role === 'INVESTOR' ? 'zapusk' : 'success'} dot>
                {roleLabel(auth.role)}
              </StatusBadge>
            </span>
          )}
          <div className="hidden md:flex items-center gap-2.5 pl-4 border-l border-hairline">
            <div className="w-7 h-7 rounded-full bg-grad-zapusk flex items-center justify-center text-white text-xs font-bold">
              {(auth?.name ?? auth?.email ?? '?').charAt(0).toUpperCase()}
            </div>
            <div className="hidden lg:block">
              <div className="text-[12px] font-medium text-primary leading-tight">{auth?.name ?? '—'}</div>
              <div className="text-[10px] text-muted">{auth?.email ?? ''}</div>
            </div>
            <button
              onClick={() => {
                clearAuth();
                navigate('/login');
              }}
              className="ml-2 text-muted hover:text-danger transition-colors"
              title="Выйти"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
