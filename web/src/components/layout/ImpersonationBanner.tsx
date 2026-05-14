import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ShieldAlert } from 'lucide-react';
import { clearAuth, defaultRouteForRole, getAuth, roleLabel } from '../../lib/auth';

// Sprint 25 — красная плашка «Вы вошли как пользователь X».
//
// Виден когда admin зашёл через POST /api/admin/impersonate/:userId. Backend
// положил `impersonatedBy` в JWT claim. Фронт сохраняет это в AuthState и
// рендерит баннер сверху страницы.
//
// «Вернуться в свой аккаунт» = clearAuth + редирект на /login (admin введёт
// свои реальные credentials повторно — это безопаснее, чем хранить
// предыдущий токен в state).

export function ImpersonationBanner() {
  const auth = getAuth();
  const impersonated = auth?.impersonatedBy ?? null;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  if (!impersonated || !auth) return null;

  function returnToAdmin() {
    setLoading(true);
    clearAuth();
    // Sprint 25: после logout admin введёт свои real credentials заново.
    navigate('/login');
  }

  return (
    <div className="bg-danger/15 border-b-2 border-danger/40 px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3">
      <ShieldAlert size={16} className="text-danger shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-danger">
          Вы вошли как пользователь {auth.email} · {roleLabel(auth.role)}
        </div>
        <div className="text-[11px] text-secondary leading-snug">
          Impersonation активен. Реальный оператор: {impersonated.email} ({roleLabel(impersonated.role)}). Сессия действует 1 час.
        </div>
      </div>
      <button
        type="button"
        onClick={returnToAdmin}
        disabled={loading}
        className="text-[12px] font-semibold text-danger hover:text-primary px-3 py-1.5 rounded-md border border-danger/30 bg-canvas/60 hover:bg-danger/10 flex items-center gap-1.5 shrink-0 transition-colors"
      >
        <LogOut size={12} />
        Вернуться в свой аккаунт
      </button>
    </div>
  );
}

// Sprint 25 — helper для admin UI: вызвать impersonate из /admin/users.
// Возвращает Bearer + новый AuthState, который сохраняется в localStorage.
export async function impersonateUser(userId: string): Promise<void> {
  const { api } = await import('../../lib/api');
  const { setAuth } = await import('../../lib/auth');
  const res = await api.post<{
    user: { id: string; email: string; name: string | null; role: string; workspaceStatus?: string };
    token: string;
    impersonatedBy: { id: string; email: string };
  }>(`/api/admin/impersonate/${userId}`);

  const role = ((): import('../../lib/auth').UserRole => {
    const r = String(res.user.role).toUpperCase();
    if (r === 'SUPER_ADMIN' || r === 'ADMIN' || r === 'MANAGER' || r === 'INVESTOR') return r;
    return 'FOUNDER';
  })();

  // Сохраняем impersonatedBy от текущего оператора в AuthState.
  const currentAuth = getAuth();
  setAuth({
    email: res.user.email,
    name: res.user.name ?? res.user.email,
    role,
    token: res.token,
    userId: res.user.id,
    workspaceStatus: res.user.workspaceStatus as never,
    impersonatedBy: currentAuth
      ? { email: currentAuth.email, role: currentAuth.role }
      : { email: res.impersonatedBy.email, role: 'ADMIN' },
  });

  // Принудительная перезагрузка приложения, чтобы все компоненты получили
  // новый auth state из localStorage. Простой и надёжный способ для MVP.
  window.location.assign(defaultRouteForRole(role));
}
