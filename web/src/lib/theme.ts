import { useEffect, useState } from 'react';

// Theme system — mirrors lib/mode.ts. localStorage key 'zapusk.theme', values
// 'dark' (default) | 'light'. Initial paint is set inline in index.html
// (anti-flicker). Runtime updates flip <html data-theme> + dispatch event so
// any subscribed component rerenders without a reload.

export type Theme = 'dark' | 'light';

const KEY = 'zapusk.theme';
const EVENT = 'zapusk:theme';

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // ignore — in-memory still propagates via dispatch.
  }
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
  window.dispatchEvent(new CustomEvent<Theme>(EVENT, { detail: theme }));
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, set] = useState<Theme>(() => getTheme());
  useEffect(() => {
    const h = (e: Event) => set((e as CustomEvent<Theme>).detail);
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
  return [theme, (t) => setTheme(t)];
}
