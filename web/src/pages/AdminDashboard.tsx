import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity, BriefcaseBusiness, CheckCircle2, Copy, FileText, Mail,
  Radio, Settings, ShieldCheck, Users, UserPlus,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { api } from '../lib/api';
import { impersonateUser } from '../components/layout/ImpersonationBanner';
import { getAuth } from '../lib/auth';
import { formatDate, formatMoney } from '../lib/format';

interface AdminProjectRow {
  id: string;
  name: string;
  industry: string | null;
  raiseAmount: number | null;
  currency: string;
  status: string;
  updatedAt: string;
  user: { email: string; name: string | null };
  brief: { version: number; missingData: string | null; missingByCategory: string | null; updatedAt: string } | null;
  _count: { files: number; generatedPrompts: number; generatedDocs: number; artefactReviews: number };
}

interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  // Sprint 24: видим workspace state в админке для быстрого switch.
  role?: string;
  workspaceStatus?: string;
  lastLoginAt?: string | null;
  _count: { projects: number };
}

interface AdminDashboardResponse {
  kpis: {
    totalProjects: number;
    activeProjects: number;
    packagingProjects: number;
    aiLeadProjects: number;
    dealStageProjects: number;
    newLeads7d: number;
  };
  projects: AdminProjectRow[];
  users: AdminUserRow[];
}

export default function AdminDashboard() {
  const [data, setData] = useState<AdminDashboardResponse | null>(null);
  const location = useLocation();
  const section = location.pathname.split('/').pop() ?? 'admin';

  useEffect(() => {
    api.get<AdminDashboardResponse>('/api/admin/dashboard').then(setData);
  }, []);

  const title = section === 'projects' ? 'Админ · Все проекты'
    : section === 'users' ? 'Админ · Пользователи'
    : section === 'leads' ? 'Админ · Лиды'
      : section === 'materials' ? 'Админ · Материалы'
        : section === 'settings' ? 'Админ · Настройки'
          : section === 'invites' ? 'Админ · Приглашения'
            : 'Админ-панель';

  return (
    <AppLayout title={title}>
      {!data ? (
        <Card><div className="text-sm text-muted text-center py-8">Загрузка админ-панели…</div></Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
            <Kpi label="Всего проектов" value={data.kpis.totalProjects} icon={<BriefcaseBusiness size={15} />} />
            <Kpi label="Активных" value={data.kpis.activeProjects} icon={<Activity size={15} />} tone="success" />
            <Kpi label="На упаковке" value={data.kpis.packagingProjects} icon={<FileText size={15} />} tone="ai" />
            <Kpi label="С AI-лидами" value={data.kpis.aiLeadProjects} icon={<Radio size={15} />} tone="zapusk" />
            <Kpi label="Сделки" value={data.kpis.dealStageProjects} icon={<CheckCircle2 size={15} />} tone="success" />
            <Kpi label="Лиды за 7 дней" value={data.kpis.newLeads7d} icon={<UserPlus size={15} />} tone="ai" />
          </div>

          {(section === 'users') && <UsersTable users={data.users} />}
          {(section === 'settings') && <SettingsPanel />}
          {(section === 'leads' || section === 'materials') && <AdminMockSection kind={section} />}
          {(section === 'projects') && <AdminProjectsTable projects={data.projects} />}
          {(section === 'invites') && <InvitesPanel />}
          {(section === 'admin' || section === '') && (
            <>
              <AdminProjectsTable projects={data.projects} />
              <UsersTable users={data.users.slice(0, 6)} compact />
              <InvitesPanel compact />
            </>
          )}
        </div>
      )}
    </AppLayout>
  );
}

function Kpi({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone?: 'ai' | 'zapusk' | 'success' }) {
  const cls = tone === 'ai' ? 'text-ai-glow border-ai/30 bg-ai/12'
    : tone === 'zapusk' ? 'text-zapusk-400 border-zapusk/30 bg-zapusk/12'
      : tone === 'success' ? 'text-success border-success/30 bg-success/10'
        : 'text-secondary border-line bg-elevated';
  return (
    <Card padded className="min-h-[106px]">
      <div className={`w-8 h-8 rounded-md border flex items-center justify-center ${cls}`}>{icon}</div>
      <div className="text-2xl font-bold text-primary mt-3 font-num">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.11em] text-muted font-semibold mt-1">{label}</div>
    </Card>
  );
}

function AdminProjectsTable({ projects }: { projects: AdminProjectRow[] }) {
  return (
    <Card padded>
      <CardHeader
        title="Проекты платформы"
        subtitle="Операционный вид по всем проектам, материалам, AI-лидам и активности"
        action={<StatusBadge tone="danger" dot>admin only</StatusBadge>}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-muted">
              <th className="py-2 pr-4">Проект</th>
              <th className="py-2 pr-4">Клиент</th>
              <th className="py-2 pr-4">Стадия</th>
              <th className="py-2 pr-4">Менеджер</th>
              <th className="py-2 pr-4">Бриф</th>
              <th className="py-2 pr-4">Материалы</th>
              <th className="py-2 pr-4">AI-лиды</th>
              <th className="py-2 pr-4">Активность</th>
              <th className="py-2 pr-4">Статус</th>
              <th className="py-2 pr-4">Действия</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="border-t border-hairline hover:bg-surface/40 transition-colors align-top">
                <td className="py-3 pr-4">
                  <Link to={`/projects/${p.id}`} className="font-medium text-primary hover:text-zapusk-400">{p.name}</Link>
                  <div className="text-[11px] text-muted mt-0.5">{formatMoney(p.raiseAmount, p.currency)}</div>
                </td>
                <td className="py-3 pr-4 text-secondary">{p.user.name ?? p.user.email}</td>
                <td className="py-3 pr-4 text-secondary">{p.industry ?? '—'}</td>
                <td className="py-3 pr-4 text-secondary">Екатерина</td>
                <td className="py-3 pr-4">{briefBadge(p)}</td>
                <td className="py-3 pr-4 font-num">{p._count.files + p._count.generatedDocs + p._count.generatedPrompts}</td>
                <td className="py-3 pr-4"><StatusBadge tone={p.brief ? 'success' : 'neutral'}>{p.brief ? 'активны' : 'нет'}</StatusBadge></td>
                <td className="py-3 pr-4 text-xs text-muted">{formatDate(p.updatedAt)}</td>
                <td className="py-3 pr-4"><StatusBadge tone={p.status === 'ready' ? 'success' : p.status === 'packaging' ? 'zapusk' : 'neutral'}>{p.status}</StatusBadge></td>
                <td className="py-3 pr-4">
                  <div className="flex flex-wrap gap-1.5">
                    <Link to={`/projects/${p.id}`}><Button size="sm" variant="ghost">Открыть</Button></Link>
                    <Button size="sm" variant="ghost">Назначить</Button>
                    <Link to="/ai-leads"><Button size="sm" variant="ghost">Лиды</Button></Link>
                    <Link to={`/projects/${p.id}/review`}><Button size="sm" variant="ghost">Review</Button></Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function briefBadge(p: AdminProjectRow) {
  if (!p.brief) return <StatusBadge tone="warning">нет</StatusBadge>;
  if (p.brief.missingByCategory || p.brief.missingData) return <StatusBadge tone="ai">v{p.brief.version} · вопросы</StatusBadge>;
  return <StatusBadge tone="success">v{p.brief.version}</StatusBadge>;
}

// Sprint 24: workspace status human labels + tone-маппинг.
const STATUS_RU: Record<string, string> = {
  lead: 'Лид',
  demo: 'Демо',
  approved: 'Одобрен',
  awaiting_payment: 'Ждёт оплату',
  active: 'Активен',
  paused: 'На паузе',
  archived: 'Архив',
};
const STATUS_TONE_ADMIN: Record<string, 'neutral' | 'ai' | 'warning' | 'success' | 'danger'> = {
  lead: 'neutral',
  demo: 'ai',
  approved: 'ai',
  awaiting_payment: 'warning',
  active: 'success',
  paused: 'warning',
  archived: 'danger',
};

// Sprint 29 — фильтры по workspaceStatus, чтобы invited users не «пропадали»
// визуально из-за длинной таблицы. Все варианты + явная категория «инвайты
// без регистрации» (не пользователи как таковые, но видны как ожидающие).
type UsersFilter = 'all' | 'active' | 'demo' | 'awaiting_payment' | 'archived' | 'pending_invites';

const USERS_FILTERS: Array<{ id: UsersFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Активные' },
  { id: 'demo', label: 'Демо' },
  { id: 'awaiting_payment', label: 'Ожидают оплаты' },
  { id: 'archived', label: 'Архивные' },
  { id: 'pending_invites', label: 'Инвайты без регистрации' },
];

function UsersTable({ users, compact }: { users: AdminUserRow[]; compact?: boolean }) {
  const [list, setList] = useState<AdminUserRow[]>(users);
  const [updating, setUpdating] = useState<string | null>(null);
  const [filter, setFilter] = useState<UsersFilter>('all');
  const me = getAuth();

  useEffect(() => { setList(users); }, [users]);

  const filtered = list.filter((u) => {
    if (filter === 'all') return true;
    if (filter === 'pending_invites') return false; // pending invites живут отдельно, в InvitesPanel
    const status = u.workspaceStatus ?? 'lead';
    return status === filter;
  });

  // Sprint 25 — impersonate: SUPER_ADMIN может войти как кто угодно, ADMIN
  // может войти как кто угодно кроме SUPER_ADMIN. И не в собственный аккаунт.
  function canImpersonate(target: AdminUserRow): boolean {
    if (!me) return false;
    if (me.userId === target.id) return false;
    const targetRole = (target.role ?? 'FOUNDER').toUpperCase();
    if (targetRole === 'SUPER_ADMIN' && me.role !== 'SUPER_ADMIN') return false;
    return me.role === 'SUPER_ADMIN' || me.role === 'ADMIN';
  }

  async function doImpersonate(userId: string) {
    setUpdating(userId);
    try {
      await impersonateUser(userId);
      // impersonateUser сделает window.location.assign — это перезагрузит SPA.
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Не удалось войти как пользователь');
      setUpdating(null);
    }
  }

  // Sprint 24 — быстрая активация рабочего кабинета. Меняет workspaceStatus
  // на 'active'. Demo проекты у пользователя пропадают, появляется пустой
  // боевой кабинет (см. /api/projects filter в Sprint 24).
  async function activate(userId: string) {
    setUpdating(userId);
    try {
      const r = await api.patch<{ user: AdminUserRow }>(`/api/admin/users/${userId}/status`, {
        workspaceStatus: 'active',
      });
      setList((cur) => cur.map((u) => (u.id === userId ? { ...u, ...r.user } : u)));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Не удалось активировать');
    } finally {
      setUpdating(null);
    }
  }

  async function moveToDemo(userId: string) {
    if (!window.confirm('Перевести пользователя в демо-режим? Его рабочие проекты сохранятся, но он будет видеть только демо-витрину.')) return;
    setUpdating(userId);
    try {
      const r = await api.patch<{ user: AdminUserRow }>(`/api/admin/users/${userId}/status`, {
        workspaceStatus: 'demo',
      });
      setList((cur) => cur.map((u) => (u.id === userId ? { ...u, ...r.user } : u)));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Не удалось перевести');
    } finally {
      setUpdating(null);
    }
  }

  return (
    <Card padded>
      <CardHeader
        title="Пользователи платформы"
        subtitle={compact ? 'Последние подключённые пользователи и их режим' : 'Все пользователи: роль, режим кабинета, активность'}
        action={<Users size={16} className="text-muted" />}
      />
      {!compact && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {USERS_FILTERS.map((f) => {
            const count = f.id === 'all'
              ? list.length
              : f.id === 'pending_invites'
                ? null // показываем счёт из InvitesPanel
                : list.filter((u) => (u.workspaceStatus ?? 'lead') === f.id).length;
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`h-8 px-3 rounded-md text-xs border transition-all ${
                  active
                    ? 'bg-zapusk/15 text-primary border-zapusk/40'
                    : 'bg-surface text-secondary border-line hover:border-zapusk/30'
                }`}
              >
                {f.label}
                {count !== null && <span className="ml-1.5 text-muted font-num">{count}</span>}
              </button>
            );
          })}
        </div>
      )}
      {filter === 'pending_invites' && (
        <div className="rounded-md border border-warning/25 bg-warning/6 px-3 py-2.5 mb-3 text-xs text-secondary">
          Инвайты без регистрации показаны ниже в разделе «Приглашения» — это не пользователи, а ожидающие токены.
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-muted">
              <th className="py-2 pr-4">Пользователь</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Роль</th>
              <th className="py-2 pr-4">Режим кабинета</th>
              <th className="py-2 pr-4">Проектов</th>
              <th className="py-2 pr-4">Создан</th>
              <th className="py-2 pr-4">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-xs text-muted">Нет пользователей под текущим фильтром.</td></tr>
            )}
            {filtered.map((u) => {
              const status = u.workspaceStatus ?? 'lead';
              const tone = STATUS_TONE_ADMIN[status] ?? 'neutral';
              return (
                <tr key={u.id} className="border-t border-hairline">
                  <td className="py-3 pr-4 font-medium text-primary">{u.name ?? u.email}</td>
                  <td className="py-3 pr-4 text-secondary">{u.email}</td>
                  <td className="py-3 pr-4 text-xs text-secondary">{u.role ?? 'client'}</td>
                  <td className="py-3 pr-4">
                    <StatusBadge tone={tone} dot>{STATUS_RU[status] ?? status}</StatusBadge>
                  </td>
                  <td className="py-3 pr-4 font-num">{u._count.projects}</td>
                  <td className="py-3 pr-4 text-xs text-muted">{formatDate(u.createdAt)}</td>
                  <td className="py-3 pr-4">
                    <div className="flex gap-1.5 flex-wrap">
                      {status !== 'active' && (
                        <Button
                          size="sm"
                          variant="primary"
                          loading={updating === u.id}
                          onClick={() => activate(u.id)}
                        >
                          Активировать кабинет
                        </Button>
                      )}
                      {status === 'active' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={updating === u.id}
                          onClick={() => moveToDemo(u.id)}
                        >
                          В демо
                        </Button>
                      )}
                      {/* Sprint 25 — impersonate, доступен SUPER_ADMIN/ADMIN.
                          SUPER_ADMIN target пропускаем (защита от случайного
                          захода в чужой owner-аккаунт). */}
                      {canImpersonate(u) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={updating === u.id}
                          onClick={() => doImpersonate(u.id)}
                        >
                          Войти как
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SettingsPanel() {
  return (
    <Card padded accent="zapusk">
      <CardHeader title="Настройки платформы" subtitle="MVP: только обзор безопасных статусов, без секретов и env" action={<Settings size={16} className="text-muted" />} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Setting label="OpenAI" value="Настроен в Render ENV" />
        <Setting label="Render" value="GitHub auto deploy активен" />
        <Setting label="Admin routes" value="Защищены demo-role guard" />
      </div>
    </Card>
  );
}

function AdminMockSection({ kind }: { kind: string }) {
  const isLeads = kind === 'leads';
  return (
    <Card padded accent="ai">
      <CardHeader
        title={isLeads ? 'Все лиды' : 'Все материалы'}
        subtitle={isLeads ? 'MVP показывает агрегированный demo-pipeline' : 'MVP показывает материалы через проекты и demo-assets'}
      />
      <div className="rounded-md border border-hairline bg-canvas/45 p-4 text-sm text-secondary">
        {isLeads ? 'Единая таблица лидов будет подключена после появления persisted ProjectLead model. Сейчас лиды доступны в AI-лидах каждого проекта.' : 'Глобальная библиотека материалов будет подключена после ProjectMaterial model. Сейчас материалы видны в карточке проекта.'}
      </div>
    </Card>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-canvas/45 px-3 py-3">
      <div className="flex items-center gap-2 text-sm font-medium text-primary"><ShieldCheck size={14} className="text-success" />{label}</div>
      <div className="text-xs text-muted mt-1">{value}</div>
    </div>
  );
}

// Sprint 22 — Invites panel.
// Админ создаёт invite (email опц. + role + workspaceStatus + срок),
// получает ссылку, копирует и шлёт пользователю. Single-use, revocable.

interface InviteRow {
  id: string;
  token: string;
  email: string | null;
  role: string;
  workspaceStatus: string;
  usedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  note: string | null;
  createdAt: string;
  createdBy: { email: string; name: string | null };
}

const WORKSPACE_OPTIONS = [
  { value: 'active', label: 'Active — полный доступ' },
  { value: 'demo', label: 'Demo — read-only режим' },
  { value: 'approved', label: 'Approved — одобрен, ждёт оплаты' },
  { value: 'awaiting_payment', label: 'Awaiting payment' },
  { value: 'lead', label: 'Lead — нет доступа до approval' },
];
// Sprint 25 — новые RBAC роли. SUPER_ADMIN скрываем из обычных invite'ов
// (создание owner аккаунта — через bootstrap seed, не через invite).
const ROLE_OPTIONS = [
  { value: 'FOUNDER', label: 'FOUNDER · фаундер' },
  { value: 'MANAGER', label: 'MANAGER · менеджер ZAPUSK AI' },
  { value: 'ADMIN', label: 'ADMIN · администратор' },
  { value: 'INVESTOR', label: 'INVESTOR · инвестор' },
];

function InvitesPanel({ compact }: { compact?: boolean }) {
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('FOUNDER');
  const [workspaceStatus, setWorkspaceStatus] = useState('active');
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  async function load() {
    const r = await api.get<{ invites: InviteRow[] }>('/api/admin/invites');
    setInvites(r.invites);
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api.post('/api/admin/invites', {
        email: email.trim() || undefined,
        role,
        workspaceStatus,
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
        note: note.trim() || undefined,
      });
      setEmail(''); setNote('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать приглашение');
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm('Отозвать это приглашение? Ссылка станет недействительной.')) return;
    try {
      await api.post(`/api/admin/invites/${id}/revoke`);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось отозвать');
    }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/signup?invite=${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken((c) => c === token ? null : c), 1500);
    });
  }

  return (
    <Card padded accent="zapusk">
      <CardHeader
        title="Приглашения в платформу"
        subtitle="Invite-only архитектура: создаёте ссылку и отправляете клиенту"
        action={<Mail size={16} className="text-zapusk-400" />}
      />

      {!compact && (
        <form onSubmit={create} className="rounded-md border border-hairline bg-canvas/45 p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Email (опционально)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="founder@startup.com"
              hint="Если указан, приглашение строго под этот email"
            />
            <Input
              label="Срок действия (дней)"
              type="number"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              placeholder="30"
              hint="Пусто = бессрочно"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Select label="Роль" value={role} onChange={(e) => setRole(e.target.value)} options={ROLE_OPTIONS} />
            <Select label="Workspace status" value={workspaceStatus} onChange={(e) => setWorkspaceStatus(e.target.value)} options={WORKSPACE_OPTIONS} />
          </div>
          <Input
            label="Комментарий"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Например: «Demo для Главснаб, после звонка 12.05»"
          />
          {error && <div className="text-xs text-danger">{error}</div>}
          <div className="flex justify-end">
            <Button type="submit" loading={creating} iconLeft={<UserPlus size={13} />}>
              Создать приглашение
            </Button>
          </div>
        </form>
      )}

      {invites === null ? (
        <p className="text-sm text-muted text-center py-6">Загрузка…</p>
      ) : invites.length === 0 ? (
        <EmptyState icon={<Mail size={20} />} title="Приглашений пока нет" description="Создайте первое приглашение, чтобы пустить пользователя в платформу." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-muted">
                <th className="py-2 pr-4">Email / Note</th>
                <th className="py-2 pr-4">Role / Status</th>
                <th className="py-2 pr-4">Статус</th>
                <th className="py-2 pr-4">Создано</th>
                <th className="py-2 pr-4">Действия</th>
              </tr>
            </thead>
            <tbody>
              {invites.slice(0, compact ? 5 : 100).map((inv) => {
                const used = Boolean(inv.usedAt);
                const revoked = Boolean(inv.revokedAt);
                const expired = inv.expiresAt && new Date(inv.expiresAt) < new Date();
                const stateTone = used ? 'success' : revoked ? 'danger' : expired ? 'warning' : 'ai';
                const stateLabel = used ? 'использовано'
                  : revoked ? 'отозвано'
                  : expired ? 'истекло'
                  : 'активно';
                return (
                  <tr key={inv.id} className="border-t border-hairline">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-primary">{inv.email ?? <span className="text-muted">любой email</span>}</div>
                      {inv.note && <div className="text-[11px] text-muted mt-0.5">{inv.note}</div>}
                    </td>
                    <td className="py-3 pr-4 text-secondary text-xs">
                      {inv.role} / {inv.workspaceStatus}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge tone={stateTone} dot>{stateLabel}</StatusBadge>
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted">{formatDate(inv.createdAt)}</td>
                    <td className="py-3 pr-4">
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={used || revoked || Boolean(expired)}
                          iconLeft={<Copy size={11} />}
                          onClick={() => copyLink(inv.token)}
                        >
                          {copiedToken === inv.token ? 'Скопировано' : 'Ссылка'}
                        </Button>
                        {!used && !revoked && (
                          <Button size="sm" variant="ghost" onClick={() => revoke(inv.id)}>Отозвать</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
