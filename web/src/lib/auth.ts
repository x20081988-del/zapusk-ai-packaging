const KEY = 'zapusk.auth';

// Sprint 25 — нормальная RBAC. role и workspaceStatus orthogonal.
// role — что человек делает (SUPER_ADMIN/ADMIN/MANAGER/FOUNDER/INVESTOR).
// workspaceStatus — в каком состоянии его аккаунт (lead → ... → active).
export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'FOUNDER' | 'INVESTOR';
export type WorkspaceStatus =
  | 'lead'
  | 'demo'
  | 'approved'
  | 'awaiting_payment'
  | 'active'
  | 'paused'
  | 'archived';

export interface AuthState {
  email: string;
  name: string;
  role: UserRole;
  /** Sprint 19: Bearer JWT, выданный POST /api/auth/{signup,login,demo}. */
  token: string | null;
  /** Optional userId — иногда полезно фронту. */
  userId?: string | null;
  /** Sprint 22: воронка доступа. */
  workspaceStatus?: WorkspaceStatus | null;
  /** Sprint 25: если admin зашёл «как X», тут — email/role реального оператора. */
  impersonatedBy?: { email: string; role: UserRole } | null;
}

const ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FOUNDER', 'INVESTOR'];

// Sprint 25 — back-compat для localStorage записей до миграции на RBAC.
const LEGACY_FRONT_MAP: Record<string, UserRole> = {
  admin: 'ADMIN',
  manager: 'MANAGER',
  client: 'FOUNDER',
  founder: 'FOUNDER',
  sales: 'MANAGER',
  demo: 'FOUNDER',
  viewer: 'FOUNDER',
  investor: 'INVESTOR',
};

export function normalizeRole(role: unknown): UserRole {
  const raw = String(role ?? '').trim();
  if (!raw) return 'FOUNDER';
  if (ROLES.includes(raw as UserRole)) return raw as UserRole;
  const lower = raw.toLowerCase();
  if (LEGACY_FRONT_MAP[lower]) return LEGACY_FRONT_MAP[lower];
  const upper = raw.toUpperCase();
  if (ROLES.includes(upper as UserRole)) return upper as UserRole;
  return 'FOUNDER';
}

const WORKSPACE_STATUSES: WorkspaceStatus[] = ['lead', 'demo', 'approved', 'awaiting_payment', 'active', 'paused', 'archived'];

export function normalizeWorkspaceStatus(s: unknown): WorkspaceStatus {
  return WORKSPACE_STATUSES.includes(s as WorkspaceStatus) ? (s as WorkspaceStatus) : 'lead';
}

/** Полный доступ — workspace активен. */
export function isWorkspaceActive(status: WorkspaceStatus | null | undefined): boolean {
  return status === 'active';
}

/** Видит UI, но writes блокируются — demo / approved / awaiting_payment. */
export function isWorkspaceReadonly(status: WorkspaceStatus | null | undefined): boolean {
  return status === 'demo' || status === 'approved' || status === 'awaiting_payment';
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
      workspaceStatus: parsed.workspaceStatus ? normalizeWorkspaceStatus(parsed.workspaceStatus) : null,
      impersonatedBy: parsed.impersonatedBy
        ? { email: parsed.impersonatedBy.email, role: normalizeRole(parsed.impersonatedBy.role) }
        : null,
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
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return '/admin';
  if (role === 'MANAGER') return '/manager';
  if (role === 'INVESTOR') return '/opportunities';
  return '/dashboard';
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'SUPER_ADMIN': return 'Владелец платформы';
    case 'ADMIN': return 'Админ';
    case 'MANAGER': return 'Менеджер';
    case 'INVESTOR': return 'Инвестор';
    default: return 'Фаундер';
  }
}
