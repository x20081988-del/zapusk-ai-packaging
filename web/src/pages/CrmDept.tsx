import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, FileText, Inbox, RefreshCw } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { CrmNav } from '../components/crm/CrmNav';
import { BTN, TaskCard } from '../components/crm/TaskCard';
import { DueChip } from '../components/crm/DueChip';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { SnapshotBanner } from '../components/ui/SnapshotBanner';
import { SegmentedTabs } from '../components/ui/Chip';
import { DecideError, decisionErrorText } from '../lib/decide';
import { SOURCE_FAILURE_COPY } from '../lib/sourceFailure';
import {
  crmwebAct,
  crmwebAnswer,
  crmwebSetDept,
  fetchCrmwebDept,
  fetchCrmwebRun,
  type DeptDoc,
  type DeptDone,
  type DeptPayload,
  type DeptTask,
  type PmRun,
} from '../lib/crmweb';
import { DaysPicker, readDays, storeDays } from './CrmDepts';

// Sprint 66 - страница отдела: текущие задачи (с теми же кнопками, что на /crm),
// документы к подготовке, сделанное за период с резолюциями, реестр документов.
// Перенос задачи в другой отдел - ручная привязка в источнике, правил она главнее.

type Status =
  | { phase: 'loading' }
  | { phase: 'ready'; dept: DeptPayload }
  | { phase: 'failed'; failure: DecideError };

type Tab = 'open' | 'done' | 'docs';

const SOURCE_LABEL: Record<string, string> = {
  reports: 'разбор агента',
  downloads: 'Downloads',
  mail: 'черновик письма',
};

export function CrmDept() {
  const { code = '' } = useParams();
  const [status, setStatus] = useState<Status>({ phase: 'loading' });
  const [days, setDays] = useState<number>(readDays);
  const [tab, setTab] = useState<Tab>('open');
  const [refreshing, setRefreshing] = useState(false);
  const [runs, setRuns] = useState<Record<number, PmRun>>({});
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (inFlight.current) inFlight.current.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    if (isRefresh) setRefreshing(true);
    else setStatus({ phase: 'loading' });
    try {
      const dept = await fetchCrmwebDept(code, days, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setStatus({ phase: 'ready', dept });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setStatus({ phase: 'failed', failure: e instanceof DecideError ? e : new DecideError('unknown', String(e)) });
    } finally {
      if (inFlight.current === ctrl) inFlight.current = null;
      setRefreshing(false);
    }
  }, [code, days]);

  useEffect(() => {
    void load();
    return () => inFlight.current?.abort();
  }, [load]);

  const frozen = status.phase === 'ready' && status.dept.stale === true;

  // Поллинг живых прогонов - тот же контракт, что на /crm: раз в 4 секунды,
  // только пока вкладка видима и есть что опрашивать.
  const waitingRuns = useMemo(() => {
    const fromBoard = status.phase === 'ready'
      ? status.dept.cards.map((c) => c.run).filter((r): r is PmRun => Boolean(r?.waiting))
      : [];
    const merged = new Map<number, PmRun>();
    for (const r of fromBoard) merged.set(r.id, r);
    for (const r of Object.values(runs)) {
      if (r.waiting) merged.set(r.id, r);
      else merged.delete(r.id);
    }
    return [...merged.values()];
  }, [status, runs]);

  useEffect(() => {
    if (frozen || waitingRuns.length === 0) return;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      for (const r of waitingRuns) {
        try {
          const fresh = await fetchCrmwebRun(r.id);
          setRuns((prev) => ({ ...prev, [fresh.task_id]: fresh }));
          if (fresh.kind === 'decompose' && fresh.status === 'done' && r.waiting) {
            void load(true);
          }
        } catch {
          // недоступный опрос не должен ронять экран
        }
      }
    };
    const id = setInterval(() => void tick(), 4000);
    return () => clearInterval(id);
  }, [waitingRuns, frozen, load]);

  async function act(taskId: number, kind: 'do' | 'decompose' = 'do') {
    if (frozen) return;
    const res = await crmwebAct(taskId, kind);
    setRuns((prev) => ({ ...prev, [taskId]: res.run }));
  }

  async function answer(runId: number, taskId: number, text: string) {
    if (frozen) return;
    const res = await crmwebAnswer(runId, text);
    setRuns((prev) => ({ ...prev, [taskId]: res.run }));
  }

  const title = status.phase === 'ready' ? status.dept.name : 'Отдел';

  return (
    <AppLayout
      title={title}
      action={
        <Button variant="secondary" size="md" onClick={() => void load(true)} loading={refreshing}
          iconLeft={<RefreshCw className="w-4 h-4" />}>
          Обновить
        </Button>
      }
    >
      <div className="max-w-3xl">
        <CrmNav active={`/crm/depts/${code}`} />
        {frozen && status.phase === 'ready' && (
          <SnapshotBanner subject="отдела" fetchedAt={status.dept.fetched_at ?? null}
            onRetry={() => void load(true)} />
        )}

        <Link to="/crm/depts" className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary mb-3">
          <ArrowLeft className="w-3.5 h-3.5" /> Все отделы
        </Link>

        {status.phase === 'loading' && <LoadingSkeleton />}

        {status.phase === 'failed' && (
          <Card className="p-0">
            <EmptyState
              icon={<AlertTriangle className="w-6 h-6 text-danger" />}
              title={status.failure.failure === 'unknown' && /404/.test(status.failure.message)
                ? 'Такого отдела нет'
                : (SOURCE_FAILURE_COPY[status.failure.failure] ?? SOURCE_FAILURE_COPY.unknown).title}
              description={(SOURCE_FAILURE_COPY[status.failure.failure] ?? SOURCE_FAILURE_COPY.unknown).description}
              action={
                <Button variant="secondary" onClick={() => void load(true)} loading={refreshing}>
                  Повторить
                </Button>
              }
            />
          </Card>
        )}

        {status.phase === 'ready' && (
          <>
            <p className="text-sm text-secondary">{status.dept.desc}</p>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2 mb-4">
              <p className="text-xs text-muted">
                текущих <b className="text-primary">{status.dept.open_n}</b>
                {status.dept.over_n > 0 && <span className="text-danger"> · {status.dept.over_n} просрочено</span>}
                {status.dept.backlog.length > 0 && <span> · бэклог {status.dept.backlog.length}</span>}
              </p>
              <DaysPicker value={days} onChange={(d) => { storeDays(d); setDays(d); }} />
            </div>

            <div className="mb-5">
              <SegmentedTabs<Tab>
                value={tab}
                onChange={setTab}
                items={[
                  { value: 'open', label: 'Текущие', count: status.dept.cards.length },
                  { value: 'done', label: 'Сделано', count: status.dept.done.length },
                  { value: 'docs', label: 'Документы', count: status.dept.docs.length },
                ]}
              />
            </div>

            {tab === 'open' && (
              <OpenTab dept={status.dept} runs={runs} frozen={frozen}
                onAct={act} onAnswer={answer} onMutated={() => void load(true)} />
            )}
            {tab === 'done' && <DoneTab dept={status.dept} />}
            {tab === 'docs' && <DocsTab docs={status.dept.docs} days={status.dept.days} />}
          </>
        )}
      </div>
    </AppLayout>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Загрузка отдела">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-4">
          <div className="animate-pulse space-y-2.5">
            <div className="h-4 w-1/3 bg-hairline rounded" />
            <div className="h-3 w-2/3 bg-hairline rounded" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function OpenTab({
  dept, runs, frozen, onAct, onAnswer, onMutated,
}: {
  dept: DeptPayload;
  runs: Record<number, PmRun>;
  frozen: boolean;
  onAct: (taskId: number, kind?: 'do' | 'decompose') => Promise<void>;
  onAnswer: (runId: number, taskId: number, text: string) => Promise<void>;
  onMutated: () => void;
}) {
  const [showBacklog, setShowBacklog] = useState(false);
  return (
    <div className="space-y-3">
      {dept.docs_needed.length > 0 && (
        <Card className="p-3.5">
          <p className="text-sm font-semibold text-primary inline-flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-warning" /> Документы к подготовке
            <span className="text-muted font-normal">{dept.docs_needed.length}</span>
          </p>
          <ul className="mt-2 space-y-1">
            {dept.docs_needed.map((x) => (
              <li key={x.id} className="flex items-start gap-2 text-sm leading-snug min-w-0">
                <DueChip state={x.heat} label={x.heat_label} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="text-primary">{x.doc}</span>
                  <span className="text-secondary"> · {x.title}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {dept.cards.length === 0 ? (
        <Card className="p-0">
          <EmptyState icon={<Inbox className="w-6 h-6" />} title="Текущих задач нет"
            description="Все, что было в работе по отделу, закрыто или лежит в бэклоге." />
        </Card>
      ) : (
        dept.cards.map((t) => (
          <TaskCard key={t.id} task={t} run={runs[t.id] ?? t.run ?? null} frozen={frozen}
            onAct={onAct} onAnswer={onAnswer} onMutated={onMutated}
            footer={<DeptMove task={t} departments={dept.departments} frozen={frozen} onMoved={onMutated} />} />
        ))
      )}

      {dept.backlog.length > 0 && (
        <Card className="p-3.5">
          <button type="button" onClick={() => setShowBacklog((v) => !v)}
            className="w-full flex items-center gap-2 text-left text-sm text-secondary">
            {showBacklog ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Бэклог отдела <span className="text-muted">{dept.backlog.length}</span>
          </button>
          {showBacklog && (
            <ul className="mt-2 space-y-1">
              {dept.backlog.map((b) => (
                <li key={b.id} className="text-sm text-secondary leading-snug">
                  <span className="text-xs text-muted mr-1.5">#{b.id}</span>{b.title}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function DeptMove({
  task, departments, frozen, onMoved,
}: {
  task: DeptTask;
  departments: Array<{ code: string; name: string }>;
  frozen: boolean;
  onMoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted">
      <span>отдел:</span>
      <select value={task.dept} disabled={busy || frozen}
        onChange={(e) => {
          const next = e.target.value;
          if (next === task.dept) return;
          setBusy(true);
          setError('');
          crmwebSetDept(task.id, next)
            .then(() => onMoved())
            .catch((err) => setError(decisionErrorText(err)))
            .finally(() => setBusy(false));
        }}
        className={`${BTN} rounded-md bg-surface border border-line text-xs text-secondary focus:outline-none focus:border-zapusk/50 disabled:opacity-50`}>
        {departments.map((d) => (
          <option key={d.code} value={d.code}>{d.name}</option>
        ))}
      </select>
      {task.dept_manual && <span>закреплено вручную</span>}
      {task.doc_needed && <span className="text-warning">просит документ: {task.doc_needed}</span>}
      {error && <span className="text-danger">{error}</span>}
    </div>
  );
}

function DoneTab({ dept }: { dept: DeptPayload }) {
  const [showDropped, setShowDropped] = useState(false);
  return (
    <div className="space-y-3">
      {dept.done.length === 0 ? (
        <Card className="p-0">
          <EmptyState icon={<Inbox className="w-6 h-6" />} title={`За ${dept.days} дн. ничего не закрыто`}
            description="Закрытые задачи отдела появятся здесь с датой и резолюцией." />
        </Card>
      ) : (
        <Card className="p-3.5">
          <ul className="divide-y divide-line">
            {dept.done.map((x) => <DoneRow key={x.id} item={x} />)}
          </ul>
        </Card>
      )}
      {dept.dropped_n > 0 && (
        <Card className="p-3.5">
          <button type="button" onClick={() => setShowDropped((v) => !v)}
            className="w-full flex items-center gap-2 text-left text-sm text-secondary">
            {showDropped ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Снято без выполнения <span className="text-muted">{dept.dropped_n}</span>
          </button>
          {showDropped && (
            <ul className="mt-2 divide-y divide-line">
              {dept.dropped.map((x) => <DoneRow key={x.id} item={x} />)}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function DoneRow({ item }: { item: DeptDone }) {
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <div className="flex items-baseline gap-2 text-xs text-muted">
        <span className="shrink-0 tabular-nums">{item.date}</span>
        <span className="ml-auto shrink-0">#{item.id}</span>
      </div>
      <p className="text-sm text-primary leading-snug">{item.title}</p>
      {item.resolution && <p className="text-xs text-secondary mt-0.5 leading-snug">{item.resolution}</p>}
    </li>
  );
}

function DocsTab({ docs, days }: { docs: DeptDoc[]; days: number }) {
  const [kind, setKind] = useState<string>('');
  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) m.set(d.kind, (m.get(d.kind) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [docs]);
  const shown = kind ? docs.filter((d) => d.kind === kind) : docs;

  if (docs.length === 0) {
    return (
      <Card className="p-0">
        <EmptyState icon={<FileText className="w-6 h-6" />} title={`Документов за ${days} дн. нет`}
          description="Реестр собирается из разборов агента, корня Downloads и черновиков писем." />
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {kinds.length > 1 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          <button type="button" onClick={() => setKind('')}
            className={`rounded-full px-2.5 py-1 border ${kind === '' ? 'border-zapusk/60 bg-zapusk/10 text-primary' : 'border-line text-secondary'}`}>
            все {docs.length}
          </button>
          {kinds.map(([k, n]) => (
            <button key={k} type="button" onClick={() => setKind(k === kind ? '' : k)}
              className={`rounded-full px-2.5 py-1 border ${kind === k ? 'border-zapusk/60 bg-zapusk/10 text-primary' : 'border-line text-secondary'}`}>
              {k} {n}
            </button>
          ))}
        </div>
      )}
      <Card className="p-3.5">
        <ul className="divide-y divide-line">
          {shown.map((d) => (
            <li key={d.id} className="py-2 first:pt-0 last:pb-0">
              <div className="flex items-baseline gap-2 text-xs text-muted">
                <span className="shrink-0 tabular-nums">{d.date}</span>
                <span className="rounded bg-surface px-1.5 py-0.5 text-secondary">{d.kind}</span>
                <span className="ml-auto shrink-0">{SOURCE_LABEL[d.source] ?? d.source}</span>
              </div>
              <p className={`text-sm leading-snug ${d.missing ? 'text-secondary' : 'text-primary'}`}>{d.name}</p>
              <p className="text-xs text-muted mt-0.5">
                {d.exts.length > 0 ? d.exts.join(', ') : 'папка'}
                {d.versions > 1 && ` · ${d.versions} версии`}
                {d.missing && ' · в архиве, на маке файла нет'}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
