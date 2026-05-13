const KEY = 'zapusk.auth';

export type UserRole = 'client' | 'manager' | 'admin';

export interface AuthState {
  email: string;
  name: string;
  role: UserRole;
  /** Sprint 19: Bearer JWT, выданный POST /api/auth/{signup,login,demo}. */
  token: string | null;
  /** Optional userId — иногда полезно фронту. */
  userId?: string | null;
}

const ROLES: UserRole[] = ['client', 'manager', 'admin'];

export function normalizeRole(role: unknown): UserRole {
  return ROLES.includes(role as UserRole) ? role as UserRole : 'client';
}

export function getAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthState>;
    if (!parsed.email) return null;
    return {
      email: parsed.email,
      name: parsed.name ?? parsed.email,
      role: normalizeRole(parsed.role),
      token: parsed.token ?? null,
      userId: parsed.userId ?? null,
    };
  } catch {
    return null;
  }
}

export function setAuth(state: AuthState) {
  localStorage.setItem(KEY, JSON.stringify({ ...state, role: normalizeRole(state.role) }));
}

export function clearAuth() {
  localStorage.removeItem(KEY);
}

export function defaultRouteForRole(role: UserRole): string {
  if (role === 'admin') return '/admin';
  if (role === 'manager') return '/manager';
  return '/dashboard';
}

export function roleLabel(role: UserRole): string {
  if (role === 'admin') return 'Админ';
  if (role === 'manager') return 'Менеджер';
  return 'Клиент';
}
