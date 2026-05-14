import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles, UserRound, ShieldCheck, Handshake } from 'lucide-react';
import { api } from '../lib/api';
import { defaultRouteForRole, setAuth, type UserRole, type WorkspaceStatus } from '../lib/auth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Logo } from '../components/ui/Logo';

// Sprint 23 — служебный вход.
//
// /login видят только подключённые пользователи (клиенты после approval,
// менеджеры, команда платформы). Никаких social-кнопок, никакой ссылки
// «Создать аккаунт». Внешний пользователь → CTA «Запросить демо» → /signup
// (ApplyForAccessPage).
//
// /login?demo=1 — служебный URL для команды: внизу появляется блок «Демо-
// доступ для команды» с 3 кнопками (client/manager/admin). Без параметра
// эти кнопки скрыты — обычный посетитель их не видит.

interface AuthResponse {
  user: { id: string; email: string; name: string | null; role: UserRole; workspaceStatus?: WorkspaceStatus };
  token: string;
}

export default function Login() {
  const [params] = useSearchParams();
  const showDemo = params.get('demo') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<UserRole | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const res = await api.post<AuthResponse>('/api/auth/login', { email: email.trim(), password });
      finishLogin(res);
    } catch (e) {
      setErr(translateAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  async function loginAsDemo(role: UserRole) {
    setDemoLoading(role);
    setErr(null);
    try {
      const res = await api.post<AuthResponse>('/api/auth/demo', { role });
      finishLogin(res);
    } catch (e) {
      setErr(translateAuthError(e));
    } finally {
      setDemoLoading(null);
    }
  }

  function finishLogin(res: AuthResponse) {
    setAuth({
      email: res.user.email,
      name: res.user.name ?? res.user.email,
      role: res.user.role,
      token: res.token,
      userId: res.user.id,
      workspaceStatus: res.user.workspaceStatus ?? null,
    });
    navigate(defaultRouteForRole(res.user.role));
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas relative overflow-hidden py-10">
      <div className="absolute inset-0 bg-dot-grid opacity-50 pointer-events-none" />
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-zapusk/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-ai/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md px-6">
        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        <div className="bg-surface border border-line rounded-xl p-7 shadow-lifted">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-primary tracking-tight">Вход в ZAPUSK AI</h1>
            <p className="text-sm text-secondary mt-1.5">
              Для клиентов, менеджеров и команды платформы.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <Input
              label="Email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <Input
              label="Пароль"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            {err && <div className="text-xs text-danger">{err}</div>}
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Войти
            </Button>
          </form>

          {/* Sprint 23: CTA для внешнего пользователя без аккаунта. НЕ ведёт
              на публичную регистрацию — ведёт на /signup (ApplyForAccessPage),
              где предлагается оставить заявку на демо. */}
          <div className="mt-5 text-center text-sm text-secondary">
            Нет доступа?{' '}
            <Link to="/signup" className="text-zapusk-400 hover:text-zapusk-300 font-semibold">
              Запросить демо
            </Link>
          </div>
        </div>

        {/* Sprint 23: «Демо-доступ для команды» — теперь только под ?demo=1.
            Внешний посетитель этих кнопок не видит. Команда ходит по
            /login?demo=1 → один клик и попадает в нужную роль. */}
        {showDemo && (
          <DemoAccess loading={demoLoading} onPick={loginAsDemo} />
        )}
      </div>
    </div>
  );
}

function DemoAccess({
  loading, onPick,
}: { loading: UserRole | null; onPick: (role: UserRole) => void }) {
  return (
    <div className="mt-6 rounded-lg border border-hairline bg-canvas/45 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={13} className="text-zapusk-400" />
        <span className="text-[10px] uppercase tracking-[0.12em] text-zapusk-400 font-semibold">
          Демо-доступ для команды
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          iconLeft={<UserRound size={12} />}
          loading={loading === 'client'}
          onClick={() => onPick('client')}
        >
          Клиент
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          iconLeft={<Handshake size={12} />}
          loading={loading === 'manager'}
          onClick={() => onPick('manager')}
        >
          Менеджер
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          iconLeft={<ShieldCheck size={12} />}
          loading={loading === 'admin'}
          onClick={() => onPick('admin')}
        >
          Админ
        </Button>
      </div>
      <p className="text-[10px] text-muted mt-2 leading-snug">
        Служебный режим для команды и презентаций. Доступен по прямой ссылке
        /login?demo=1 и отключается через `DISABLE_DEMO_LOGIN` на customer tenant.
      </p>
    </div>
  );
}

function translateAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('workspace_archived')) return 'Аккаунт архивирован. Свяжитесь с командой ZAPUSK AI.';
  if (msg.includes('workspace_paused')) return 'Аккаунт приостановлен. Свяжитесь с менеджером.';
  if (msg.includes('401') || msg.includes('invalid_credentials')) return 'Неверный email или пароль.';
  if (msg.includes('409') || msg.includes('email_taken')) return 'Этот email уже занят.';
  if (msg.includes('validation_failed')) return 'Проверьте заполнение формы.';
  if (msg.includes('400')) return 'Запрос отклонён. Проверьте поля.';
  if (msg.includes('demo_login_disabled')) return 'Демо-вход на этом инстансе отключён.';
  return 'Не удалось войти. Попробуйте ещё раз.';
}
