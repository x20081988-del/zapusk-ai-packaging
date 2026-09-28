import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, FileText, Inbox, RefreshCw } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { CrmNav } from '../components/crm/CrmNav';
import { HEAT_DOT, HEAT_TEXT } from '../components/crm/TaskCard';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { SnapshotBanner } from '../components/ui/SnapshotBanner';
import { DecideError } from '../lib/decide';
import { SOURCE_FAILURE_COPY } from '../lib/sourceFailure';
import { fetchCrmwebDepts, type DeptSummary, type DeptsPayload } from '../lib/crmweb';

// Sprint 66 - CRM по отделам (владелец 28.09.2026: «разбей CRM по отделам:
// сопровождение клиентов, запуск эфиров, юридический...»). Отдел считает источник
// (crm_departments в telegram-agent) для КАЖДОЙ задачи реестра, а не только для
// портфеля проектов. Экран - витрина: счетчики, три горящие задачи, переход в отдел.

type Status =
  | { phase: 'loading' }
  | { phase: 'ready'; data: DeptsPayload }
  | { phase: 'failed'; failure: DecideError };

export const DAYS_OPTIONS = [30, 90, 180] as const;
const DAYS_KEY = 'crm.depts.days';

export function readDays(): number {
  try {
    const raw = Number(localStorage.getItem(DAYS_KEY));
    return (DAYS_OPTIONS as readonly number[]).includes(raw) ? raw : 90;
  } catch {
    return 90;
  }
}

export function storeDays(d: number) {
  try {
    localStorage.setItem(DAYS_KEY, String(d));
  } catch {
    // без localStorage экран живет с выбором на один заход
  }
}

export function DaysPicker({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-muted mr-1">сделано за</span>
      {DAYS_OPTIONS.map((d) => (
        <button key={d} type="button" onClick={() => onChange(d)}
          className={`rounded-full px-2.5 py-1 border transition-colors ${
            value === d ? 'border-zapusk/60 bg-zapusk/10 text-primary' : 'border-line text-secondary hover:text-primary'}`}>
          {d} дн.
        </button>
      ))}
    </div>
  );
}

export function CrmDepts() {
  const [status, setStatus] = useState<Status>({ phase: 'loading' });
  const [days, setDays] = useState<number>(readDays);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (inFlight.current) inFlight.current.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    if (isRefresh) setRefreshing(true);
    else setStatus({ phase: 'loading' });
    try {
      const data = await fetchCrmwebDepts(days, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setStatus({ phase: 'ready', data });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setStatus({ phase: 'failed', failure: e instanceof DecideError ? e : new DecideError('unknown', String(e)) });
    } finally {
      if (inFlight.current === ctrl) inFlight.current = null;
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
    return () => inFlight.current?.abort();
  }, [load]);

  const stale = status.phase === 'ready' && status.data.stale === true;

  return (
    <AppLayout
      title="Отделы"
      action={
        <Button variant="secondary" size="md" onClick={() => void load(true)} loading={refreshing}
          iconLeft={<RefreshCw className="w-4 h-4" />}>
          Обновить
        </Button>
      }
    >
      <div className="max-w-4xl">
        <CrmNav active="/crm/depts" />
        {stale && status.phase === 'ready' && (
          <SnapshotBanner subject="отделов" fetchedAt={status.data.fetched_at ?? null}
            onRetry={() => void load(true)} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <p className="text-sm text-secondary">
            Каждая задача реестра приписана к отделу. Текущее, сделанное и документы по каждому.
          </p>
          <DaysPicker value={days} onChange={(d) => { storeDays(d); setDays(d); }} />
        </div>

        {status.phase === 'loading' && <LoadingSkeleton />}

        {status.phase === 'failed' && (
          <Card className="p-0">
            <EmptyState
              icon={<AlertTriangle className="w-6 h-6 text-danger" />}
              title={(SOURCE_FAILURE_COPY[status.failure.failure] ?? SOURCE_FAILURE_COPY.unknown).title}
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
          status.data.departments.length === 0 ? (
            <Card className="p-0">
              <EmptyState icon={<Inbox className="w-6 h-6" />} title="Отделов нет"
                description="Таксономия отделов заводится в telegram-agent (crm_departments)." />
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {status.data.departments.map((d) => (
                <DeptCard key={d.code} dept={d} days={status.data.days} />
              ))}
            </div>
          )
        )}
      </div>
    </AppLayout>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Загрузка отделов">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="p-4">
          <div className="animate-pulse space-y-2.5">
            <div className="h-4 w-1/2 bg-surface rounded" />
            <div className="h-3 w-3/4 bg-surface rounded" />
            <div className="h-3 w-2/3 bg-surface rounded" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function DeptCard({ dept, days }: { dept: DeptSummary; days: number }) {
  const quiet = dept.open_n === 0 && dept.done_n === 0 && dept.docs_n === 0;
  return (
    <Card className={`p-4 flex flex-col ${dept.over_n > 0 ? 'border-l-2 border-l-danger/70' : ''}`}>
      <Link to={`/crm/depts/${dept.code}`} className="block">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${HEAT_DOT[dept.heat] ?? HEAT_DOT.none}`} />
          <span className="text-sm font-semibold text-primary">{dept.name}</span>
          <ChevronRight className="w-4 h-4 text-muted shrink-0 ml-auto" />
        </div>
        <p className="text-xs text-secondary mt-1">{dept.desc}</p>
      </Link>

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs">
        <span className="text-primary">
          текущих <b>{dept.open_n}</b>
          {dept.over_n > 0 && <span className="text-danger"> · {dept.over_n} просрочено</span>}
          {dept.over_n === 0 && dept.today_n > 0 && <span className="text-warning"> · {dept.today_n} сегодня</span>}
        </span>
        <span className="text-secondary">сделано <b>{dept.done_n}</b> за {days} дн.</span>
        <span className="text-secondary inline-flex items-center gap-1">
          <FileText className="w-3 h-3" /> {dept.docs_n} док.
        </span>
        {dept.doc_needed_n > 0 && (
          <span className="text-warning">к подготовке: {dept.doc_needed_n}</span>
        )}
        {dept.backlog_n > 0 && <span className="text-muted">бэклог {dept.backlog_n}</span>}
      </div>

      {dept.top.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-2.5">
          {dept.top.map((t) => (
            <li key={t.id} className="text-sm leading-snug">
              <span className={`text-xs mr-1.5 ${HEAT_TEXT[t.heat] ?? 'text-muted'}`}>{t.heat_label}</span>
              <span className="text-secondary">{t.title}</span>
            </li>
          ))}
        </ul>
      )}
      {quiet && <p className="mt-3 text-xs text-muted">Пока пусто.</p>}

      <p className="mt-auto pt-2.5 text-xs text-muted">{dept.last_done_label}</p>
    </Card>
  );
}
