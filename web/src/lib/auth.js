const KEY = 'zapusk.auth';
export function getAuth() {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
export function setAuth(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
}
export function clearAuth() {
    localStorage.removeItem(KEY);
}
