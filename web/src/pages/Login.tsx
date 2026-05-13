import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, UserRound, ShieldCheck, Handshake } from 'lucide-react';
import { api } from '../lib/api';
import { defaultRouteForRole, setAuth, type UserRole } from '../lib/auth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Logo } from '../components/ui/Logo';
import { SocialButtons } from '../components/auth/SocialButtons';

// Sprint 19: real email/password login + small «demo access» block внизу для
// разработки и презентаций. Demo-блок визуально вторичный, чтобы основной
// сценарий для клиента — email/password.

interface AuthResponse {
  user: { id: string; email: string; name: string | null; role: UserRole };
  token: string;
}

export default function Login() {
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
            <h1 className="text-2xl font-bold text-primary tracking-tight">Войти в аккаунт</h1>
            <p className="text-sm text-secondary mt-1.5">
              Продолжите подготовку проекта к привлечению инвестиций через ZAPUSK AI.
            </p>
          </div>

          <SocialButtons />

          <Divider>или продолжить с email</Divider>

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

          <div className="mt-5 text-center text-sm text-secondary">
            Нет аккаунта?{' '}
            <Link to="/signup" className="text-zapusk-400 hover:text-zapusk-300 font-semibold">
              Создать аккаунт
            </Link>
          </div>
        </div>

        {/* Sprint 19: «Демо-доступ» — визуально вторичный блок, для разработки
            и презентаций. Реальный клиент сюда не пойдёт, но команде и
            инвесторам удобно одним кликом войти под нужной ролью. */}
        <DemoAccess loading={demoLoading} onPick={loginAsDemo} />
      </div>
    </div>
  );
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-hairline" />
      <span className="text-[11px] uppercase tracking-[0.12em] text-muted font-semibold">{children}</span>
      <div className="flex-1 h-px bg-hairline" />
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
        Демо-вход не требует пароля и доступен только на пробном инстансе. На production
        отключается через `DISABLE_DEMO_LOGIN`.
      </p>
    </div>
  );
}

function translateAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('401') || msg.includes('invalid_credentials')) return 'Неверный email или пароль.';
  if (msg.includes('409') || msg.includes('email_taken')) return 'Этот email уже зарегистрирован.';
  if (msg.includes('validation_failed')) return 'Проверьте заполнение формы.';
  if (msg.includes('400')) return 'Запрос отклонён. Проверьте поля.';
  if (msg.includes('403') || msg.includes('demo_login_disabled')) return 'Демо-вход на этом инстансе отключён.';
  return 'Не удалось войти. Попробуйте ещё раз.';
}
