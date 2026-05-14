const KEY = 'zapusk.auth';

// Sprint 22: invite-only architecture. Role и workspaceStatus orthogonal.
// role — что человек делает (admin/sales/client/demo/viewer/manager).
// workspaceStatus — в каком состоянии его аккаунт (lead → ... → active).
export type UserRole = 'client' | 'manager' | 'admin' | 'sales' | 'demo' | 'viewer';
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
}

const ROLES: UserRole[] = ['client', 'manager', 'admin', 'sales', 'demo', 'viewer'];

export function normalizeRole(role: unknown): UserRole {
  return ROLES.includes(role as UserRole) ? role as UserRole : 'client';
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
