import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Inbox, RefreshCw } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { CrmNav } from '../components/crm/CrmNav';
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
  fetchCrmwebDirection,
  fetchCrmwebProject,
  fetchCrmwebPm,
  fetchCrmwebRun,
  type PmDirection,
  type PmDirectionFull,
  type PmPayload,
  type PmProject,
  type PmProjectFull,
  type PmRun,
} from '../lib/crmweb';
import { BTN, HEAT_DOT, HEAT_TEXT, TaskCard } from '../components/crm/TaskCard';

// Sprint 63.P13 - экран «Проекты и задачи» (/pm из crm_web, один в один).
//
// Направления -> проекты -> задачи с чек-листами; кнопка «Сделать» запускает
// НАСТОЯЩИЙ прогон агента на маке (как по токен-ссылке), страница опрашивает
// прогон и показывает вопрос/итог. Источник правды в telegram-agent: экран
// ничего не считает - подсветки, сроки и лейблы пришли готовыми.

type Status =
  | { phase: 'loading' }
  | { phase: 'ready'; pm: PmPayload }
  | { phase: 'failed'; failure: DecideError };

export function CrmPm() {
  const [status, setStatus] = useState<Status>({ phase: 'loading' });
  const [tab, setTab] = useState<'dirs' | 'tasks'>('dirs');
  const [refreshing, setRefreshing] = useState(false);
  // Прогоны поверх пришедших с доской: после «Сделать» и при поллинге здесь
  // живет самое свежее состояние каждого прогона.
  const [runs, setRuns] = useState<Record<number, PmRun>>({});
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (inFlight.current) inFlight.current.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    if (isRefresh) setRefreshing(true);
    else setStatus({ phase: 'loading' });
    try {
      const pm = await fetchCrmwebPm(ctrl.signal);
      if (ctrl.signal.aborted) return;
      setStatus({ phase: 'ready', pm });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setStatus({ phase: 'failed', failure: e instanceof DecideError ? e : new DecideError('unknown', String(e)) });
    } finally {
      if (inFlight.current === ctrl) inFlight.current = null;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => inFlight.current?.abort();
  }, [load]);

  // Портфель показан из снимка: мак спит, мутации и прогоны не доедут.
  const frozen = status.phase === 'ready' && status.pm.stale === true;

  // Поллинг живых прогонов: раз в 4 секунды, только пока вкладка видима и есть
  // что опрашивать. Фоновый цикл без живого прогона жег бы туннель впустую.
  const waitingRuns = useMemo(() => {
    const fromBoard = status.phase === 'ready'
      ? status.pm.cards.map((c) => c.run).filter((r): r is PmRun => Boolean(r?.waiting))
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
    // В снимке «ждущий» прогон - застывшее прошлое, а /run снимков не отдает:
    // опрос долбил бы мертвый туннель каждые 4 секунды впустую.
    if (frozen || waitingRuns.length === 0) return;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      for (const r of waitingRuns) {
        try {
          const fresh = await fetchCrmwebRun(r.id);
          setRuns((prev) => ({ ...prev, [fresh.task_id]: fresh }));
          // «Разбери» завершился - подзадачи уже в реестре, но на доске их еще
          // нет: без перечитки чек-лист появился бы только после ручного
          // «Обновить», и результат разбора выглядел бы потерянным.
          if (fresh.kind === 'decompose' && fresh.status === 'done' && r.waiting) {
            void load(true);
          }
        } catch {
          // недоступный опрос не должен ронять экран - попробуем следующим тиком
        }
      }
    };
    const id = setInterval(() => void tick(), 4000);
    return () => clearInterval(id);
  }, [waitingRuns, frozen]);

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

  return (
    <AppLayout
      title="Проекты и задачи"
      action={
        <Button variant="secondary" size="md" onClick={() => void load(true)} loading={refreshing}
          iconLeft={<RefreshCw className="w-4 h-4" />}>
          Обновить
        </Button>
      }
    >
      <div className="max-w-3xl">
        <CrmNav active="/crm" />
        {frozen && status.phase === 'ready' && (
          <SnapshotBanner subject="портфеля" fetchedAt={status.pm.fetched_at ?? null}
            onRetry={() => void load(true)} />
        )}
        {status.phase === 'ready' && status.pm.autonomy && (
          <p className="text-xs text-muted mb-4">{status.pm.autonomy}</p>
        )}

        {status.phase === 'ready' && (
          <div className="mb-5">
            <SegmentedTabs
              value={tab}
              onChange={setTab}
              items={[
                { value: 'dirs', label: 'Направления', count: status.pm.directions.length },
                { value: 'tasks', label: 'Задачи в работе', count: status.pm.cards.length },
              ]}
            />
          </div>
        )}

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

        {status.phase === 'ready' && tab === 'dirs' && (
          status.pm.directions.length === 0 ? (
            <Card className="p-0">
              <EmptyState icon={<Inbox className="w-6 h-6" />} title="Направлений нет"
                description="Портфель пуст - направления заводятся в telegram-agent." />
            </Card>
          ) : (
            <div className="space-y-3">
              {status.pm.directions.map((d) => (
                <DirectionCard key={d.code} dir={d} allProjects={status.pm.projects}
                  runs={runs} frozen={frozen} onAct={act} onAnswer={answer}
                  onMutated={() => void load(true)} />
              ))}
            </div>
          )
        )}

        {status.phase === 'ready' && tab === 'tasks' && (
          status.pm.cards.length === 0 ? (
            <Card className="p-0">
              <EmptyState icon={<Inbox className="w-6 h-6" />} title="Задач в работе нет"
                description="Все разобрано. Новые задачи появляются из реестра founder_tasks." />
            </Card>
          ) : (
            <div className="space-y-3">
              {status.pm.cards.map((t) => (
                <TaskCard key={t.id} task={t} run={runs[t.id] ?? t.run ?? null} frozen={frozen}
                  onAct={act} onAnswer={answer} onMutated={() => void load(true)} />
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
    <div className="space-y-3" aria-busy="true" aria-label="Загрузка портфеля">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="p-4">
          <div className="animate-pulse space-y-2.5">
            <div className="h-4 w-1/3 bg-hairline rounded" />
            <div className="h-3 w-2/3 bg-hairline rounded" />
            <div className="h-3 w-1/2 bg-hairline rounded" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function DirectionCard({
  dir, allProjects, runs, frozen, onAct, onAnswer, onMutated,
}: {
  dir: PmDirection;
  allProjects: PmProject[];
  runs: Record<number, PmRun>;
  /** Портфель показан из снимка - мутации у вложенных задач глушим. */
  frozen: boolean;
  onAct: (taskId: number, kind?: 'do' | 'decompose') => Promise<void>;
  onAnswer: (runId: number, taskId: number, text: string) => Promise<void>;
  onMutated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Поток-задачи уровня направления живут ВНЕ проектов (у Exit все 19 такие) -
  // без direction_payload они не видны нигде. Заодно раскрытие отмечает просмотр
  // в источнике, и бейджи «не открывал» по направлению честно гаснут.
  const [full, setFull] = useState<PmDirectionFull | null>(null);
  const [error, setError] = useState('');

  const shown = dir.projects;
  const rest = useMemo(
    () => allProjects.filter((p) => p.dir === dir.code && !shown.some((s) => s.code === p.code)),
    [allProjects, dir.code, shown],
  );
  const projects = showAll ? [...shown, ...rest] : shown;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !full) {
      try {
        setFull(await fetchCrmwebDirection(dir.code));
      } catch (e) {
        setError(decisionErrorText(e));
      }
    }
  }

  return (
    <Card className="p-4">
      <button type="button" onClick={() => void toggle()} className="w-full text-left">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${HEAT_DOT[dir.heat] ?? HEAT_DOT.none}`} />
          <span className="text-sm font-semibold text-primary">{dir.name}</span>
          {dir.move_label && <span className="ml-auto text-xs text-muted shrink-0">{dir.move_label}</span>}
          {open ? <ChevronDown className="w-4 h-4 text-muted shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted shrink-0" />}
        </div>
        {dir.rhythm && <p className="text-sm text-secondary mt-1">{dir.rhythm}</p>}
        <p className="text-xs mt-1.5">
          <span className="text-muted">{dir.proj_n} проектов · {dir.tasks_n} задач</span>
          {dir.over_n > 0 && <span className="text-danger ml-2">{dir.over_n} просрочено</span>}
        </p>
      </button>

      {open && (
        <div className="mt-3 space-y-2.5 border-t border-line pt-3">
          {error && <p className="text-xs text-danger">{error}</p>}
          {projects.map((p) => (
            <ProjectRow key={p.code} project={p} runs={runs} frozen={frozen}
              onAct={onAct} onAnswer={onAnswer} onMutated={onMutated} />
          ))}
          {!showAll && rest.length > 0 && (
            <Button variant="ghost" size="sm" className={BTN} onClick={() => setShowAll(true)}>
              еще {rest.length} проектов
            </Button>
          )}
          {!full && !error && <p className="text-xs text-muted">загружаю задачи направления...</p>}
          {full && full.cards.length > 0 && (
            <>
              {projects.length > 0 && (
                <p className="text-xs uppercase tracking-wide text-muted pt-1.5">Задачи направления</p>
              )}
              {full.cards.map((t) => (
                <TaskCard key={t.id} task={t} compact run={runs[t.id] ?? t.run ?? null}
                  frozen={frozen} onAct={onAct} onAnswer={onAnswer} onMutated={onMutated} />
              ))}
            </>
          )}
          {full && full.cards.length === 0 && projects.length === 0 && (
            <p className="text-xs text-muted">Открытых задач и проектов нет.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function ProjectRow({
  project, runs, frozen, onAct, onAnswer, onMutated,
}: {
  project: PmProject;
  runs: Record<number, PmRun>;
  frozen: boolean;
  onAct: (taskId: number, kind?: 'do' | 'decompose') => Promise<void>;
  onAnswer: (runId: number, taskId: number, text: string) => Promise<void>;
  onMutated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<PmProjectFull | null>(null);
  const [error, setError] = useState('');

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !full) {
      try {
        setFull(await fetchCrmwebProject(project.code));
      } catch (e) {
        setError(decisionErrorText(e));
      }
    }
  }

  return (
    <div className="rounded-md border border-line p-3">
      <button type="button" onClick={() => void toggle()} className="w-full text-left">
        <p className="text-sm font-medium text-primary">{project.name}</p>
        {project.note && <p className="text-xs text-secondary mt-0.5">{project.note}</p>}
        <p className="text-xs mt-1 flex flex-wrap gap-x-2">
          {project.heat_label && (
            <span className={HEAT_TEXT[project.heat] ?? 'text-muted'}>{project.heat_label}</span>
          )}
          <span className="text-muted">{project.open_n} задач</span>
          {project.over_n > 0 && <span className="text-danger">{project.over_n} просрочено</span>}
        </p>
      </button>
      {open && (
        <div className="mt-2.5 space-y-2.5">
          {error && <p className="text-xs text-danger">{error}</p>}
          {!full && !error && <p className="text-xs text-muted">загружаю...</p>}
          {full && (
            <div className="text-xs space-y-0.5">
              {full.result && (
                <p className="text-secondary"><b>Сдан, когда:</b> {full.result}</p>
              )}
              {full.date_h && <p className="text-muted">результат к {full.date_h}</p>}
              {full.waits.length > 0 && (
                <p className="text-warning">ждет тебя: {full.waits.length} - {full.waits[0]}
                  {full.waits.length > 1 && ` и еще ${full.waits.length - 1}`}</p>
              )}
            </div>
          )}
          {/* Проект без единой задачи с шагами - это не «все хорошо», это дырка
              в воронке. Лексика источника, красным. */}
          {full && full.no_step && (
            <p className="text-sm text-danger">
              Следующего шага нет. Проект в работе, но ни одной задачи с
              подзадачами к нему не привязано - решить, что делаем дальше,
              или убрать из воронки.
            </p>
          )}
          {full && full.cards.map((t) => (
            <TaskCard key={t.id} task={t} compact run={runs[t.id] ?? t.run ?? null}
              frozen={frozen} onAct={onAct} onAnswer={onAnswer} onMutated={onMutated} />
          ))}
        </div>
      )}
    </div>
  );
}

