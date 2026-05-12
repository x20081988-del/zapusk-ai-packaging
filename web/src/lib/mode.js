import { useEffect, useState } from 'react';
const KEY = 'zapusk.mode';
const EVENT = 'zapusk:mode';
export function getMode() {
    try {
        return localStorage.getItem(KEY) === 'team' ? 'team' : 'client';
    }
    catch {
        return 'client';
    }
}
export function setMode(mode) {
    try {
        localStorage.setItem(KEY, mode);
    }
    catch {
        // SSR / locked storage — silently ignore; in-memory state still updates via dispatch.
    }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }));
}
export function useMode() {
    const [mode, set] = useState(() => getMode());
    useEffect(() => {
        const handler = (e) => set(e.detail);
        window.addEventListener(EVENT, handler);
        return () => window.removeEventListener(EVENT, handler);
    }, []);
    return [mode, (m) => setMode(m)];
}
