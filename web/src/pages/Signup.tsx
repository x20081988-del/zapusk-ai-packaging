import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Mail, Rocket, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { defaultRouteForRole, setAuth, type UserRole, type WorkspaceStatus } from '../lib/auth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Logo } from '../components/ui/Logo';
import { StatusBadge } from '../components/ui/StatusBadge';

// Sprint 22 — invite-only architecture.
//
// Публичной регистрации больше нет. Страница работает только если в URL
// есть `?invite=<token>`:
//   1. Просим у бэка /api/auth/invite/:token инфу (валиден ли, на кого выпущен)
//   2. Если invite валиден — показываем форму signup с email pre-filled
//   3. После signup — Bearer token, переход в кабинет согласно role
//
// Без invite — компактный «Apply for access» экран с пояснением, как получить
// доступ (через demo + approval + invite).

interface InviteInfo {
  email: string | null;
  role: UserRole;
  workspaceStatus: WorkspaceStatus;
  note: string | null;
}

interface AuthResponse {
  user: { id: string; email: string; name: string | null; role: UserRole; workspaceStatus: WorkspaceStatus };
  token: string;
}

export default function Signup() {
  const [params] = useSearchParams();
  const inviteToken = params.get('invite') ?? '';
  const navigate = useNavigate();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Подтягиваем инфу об invite сразу после монтирования
  useEffect(() => {
    if (!inviteToken) return;
    setInviteLoading(true);
    setInviteError(null);
    api.get<{ invite: InviteInfo }>(`/api/auth/invite/${inviteToken}`)
      .then((r) => {
        setInvite(r.invite);
        if (r.invite.email) setEmail(r.invite.email);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('404')) setInviteError('Приглашение не найдено или уже использовано.');
        else if (msg.includes('410')) setInviteError('Срок действия приглашения истёк.');
        else setInviteError('Не удалось проверить приглашение.');
      })
      .finally(() => setInviteLoading(false));
  }, [inviteToken]);

  if (!inviteToken) {
    return <ApplyForAccessPage />;
  }

  function localValidate(): string | null {
    if (!name.trim()) return 'Укажите имя';
    if (!email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'Некорректный email';
    if (password.length < 8) return 'Пароль должен быть минимум 8 символов';
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = localValidate();
    if (v) { setErr(v); return; }
    setLoading(true);
    setErr(null);
    try {
      const res = await api.post<AuthResponse>('/api/auth/signup', {
        name: name.trim(),
        email: email.trim(),
        password,
        inviteToken,
      });
      setAuth({
        email: res.user.email,
        name: res.user.name ?? res.user.email,
        role: res.user.role,
        token: res.token,
        userId: res.user.id,
        workspaceStatus: res.user.workspaceStatus,
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
              <Rocket size={12} /> Активация аккаунта
            </div>
            <h1 className="text-2xl font-bold text-primary tracking-tight">Создайте аккаунт по приглашению</h1>
            <p className="text-sm text-secondary mt-1.5">
              Завершите активацию и подключитесь к подготовке инвестиционной упаковки проекта.
            </p>
          </div>

          {inviteLoading && (
            <div className="text-sm text-muted text-center py-6">Проверяем приглашение...</div>
          )}

          {!inviteLoading && inviteError && (
            <div className="rounded-md border border-danger/30 bg-danger/8 p-4 text-sm text-danger">
              <div className="font-semibold mb-1">Приглашение не активно</div>
              <p>{inviteError}</p>
              <Link to="/login" className="block mt-3 text-zapusk-400 hover:text-zapusk-300 text-sm">
                Уже есть аккаунт? Войти
              </Link>
            </div>
          )}

          {!inviteLoading && invite && (
            <>
              <div className="rounded-md border border-success/30 bg-success/8 p-3 mb-4 flex items-start gap-2">
                <ShieldCheck size={14} className="text-success mt-0.5 shrink-0" />
                <div className="text-xs text-success leading-snug">
                  Приглашение проверено
                  {invite.email && <> · аккаунт для <span className="font-mono">{invite.email}</span></>}
                  {invite.note && <div className="text-[11px] text-muted mt-1">{invite.note}</div>}
                </div>
              </div>

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
                  disabled={Boolean(invite.email)}
                  hint={invite.email ? 'Приглашение выпущено на этот email' : undefined}
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
                  Активировать аккаунт
                </Button>
              </form>
            </>
          )}

          <div className="mt-5 text-center text-sm text-secondary">
            Уже есть аккаунт?{' '}
            <Link to="/login" className="text-zapusk-400 hover:text-zapusk-300 font-semibold">Войти</Link>
          </div>
        </div>

        <p className="text-[11px] text-muted text-center mt-4 leading-relaxed">
          ZAPUSK AI — закрытая инфраструктура подготовки проектов к привлечению инвестиций.
          Доступ выдаётся после demo и согласования с менеджером.
        </p>
      </div>
    </div>
  );
}

// «Apply for access» — экран без invite параметра. Объясняет, как получить
// доступ, и предлагает связаться с командой. Никакой публичной регистрации.
function ApplyForAccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas relative overflow-hidden py-10">
      <div className="absolute inset-0 bg-dot-grid opacity-50 pointer-events-none" />
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-zapusk/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md px-6">
        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        <div className="bg-surface border border-line rounded-xl p-7 shadow-lifted">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-zapusk-400 font-semibold mb-2">
            <Lock size={12} /> Доступ только по приглашению
          </div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">
            Доступ к ZAPUSK AI выдаётся после демо
          </h1>
          <p className="text-sm text-secondary mt-2 leading-relaxed">
            Оставьте заявку, мы покажем демо-кабинет, обсудим формат подключения и после одобрения
            отправим приглашение в платформу.
          </p>

          <div className="mt-5 rounded-md border border-hairline bg-canvas/45 p-4 space-y-2.5">
            <Step n={1} title="Заявка на демо" hint="Расскажите о проекте — мы покажем кабинет ZAPUSK AI в работе" />
            <Step n={2} title="Демо + знакомство" hint="Подберём формат привлечения и согласуем условия подключения" />
            <Step n={3} title="Приглашение в платформу" hint="После одобрения вы получите персональную ссылку для активации" />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mt-5">
            <a
              href="mailto:hello@zapusk.tech?subject=Запрос%20демо-доступа%20к%20ZAPUSK%20AI&body=Здравствуйте!%20Хотим%20посмотреть%20демо%20ZAPUSK%20AI%20по%20проекту:"
              className="flex-1"
            >
              <Button className="w-full" size="lg" iconLeft={<Mail size={14} />}>
                Запросить демо-доступ
              </Button>
            </a>
            <Link to="/login" className="flex-1">
              <Button variant="ghost" className="w-full" size="lg">
                Войти по приглашению
              </Button>
            </Link>
          </div>

          <div className="mt-5 pt-5 border-t border-hairline">
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <StatusBadge tone="ai" dot>Закрытая платформа</StatusBadge>
              <span>ZAPUSK AI работает только с подключёнными проектами</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-md border border-zapusk/30 bg-zapusk/10 text-zapusk-400 flex items-center justify-center text-xs font-bold shrink-0">
        {n}
      </div>
      <div>
        <div className="text-sm font-semibold text-primary leading-snug">{title}</div>
        <div className="text-[11px] text-muted mt-0.5 leading-snug">{hint}</div>
      </div>
    </div>
  );
}

function translateSignupError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('invite_invalid')) return 'Приглашение недействительно.';
  if (msg.includes('invite_used')) return 'Приглашение уже использовано.';
  if (msg.includes('invite_revoked')) return 'Приглашение отозвано администратором.';
  if (msg.includes('invite_expired')) return 'Срок действия приглашения истёк.';
  if (msg.includes('invite_email_mismatch')) return 'Email не совпадает с email из приглашения.';
  if (msg.includes('409') || msg.includes('email_taken')) return 'Этот email уже подключён к платформе. Войдите по приглашению.';
  if (msg.includes('validation_failed')) return 'Проверьте заполнение полей.';
  if (msg.includes('password_too_short')) return 'Пароль должен быть минимум 8 символов.';
  if (msg.includes('400')) return 'Запрос отклонён. Проверьте поля.';
  return 'Не удалось активировать аккаунт. Попробуйте ещё раз.';
}
