import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import { api } from '../lib/api';
import { setAuth } from '../lib/auth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Logo } from '../components/ui/Logo';

export default function Login() {
  const [email, setEmail] = useState('founder@zapusk.tech');
  const [name, setName] = useState('Zapusk Founder');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const res = await api.post<{ user: { email: string; name: string } }>('/api/auth/login', { email, name });
      setAuth({ email: res.user.email, name: res.user.name ?? email });
      navigate('/dashboard');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas relative overflow-hidden">
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
              <Rocket size={12} /> Рабочий стол проекта
            </div>
            <h1 className="text-2xl font-bold text-primary tracking-tight">Войти в систему</h1>
            <p className="text-sm text-secondary mt-1.5">
              Платформа ZAPUSK AI · подготовка проекта к разговору с инвестором
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
            />
            <Input
              label="Имя"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Как к вам обращаться"
            />
            {err && <div className="text-xs text-danger">{err}</div>}
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Войти
            </Button>
          </form>

          <div className="mt-5 pt-5 border-t border-hairline text-xs text-muted text-center">
            Ранний доступ. Один пользователь = одна сессия. Поддержка ролей и единый вход — следующий этап.
          </div>
        </div>
      </div>
    </div>
  );
}
