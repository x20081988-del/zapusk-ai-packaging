import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { getAuth, clearAuth, roleLabel } from '../../lib/auth';
import { ThemeToggle } from '../ui/ThemeToggle';
import { StatusBadge } from '../ui/StatusBadge';

export function Topbar({ title, action }: { title: string; action?: React.ReactNode }) {
  const auth = getAuth();
  const navigate = useNavigate();

  return (
    <header className="h-16 bg-ink/70 backdrop-blur border-b border-hairline sticky top-0 z-30">
      <div className="h-full px-6 lg:px-8 flex items-center justify-between gap-4">
        <h1 className="text-base font-semibold text-primary tracking-tight truncate">{title}</h1>
        <div className="flex items-center gap-3">
          {action}
          <ThemeToggle />
          {auth && (
            <StatusBadge tone={auth.role === 'admin' ? 'danger' : auth.role === 'manager' ? 'ai' : 'success'} dot>
              {roleLabel(auth.role)}
            </StatusBadge>
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
