import { useEffect, useMemo, useState } from 'react';
import { Archive, Headphones, Pencil, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { MeetingCard } from '../components/ui/MeetingCard';
import { Modal } from '../components/ui/Modal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { StatusBadge } from '../components/ui/StatusBadge';
import { AddToKnowledgeBaseButton } from '../components/ui/AddToKnowledgeBaseButton';
import { archiveMeeting, listMeetings, type SalesSession } from '../lib/salesSessions';
import { api, type Project } from '../lib/api';
import {
  archiveOutcome,
  listOutcomes,
  OUTCOME_LABELS,
  OUTCOME_OPTIONS,
  updateOutcome,
  type AssistantOutcome,
  type OutcomeType,
} from '../lib/assistantOutcomes';
import { formatDate, formatMoney, formatPercent } from '../lib/format';

export default function Meetings() {
  const [sessions, setSessions] = useState<SalesSession[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [outcomesBySession, setOutcomesBySession] = useState<Record<string, AssistantOutcome[]>>({});
  const [outcomesError, setOutcomesError] = useState<string | null>(null);
  const [sessionToArchive, setSessionToArchive] = useState<SalesSession | null>(null);
  const [archivingSession, setArchivingSession] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ projects: Project[] }>('/api/projects').then((r) => setProjects(r.projects));
  }, []);

  useEffect(() => {
    let alive = true;
    setSessions(null);
    setOutcomesError(null);
    listMeetings(projectFilter ? { projectId: projectFilter } : {})
      .then(async (r) => {
        if (!alive) return;
        setSessions(r.sessions);
        const sessionIds = r.sessions.map((s) => s.id);
        if (sessionIds.length === 0) {
          setOutcomesBySession({});
          return;
        }
        const outcomeRes = await listOutcomes(projectFilter
          ? { projectId: projectFilter, salesSessionIds: sessionIds }
          : { salesSessionIds: sessionIds });
        if (!alive) return;
        const ids = new Set(r.sessions.map((s) => s.id));
        const grouped: Record<string, AssistantOutcome[]> = {};
        for (const outcome of outcomeRes.outcomes) {
          if (!outcome.salesSessionId || !ids.has(outcome.salesSessionId)) continue;
          (grouped[outcome.salesSessionId] ??= []).push(outcome);
        }
        setOutcomesBySession(grouped);
      })
      .catch((e) => {
        if (!alive) return;
        setOutcomesError(e instanceof Error ? e.message : 'outcomes_load_failed');
      });
    return () => { alive = false; };
  }, [projectFilter]);

  function replaceOutcome(outcome: AssistantOutcome) {
    if (!outcome.salesSessionId) return;
    setOutcomesBySession((prev) => ({
      ...prev,
      [outcome.salesSessionId!]: (prev[outcome.salesSessionId!] ?? []).map((x) => x.id === outcome.id ? outcome : x),
    }));
  }

  function removeOutcome(outcome: AssistantOutcome) {
    if (!outcome.salesSessionId) return;
    setOutcomesBySession((prev) => ({
      ...prev,
      [outcome.salesSessionId!]: (prev[outcome.salesSessionId!] ?? []).filter((x) => x.id !== outcome.id),
    }));
  }

  const filtered = useMemo(() => sessions ?? [], [sessions]);

  async function confirmArchiveSession() {
    if (!sessionToArchive) return;
    setArchivingSession(true);
    setArchiveError(null);
    try {
      await archiveMeeting(sessionToArchive.id);
      setSessions((current) => current?.filter((s) => s.id !== sessionToArchive.id) ?? current);
      setOutcomesBySession((current) => {
        const next = { ...current };
        delete next[sessionToArchive.id];
        return next;
      });
      setSessionToArchive(null);
    } catch (e) {
      setArchiveError(e instanceof Error ? e.message : 'Не удалось удалить встречу');
    } finally {
      setArchivingSession(false);
    }
  }

  return (
    <AppLayout
      title="Встречи с инвесторами"
      action={
        <Link to="/sales-assistant">
          <Button size="md" iconLeft={<Headphones size={14} />}>Провести встречу</Button>
        </Link>
      }
    >
      <Card padded className="mb-6">
        <CardHeader
          title="Память встреч"
          subtitle="Каждая завершённая встреча превращается в карточку сделки со следующим шагом и готовым продолжением общения"
          action={
            <div className="w-72">
              <Select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                options={[{ value: '', label: 'Все проекты' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </div>
          }
        />
      </Card>

      {sessions === null ? (
        <Card><div className="text-sm text-muted text-center py-8">Загрузка…</div></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Sparkles size={20} />}
            title="Встреч пока нет"
            description="Запустите AI-ассистента, проведите встречу и нажмите «Завершить встречу» — она появится здесь как карточка сделки с готовым продолжением общения."
            action={
              <Link to="/sales-assistant">
                <Button iconLeft={<Headphones size={14} />}>Провести первую встречу</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {outcomesError && (
            <Card padded>
              <div className="text-xs text-warning">Не удалось загрузить результаты встреч: {outcomesError}</div>
            </Card>
          )}
          {archiveError && (
            <Card padded>
              <div className="text-xs text-warning">{archiveError}</div>
            </Card>
          )}
          {filtered.map((s) => (
            <div key={s.id} className="relative">
              <MeetingCard session={s} />
              <SessionOutcomes
                outcomes={outcomesBySession[s.id] ?? []}
                onUpdated={replaceOutcome}
                onArchived={removeOutcome}
              />
              {/* Sprint 42 P0.3 — admin/manager CTA «Добавить в KB» сверху-справа
                  карточки. Hidden для FOUNDER (компонент сам себя гасит). */}
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <AddToKnowledgeBaseButton
                  salesSessionId={s.id}
                  defaultSourceType={s.tone === 'hot' ? 'successful_sale' : 'deal_case'}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  iconLeft={<Archive size={12} />}
                  onClick={() => setSessionToArchive(s)}
                  title="Удалить запись встречи"
                >
                  Удалить
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmModal
        open={Boolean(sessionToArchive)}
        title="Удалить запись встречи?"
        description="Запись будет скрыта из списка встреч. Архивирование не удаляет данные физически и сохраняет audit trail."
        confirmLabel="Удалить встречу"
        loading={archivingSession}
        onClose={() => setSessionToArchive(null)}
        onConfirm={confirmArchiveSession}
      />
    </AppLayout>
  );
}

function SessionOutcomes({
  outcomes,
  onUpdated,
  onArchived,
}: {
  outcomes: AssistantOutcome[];
  onUpdated: (outcome: AssistantOutcome) => void;
  onArchived: (outcome: AssistantOutcome) => void;
}) {
  const [editing, setEditing] = useState<AssistantOutcome | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function archive(item: AssistantOutcome) {
    const ok = window.confirm('Архивировать этот результат встречи? Он исчезнет из списков и Learning Dashboard.');
    if (!ok) return;
    setBusyId(item.id);
    setError(null);
    try {
      const r = await archiveOutcome(item.id);
      onArchived(r.outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'archive_failed');
    } finally {
      setBusyId(null);
    }
  }

  if (outcomes.length === 0) return null;

  return (
    <Card padded className="mt-2">
      <CardHeader
        title="Результаты встречи"
        subtitle="Что произошло после AI-подсказки. Архивные результаты скрываются из Learning Dashboard."
        action={<StatusBadge tone="info" dot>{outcomes.length}</StatusBadge>}
      />
      {error && <div className="text-xs text-warning mb-2">{error}</div>}
      <div className="space-y-2">
        {outcomes.map((o) => (
          <div key={o.id} className="rounded-md border border-hairline bg-canvas/40 px-3 py-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <StatusBadge tone={OUTCOME_OPTIONS.find((x) => x.value === o.outcomeType)?.tone ?? 'neutral'} dot>
                    {OUTCOME_LABELS[o.outcomeType] ?? o.outcomeType}
                  </StatusBadge>
                  <span className="text-[11px] text-muted">{formatDate(o.createdAt)}</span>
                  <span className="text-[11px] text-muted">linked advice: {o.adviceEventId ? 'yes' : 'no'}</span>
                </div>
                <div className="text-sm text-primary font-medium">{o.investorName || 'Инвестор без имени'}</div>
                <div className="text-xs text-secondary mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  <span>Вероятность: {formatPercent(o.probabilityAfter)}</span>
                  <span>Сумма: {formatMoney(o.valueRub)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="secondary" iconLeft={<Pencil size={12} />} onClick={() => setEditing(o)}>
                  Изменить
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  iconLeft={<Archive size={12} />}
                  loading={busyId === o.id}
                  onClick={() => archive(o)}
                >
                  Архивировать
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <EditOutcomeModal
          outcome={editing}
          onClose={() => setEditing(null)}
          onSaved={(outcome) => {
            onUpdated(outcome);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function EditOutcomeModal({
  outcome,
  onClose,
  onSaved,
}: {
  outcome: AssistantOutcome;
  onClose: () => void;
  onSaved: (outcome: AssistantOutcome) => void;
}) {
  const [outcomeType, setOutcomeType] = useState<OutcomeType>(outcome.outcomeType);
  const [investorName, setInvestorName] = useState(outcome.investorName ?? '');
  const [probabilityAfter, setProbabilityAfter] = useState(outcome.probabilityAfter == null ? '' : String(outcome.probabilityAfter));
  const [valueRub, setValueRub] = useState(outcome.valueRub == null ? '' : String(outcome.valueRub));
  const [note, setNote] = useState(outcome.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await updateOutcome(outcome.id, {
        outcomeType,
        investorName: investorName.trim() || null,
        probabilityAfter: probabilityAfter === '' ? null : Number(probabilityAfter),
        valueRub: valueRub === '' ? null : Number(valueRub),
        note: note.trim() || null,
      });
      onSaved(r.outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Изменить результат встречи" width="max-w-xl">
      <div className="p-4 sm:p-5 space-y-4">
        {error && <div className="text-xs text-warning">{error}</div>}
        <Select
          label="Тип результата"
          value={outcomeType}
          onChange={(e) => setOutcomeType(e.target.value as OutcomeType)}
          options={OUTCOME_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        <Input
          label="Инвестор"
          value={investorName}
          onChange={(e) => setInvestorName(e.target.value)}
          placeholder="Имя инвестора"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Вероятность, %"
            type="number"
            min={0}
            max={100}
            value={probabilityAfter}
            onChange={(e) => setProbabilityAfter(e.target.value)}
          />
          <Input
            label="Сумма, ₽"
            type="number"
            min={0}
            value={valueRub}
            onChange={(e) => setValueRub(e.target.value)}
          />
        </div>
        <Textarea
          label="Комментарий"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          hint="Комментарий не попадает в audit и CSV export."
        />
      </div>
      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-hairline bg-elevated px-4 py-3 sm:px-5">
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button loading={busy} onClick={save}>Сохранить</Button>
      </div>
    </Modal>
  );
}
