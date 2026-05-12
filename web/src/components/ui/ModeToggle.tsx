import clsx from 'clsx';
import { Users, ShieldCheck } from 'lucide-react';
import { useMode, type UIMode } from '../../lib/mode';

// Two-state toggle for the UI mode (client vs Zapusk team). Lives in Sidebar.
// Switching client → team unlocks Admin / Templates / Sales Assistant from the nav.
export function ModeToggle({ compact }: { compact?: boolean }) {
  const [mode, setMode] = useMode();

  function pick(next: UIMode) {
    if (next === mode) return;
    setMode(next);
  }

  return (
    <div className={clsx('rounded-md border border-line bg-canvas/40 p-1 flex gap-1', compact && 'p-0.5')}>
      <ModeButton active={mode === 'client'} onClick={() => pick('client')} icon={<Users size={11} />} label="Клиент" />
      <ModeButton active={mode === 'team'}   onClick={() => pick('team')}   icon={<ShieldCheck size={11} />} label="Команда" />
    </div>
  );
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex-1 inline-flex items-center justify-center gap-1.5 h-7 rounded-[6px] text-[11px] font-medium transition-all',
        active
          ? 'bg-grad-zapusk text-canvas shadow-glow'
          : 'text-secondary hover:text-primary hover:bg-surface',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
