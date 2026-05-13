import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import { api } from '../lib/api';
import { defaultRouteForRole, setAuth, type UserRole } from '../lib/auth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Logo } from '../components/ui/Logo';
import { SocialButtons } from '../components/auth/SocialButtons';

// Sprint 19: реальная регистрация по email/password.
// Backend: POST /api/auth/signup → 201 { user, token }.
// На клиенте — base validation (мин 8 символов) + server-side ошибки.

interface AuthResponse {
  user: { id: string; email: string; name: string | null; role: UserRole };
  token: string;
}

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  function localValidate(): string | null {
    if (!name.trim()) return 'Укажите имя';
    if (!email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'Некорректный email';
    if (password.length < 8) return 'Пароль должен быть минимум 8 символов';
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = localValidate();
    if (v) {
      setErr(v);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await api.post<AuthResponse>('/api/auth/signup', {
        name: name.trim(),
        email: email.trim(),
        password,
      });
      setAuth({
        email: res.user.email,
        name: res.user.name ?? res.user.email,
        role: res.user.role,
        token: res.token,
        userId: res.user.id,
      });
      navigate(defaultRouteForRole(res.user.role));
    } catch (e) {
      setErr(translateSignupError(e));
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
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-zapusk-400 font-semibold mb-2">
              <Rocket size={12} /> Регистрация
            </div>
            <h1 className="text-2xl font-bold text-primary tracking-tight">Создайте аккаунт</h1>
            <p className="text-sm text-secondary mt-1.5">
              Начните подготовку проекта к привлечению инвестиций через ZAPUSK AI.
            </p>
          </div>

          <SocialButtons />

          <Divider>или продолжить с email</Divider>

          <form onSubmit={submit} className="space-y-3">
            <Input
              label="Имя"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Иван Иванов"
            />
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              hint="Минимум 8 символов"
            />
            {err && <div className="text-xs text-danger">{err}</div>}
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Создать аккаунт
            </Button>
          </form>

          <div className="mt-5 text-center text-sm text-secondary">
            Уже есть аккаунт?{' '}
            <Link to="/login" className="text-zapusk-400 hover:text-zapusk-300 font-semibold">
              Войти
            </Link>
          </div>
        </div>

        <p className="text-[11px] text-muted text-center mt-4 leading-relaxed">
          Создавая аккаунт, вы соглашаетесь с обработкой данных проекта для подготовки инвестиционных материалов.
          Полную политику опубликуем перед публичным запуском.
        </p>
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

function translateSignupError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('409') || msg.includes('email_taken')) {
    return 'Этот email уже зарегистрирован. Попробуйте войти.';
  }
  if (msg.includes('validation_failed')) return 'Проверьте заполнение полей.';
  if (msg.includes('password_too_short')) return 'Пароль должен быть минимум 8 символов.';
  if (msg.includes('400')) return 'Запрос отклонён. Проверьте поля.';
  return 'Не удалось создать аккаунт. Попробуйте ещё раз.';
}
