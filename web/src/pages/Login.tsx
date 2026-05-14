import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { defaultRouteForRole, setAuth, type UserRole, type WorkspaceStatus } from '../lib/auth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Logo } from '../components/ui/Logo';

// Sprint 25 — служебный вход для подключённых пользователей платформы.
//
// Никаких demo-кнопок, ?demo=1 escape-hatch, social mock'ов. Owner / admin /
// manager / fonder / investor — все логинятся через обычный email/password.
// Bootstrap accounts (Sprint 25) поднимают типовые аккаунты через
// BOOTSTRAP_*_PASSWORD env-переменные на старте.

interface AuthResponse {
  user: { id: string; email: string; name: string | null; role: UserRole; workspaceStatus?: WorkspaceStatus };
  token: string;
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const res = await api.post<AuthResponse>('/api/auth/login', { email: email.trim(), password });
      setAuth({
        email: res.user.email,
        name: res.user.name ?? res.user.email,
        role: res.user.role,
        token: res.token,
        userId: res.user.id,
        workspaceStatus: res.user.workspaceStatus ?? null,
        impersonatedBy: null,
      });
      navigate(defaultRouteForRole(res.user.role));
    } catch (e) {
      setErr(translateAuthError(e));
    } finally {
      setLoading(false);
    }
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

          <div className="mt-5 text-center text-sm text-secondary">
            Нет доступа?{' '}
            <Link to="/signup" className="text-zapusk-400 hover:text-zapusk-300 font-semibold">
              Запросить демо
            </Link>
          </div>
        </div>
      </div>
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
  return 'Не удалось войти. Попробуйте ещё раз.';
}
