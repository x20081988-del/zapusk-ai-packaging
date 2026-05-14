import { useEffect, useState } from 'react';
import {
  Archive, ArrowLeft, ChevronRight, Database, Download, FolderOpen, Headphones,
  RotateCcw, ShieldCheck, Star, UserRound, FileText,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { api } from '../lib/api';
import { getAuth } from '../lib/auth';
import { formatDate } from '../lib/format';

// Sprint 30 — Admin audit + archive page. Три вкладки:
//   1. Журнал действий — последние 200 audit events
//   2. Архив — soft-deleted projects / files / reviews / sessions / analyses
//   3. Резервная копия — кнопка скачать .db файл (super-admin only)

interface AuditEvent {
  id: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  payload: string | null;
  createdAt: string;
}

type ArchiveType = 'project' | 'file' | 'review' | 'sales_session' | 'conversation_analysis';

interface ArchivedItem {
  id: string;
  archivedAt?: string | null;
  name?: string;
  originalName?: string;
  investorName?: string | null;
  projectId?: string;
  artefactKey?: string;
  project?: { id: string; name: string };
  user?: { email: string; name: string | null };
}

const ARCHIVE_TYPES: Array<{ id: ArchiveType; label: string; icon: typeof FolderOpen }> = [
  { id: 'project', label: 'Проекты', icon: FolderOpen },
  { id: 'file', label: 'Файлы', icon: FileText },
  { id: 'review', label: 'Ревью', icon: Star },
  { id: 'sales_session', label: 'Встречи', icon: UserRound },
  { id: 'conversation_analysis', label: 'AI-разборы', icon: Headphones },
];

const ACTION_TONE: Record<string, 'danger' | 'warning' | 'ai' | 'success' | 'zapusk' | 'neutral'> = {
  'project.archive': 'danger',
  'file.archive': 'danger',
  'review.archive': 'danger',
  'sales_session.archive': 'danger',
  'conversation_analysis.archive': 'danger',
  'project.restore': 'success',
  'file.restore': 'success',
  'review.restore': 'success',
  'sales_session.restore': 'success',
  'conversation_analysis.restore': 'success',
  'invite.create': 'ai',
  'invite.revoke': 'warning',
  'user.status_change': 'zapusk',
  'user.impersonate': 'warning',
  'system.backup_download': 'zapusk',
};

export default function AdminAudit() {
  const auth = getAuth();
  const isSuperAdmin = auth?.role === 'SUPER_ADMIN';
  const [tab, setTab] = useState<'events' | 'archived' | 'backup'>('events');
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [archived, setArchived] = useState<Record<ArchiveType, ArchivedItem[] | null>>({
    project: null, file: null, review: null, sales_session: null, conversation_analysis: null,
  });
  const [archiveTab, setArchiveTab] = useState<ArchiveType>('project');
  const [restoring, setRestoring] = useState<string | null>(null);
  const [backupRunning, setBackupRunning] = useState(false);

  useEffect(() => {
    api.get<{ events: AuditEvent[] }>('/api/admin/audit').then((r) => setEvents(r.events));
  }, []);

  useEffect(() => {
    if (tab === 'archived' && archived[archiveTab] === null) {
      api.get<{ items: ArchivedItem[] }>(`/api/admin/archived/${archiveTab}`).then((r) => {
        setArchived((cur) => ({ ...cur, [archiveTab]: r.items }));
      });
    }
  }, [tab, archiveTab, archived]);

  async function restore(type: ArchiveType, id: string) {
    if (!window.confirm(`Восстановить запись из архива? Она снова появится у владельца.`)) return;
    setRestoring(id);
    try {
      await api.post(`/api/admin/restore/${type}/${id}`);
      setArchived((cur) => ({ ...cur, [type]: (cur[type] ?? []).filter((i) => i.id !== id) }));
      // Refresh events so the restore action shows up in log
      api.get<{ events: AuditEvent[] }>('/api/admin/audit').then((r) => setEvents(r.events));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Не удалось восстановить');
    } finally {
      setRestoring(null);
    }
  }

  async function downloadBackup() {
    if (!window.confirm('Скачать полный backup (.tar.gz): SQLite база + uploads + snapshots. Файл содержит passwordHashes — храните в зашифрованном месте.')) return;
    setBackupRunning(true);
    try {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth?.token}` },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `zapusk-backup-${ts}.tar.gz`;
      a.click();
      URL.revokeObjectURL(url);
      // Refresh events to show backup record
      api.get<{ events: AuditEvent[] }>('/api/admin/audit').then((r) => setEvents(r.events));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Не удалось скачать бэкап');
    } finally {
      setBackupRunning(false);
    }
  }

  return (
    <AppLayout
      title="Журнал и архив"
      action={
        <Link to="/admin">
          <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={14} />}>
            Админ-панель
          </Button>
        </Link>
      }
    >
      <Card padded className="mb-6">
        <div className="flex flex-wrap gap-1.5">
          <TabChip active={tab === 'events'} onClick={() => setTab('events')} label="Журнал действий" icon={<ShieldCheck size={13} />} />
          <TabChip active={tab === 'archived'} onClick={() => setTab('archived')} label="Архив" icon={<Archive size={13} />} />
          <TabChip active={tab === 'backup'} onClick={() => setTab('backup')} label="Резервная копия" icon={<Database size={13} />} />
        </div>
      </Card>

      {tab === 'events' && (
        <Card padded>
          <CardHeader
            title="Журнал действий"
            subtitle="Последние 200 событий: архивации, восстановления, статусы, импернсонации, бэкапы"
          />
          {events === null ? (
            <div className="py-8 text-center text-sm text-muted">Загрузка…</div>
          ) : events.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted">Событий пока нет.</div>
          ) : (
            <ul className="space-y-2">
              {events.map((e) => {
                const tone = ACTION_TONE[e.action] ?? 'neutral';
                let parsed: Record<string, unknown> | null = null;
                try { parsed = e.payload ? JSON.parse(e.payload) : null; } catch { parsed = null; }
                return (
                  <li key={e.id} className="rounded-md border border-hairline bg-canvas/40 px-3 py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge tone={tone} dot>{e.action}</StatusBadge>
                      <span className="text-xs text-muted">{e.targetType}{e.targetId ? ` · ${e.targetId.slice(0, 8)}` : ''}</span>
                      <span className="ml-auto text-[11px] text-muted">{formatDate(e.createdAt)}</span>
                    </div>
                    <div className="text-xs text-secondary mt-1">
                      {e.actorEmail ?? 'system'}{e.actorRole ? ` (${e.actorRole})` : ''}
                    </div>
                    {parsed && (
                      <pre className="text-[10px] text-muted mt-1 leading-relaxed overflow-x-auto">{JSON.stringify(parsed, null, 0).slice(0, 240)}</pre>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === 'archived' && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {ARCHIVE_TYPES.map((t) => (
              <TabChip
                key={t.id}
                active={archiveTab === t.id}
                onClick={() => setArchiveTab(t.id)}
                label={t.label}
                icon={<t.icon size={13} />}
                count={archived[t.id]?.length}
              />
            ))}
          </div>
          <Card padded>
            <CardHeader
              title={`Архив · ${ARCHIVE_TYPES.find((t) => t.id === archiveTab)?.label}`}
              subtitle="Soft-deleted записи. Восстановить — вернуть владельцу. Через 30 дней может быть физически удалено."
            />
            {archived[archiveTab] === null ? (
              <div className="py-8 text-center text-sm text-muted">Загрузка…</div>
            ) : archived[archiveTab]?.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted">Пусто.</div>
            ) : (
              <ul className="space-y-2">
                {archived[archiveTab]!.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 rounded-md border border-hairline bg-canvas/40 px-3 py-2.5">
                    <Archive size={14} className="text-muted mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-primary font-medium">
                        {item.name ?? item.originalName ?? item.investorName ?? item.artefactKey ?? item.id.slice(0, 8)}
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {item.project?.name ? `проект: ${item.project.name} · ` : ''}
                        {item.user?.email ? `владелец: ${item.user.email} · ` : ''}
                        архивирован {item.archivedAt ? formatDate(item.archivedAt) : '—'}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      iconLeft={<RotateCcw size={12} />}
                      loading={restoring === item.id}
                      onClick={() => restore(archiveTab, item.id)}
                    >
                      Восстановить
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {tab === 'backup' && (
        <Card padded>
          <CardHeader
            title="Резервная копия платформы"
            subtitle="Полный backup: SQLite база + uploads + pre-deploy snapshots — как tar.gz"
          />
          {!isSuperAdmin ? (
            <div className="rounded-md border border-warning/25 bg-warning/8 px-3 py-3 flex items-start gap-2">
              <ShieldCheck size={14} className="text-warning mt-0.5 shrink-0" />
              <div className="text-xs text-secondary">
                Backup доступен только владельцу платформы (SUPER_ADMIN). Файл содержит passwordHashes всех пользователей.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-secondary leading-relaxed max-w-2xl">
                Создаёт <code>.tar.gz</code> со всем содержимым платформы:
              </p>
              <ul className="text-xs text-secondary space-y-1 ml-4 list-disc">
                <li><code>db/prod.db</code> — вся SQLite база (пользователи, проекты, audit log)</li>
                <li><code>uploads/</code> — все загруженные файлы (презентации, финмодели, изображения)</li>
                <li><code>snapshots/</code> — pre-deploy snapshots последних 7 деплоев</li>
              </ul>
              <p className="text-xs text-secondary leading-relaxed max-w-2xl">
                Файл содержит <strong>passwordHashes</strong> и <strong>invite tokens</strong> — храните в зашифрованном off-site месте.
                Render автоматически снимает disk snapshots каждые 24ч (хранятся 7 дней) — этот backup дополнительный слой защиты.
              </p>
              <Button
                variant="primary"
                iconLeft={<Download size={14} />}
                loading={backupRunning}
                onClick={downloadBackup}
              >
                Скачать backup .tar.gz
              </Button>
            </div>
          )}
        </Card>
      )}
    </AppLayout>
  );
}

function TabChip({
  active, onClick, label, icon, count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 px-3 rounded-md text-xs flex items-center gap-1.5 border transition-all ${
        active
          ? 'bg-zapusk/15 text-primary border-zapusk/40'
          : 'bg-surface text-secondary border-line hover:border-zapusk/30'
      }`}
    >
      {icon}
      {label}
      {typeof count === 'number' && (
        <span className="text-muted font-num">{count}</span>
      )}
      <ChevronRight size={11} className={active ? 'text-zapusk-400' : 'text-muted'} />
    </button>
  );
}
