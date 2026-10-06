import { Menu } from 'lucide-react';
import { ThemeToggle } from '../ui/ThemeToggle';

interface TopbarProps {
  title: string;
  action?: React.ReactNode;
  /** Sprint 14: burger handler — only shown on screens < lg. */
  onOpenMenu?: () => void;
}

// Design pass 06.10.2026: the bar carries the screen title and the screen's own
// actions, nothing else. Role badge and account block moved to the sidebar
// footer: a red «ВЛАДЕЛЕЦ ПЛАТФОРМЫ» pill next to every title read as an alert,
// and the name/email pair repeated the same string twice.
export function Topbar({ title, action, onOpenMenu }: TopbarProps) {
  return (
    <header className="h-14 bg-ink/80 backdrop-blur border-b border-hairline sticky top-0 z-30">
      <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {onOpenMenu && (
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="Открыть меню"
              className="lg:hidden w-9 h-9 -ml-1.5 rounded-md flex items-center justify-center text-secondary hover:text-primary hover:bg-hairline transition-colors shrink-0"
            >
              <Menu size={18} />
            </button>
          )}
          <h1 className="font-display text-[17px] font-semibold text-primary tracking-tight truncate">{title}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
