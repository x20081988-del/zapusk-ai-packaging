const KEY = 'zapusk.auth';
const ROLES = ['client', 'manager', 'admin'];
export function normalizeRole(role) {
    return ROLES.includes(role) ? role : 'client';
}
export function getAuth() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        if (!parsed.email)
            return null;
        return {
            email: parsed.email,
            name: parsed.name ?? parsed.email,
            role: normalizeRole(parsed.role),
        };
    }
    catch {
        return null;
    }
}
export function setAuth(state) {
    localStorage.setItem(KEY, JSON.stringify({ ...state, role: normalizeRole(state.role) }));
}
export function clearAuth() {
    localStorage.removeItem(KEY);
}
export function defaultRouteForRole(role) {
    if (role === 'admin')
        return '/admin';
    if (role === 'manager')
        return '/manager';
    return '/dashboard';
}
export function roleLabel(role) {
    if (role === 'admin')
        return 'Админ';
    if (role === 'manager')
        return 'Менеджер';
    return 'Клиент';
}
