import { useEffect, useState } from 'react';
const KEY = 'zapusk.theme';
const EVENT = 'zapusk:theme';
export function getTheme() {
    try {
        return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
    }
    catch {
        return 'dark';
    }
}
export function setTheme(theme) {
    try {
        localStorage.setItem(KEY, theme);
    }
    catch {
        // ignore — in-memory still propagates via dispatch.
    }
    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', theme);
    }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: theme }));
}
export function useTheme() {
    const [theme, set] = useState(() => getTheme());
    useEffect(() => {
        const h = (e) => set(e.detail);
        window.addEventListener(EVENT, h);
        return () => window.removeEventListener(EVENT, h);
    }, []);
    return [theme, (t) => setTheme(t)];
}
