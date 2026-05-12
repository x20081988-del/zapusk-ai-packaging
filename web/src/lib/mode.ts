import { useEffect, useState } from 'react';

// MVP UI-mode split without RBAC. The flag lives in localStorage so a single
// browser swaps between client view (founders, investors) and team view
// (Zapusk operators). Default is the safer one — client — so a fresh device
// never accidentally exposes the admin surface.
//
// Sidebar reads useMode() on render; ModeToggle writes via setMode() and
// dispatches a custom event so other components in the page rerender without
// a full reload.

export type UIMode = 'client' | 'team';

const KEY = 'zapusk.mode';
const EVENT = 'zapusk:mode';

export function getMode(): UIMode {
  try {
    return localStorage.getItem(KEY) === 'team' ? 'team' : 'client';
  } catch {
    return 'client';
  }
}

export function setMode(mode: UIMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // SSR / locked storage — silently ignore; in-memory state still updates via dispatch.
  }
  window.dispatchEvent(new CustomEvent<UIMode>(EVENT, { detail: mode }));
}

export function useMode(): [UIMode, (m: UIMode) => void] {
  const [mode, set] = useState<UIMode>(() => getMode());
  useEffect(() => {
    const handler = (e: Event) => set((e as CustomEvent<UIMode>).detail);
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
  return [mode, (m) => setMode(m)];
}
