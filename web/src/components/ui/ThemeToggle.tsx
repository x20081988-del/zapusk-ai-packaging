import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../lib/theme';

// Single-button toggle. Tap = flip light ↔ dark. Icon shows what the click
// will switch *to* (Linear / Notion convention), which avoids the "I'm
// already in dark, why moon?" confusion.
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const next: 'dark' | 'light' = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
      className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-line bg-surface text-secondary hover:text-primary hover:border-zapusk/40 transition-colors"
    >
      {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
