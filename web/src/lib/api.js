import { getAuth } from './auth';
const BASE = import.meta.env.VITE_API_BASE_URL ?? '';
async function request(path, init = {}) {
    const auth = getAuth();
    const headers = {
        ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(auth ? { 'x-user-email': auth.email } : {}),
        ...(init.headers ?? {}),
    };
    const res = await fetch(`${BASE}${path}`, { ...init, headers });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${res.status} ${res.statusText}: ${text}`);
    }
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json'))
        return (await res.json());
    return (await res.text());
}
export const api = {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    patch: (path, body) => request(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
    delete: (path) => request(path, { method: 'DELETE' }),
    upload: (path, form) => request(path, { method: 'POST', body: form }),
};
