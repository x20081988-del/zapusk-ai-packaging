import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Inbox, RefreshCw } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { CrmNav } from '../components/crm/CrmNav';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { SnapshotBanner } from '../components/ui/SnapshotBanner';
import { DecideError, decisionErrorText } from '../lib/decide';
import { SOURCE_FAILURE_COPY } from '../lib/sourceFailure';
import {
  crmwebAct,
  crmwebAnswer,
  crmwebPmAction,
  fetchCrmwebDirection,
  fetchCrmwebProject,
  fetchCrmwebPm,
  fetchCrmwebRun,
  PM_OWNER_LABEL,
  type PmDirection,
  type PmDirectionFull,
  type PmPayload,
  type PmProject,
  type PmProjectFull,
  type PmRun,
  type PmTask,
} from '../lib/crmweb';

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

// Тач-цель на телефоне не меньше 44px - владелец живет в телефоне.
const BTN = 'min-h-11 px-4 sm:min-h-8 sm:px-3';

const HEAT_TEXT: Record<string, string> = {
  over: 'text-danger', today: 'text-warning', soon: 'text-warning',
  ok: 'text-success', none: 'text-muted',
};
const HEAT_DOT: Record<string, string> = {
  over: 'bg-danger', today: 'bg-warning', soon: 'bg-warning',
  ok: 'bg-success', none: 'bg-muted/60',
};
const HEAT_PLAQUE: Record<string, string> = {
  over: 'bg-danger/10 text-danger', today: 'bg-warning/10 text-warning',
  soon: 'bg-warning/10 text-warning', ok: 'bg-success/10 text-success',
  none: 'bg-surface text-muted',
};

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
          <div className="flex gap-2 mb-5">
            <button type="button" onClick={() => setTab('dirs')}
              className={`flex-1 rounded-md px-3 py-2 text-sm border transition-colors ${
                tab === 'dirs' ? 'border-zapusk/60 bg-zapusk/10 text-primary' : 'border-line text-secondary hover:text-primary'}`}>
              Направления <span className="ml-1 text-muted">{status.pm.directions.length}</span>
            </button>
            <button type="button" onClick={() => setTab('tasks')}
              className={`flex-1 rounded-md px-3 py-2 text-sm border transition-colors ${
                tab === 'tasks' ? 'border-zapusk/60 bg-zapusk/10 text-primary' : 'border-line text-secondary hover:text-primary'}`}>
              Задачи в работе <span className="ml-1 text-muted">{status.pm.cards.length}</span>
            </button>
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
            <div className="h-4 w-1/3 bg-surface rounded" />
            <div className="h-3 w-2/3 bg-surface rounded" />
            <div className="h-3 w-1/2 bg-surface rounded" />
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

function TaskCard({
  task, run, compact = false, frozen, onAct, onAnswer, onMutated,
}: {
  task: PmTask;
  run: PmRun | null;
  compact?: boolean;
  /** Задача показана из снимка: чекбоксы, «Сделать» и закрытие глушим. */
  frozen: boolean;
  onAct: (taskId: number, kind?: 'do' | 'decompose') => Promise<void>;
  onAnswer: (runId: number, taskId: number, text: string) => Promise<void>;
  onMutated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const [resolution, setResolution] = useState('');
  const [answerText, setAnswerText] = useState('');
  // Оптимистичные чекбоксы: клик виден сразу, источник подтверждает перечиткой.
  const [subOverride, setSubOverride] = useState<Record<number, boolean>>({});

  const ready = task.total_n > 0 && task.done_n >= task.total_n;

  async function guard(fn: () => Promise<void>) {
    if (busy || frozen) return;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(decisionErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={`p-3.5 ${task.heat === 'over' ? 'border-l-2 border-l-danger/70' : ''}`}>
      <div className="flex items-baseline gap-2 flex-wrap text-xs text-muted">
        {!compact && task.project && <span className="text-secondary">{task.project}</span>}
        {task.stream && <span>{task.stream}</span>}
        {task.unseen && (
          <span className="rounded bg-warning/10 text-warning px-1.5 py-0.5">{task.unseen}</span>
        )}
        <span className="ml-auto">#{task.id}</span>
      </div>

      <h3 className="text-sm font-semibold text-primary mt-1.5">{task.title}</h3>
      {task.rest && <p className="text-sm text-secondary mt-1 leading-relaxed">{task.rest}</p>}

      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
        <span className={`rounded px-2 py-1 ${HEAT_PLAQUE[task.heat] ?? HEAT_PLAQUE.none}`}>
          {task.due_ts ? `${task.due_date} · ${task.due_label}` : task.heat_label}
        </span>
        {task.total_n > 0 && task.turn_label && (
          <span className="text-muted">ход: <b className="text-secondary">{task.turn_label}</b></span>
        )}
      </div>

      {task.total_n > 0 ? (
        <div className="mt-2.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded bg-surface overflow-hidden">
              <div className="h-full bg-zapusk rounded" style={{ width: `${task.pct}%` }} />
            </div>
            <span className="text-xs text-muted shrink-0">{task.done_n} из {task.total_n}</span>
          </div>
          <ul className="mt-2 space-y-1">
            {task.subs.map((s) => {
              const done = subOverride[s.id] ?? Boolean(s.done);
              return (
                <li key={s.id}>
                  <button type="button" disabled={busy || frozen}
                    onClick={() => {
                      if (frozen) return;
                      setSubOverride((p) => ({ ...p, [s.id]: !done }));
                      void guard(async () => {
                        await crmwebPmAction({ action: 'toggle_sub', id: s.id, done: !done });
                        onMutated();
                      });
                    }}
                    className="w-full flex items-start gap-2 text-left text-sm py-0.5">
                    <span className={`mt-0.5 w-4 h-4 shrink-0 rounded border ${done ? 'bg-zapusk border-zapusk' : 'border-line'}`} />
                    <span className={done ? 'line-through text-muted' : 'text-secondary'}>{s.text}</span>
                    <span className="ml-auto text-xs text-muted shrink-0">
                      {PM_OWNER_LABEL[s.owner] ?? s.owner}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="mt-2.5 rounded bg-warning/10 text-sm px-2.5 py-1.5 flex flex-wrap items-center gap-2">
          <span className="text-warning">Не разложена на шаги.</span>
          {!(run && run.waiting) && (
            <Button size="sm" variant="secondary" className={BTN} disabled={busy || frozen}
              onClick={() => void guard(() => onAct(task.id, 'decompose'))}>
              Разбери на шаги
            </Button>
          )}
        </div>
      )}

      {task.mine.length > 0 && (
        <p className="text-xs text-secondary mt-2">
          <b>Беру на себя:</b> {task.mine[0]}{task.mine.length > 1 && ` и еще ${task.mine.length - 1}`}
        </p>
      )}

      {/* Нить прогона - как _act_html у источника: работа, вопрос, итог, причина сбоя */}
      {run && run.waiting && !frozen && (
        <p className="mt-2.5 text-sm text-muted animate-pulse">
          {run.kind === 'decompose'
            ? 'Раскладываю задачу на шаги...'
            : 'Поднимаю контекст и готовлю действие...'}
        </p>
      )}
      {/* В снимке «работающий» прогон - застывшее прошлое, живым его не рисуем. */}
      {run && run.waiting && frozen && (
        <p className="mt-2.5 text-sm text-muted">Прогон был в работе на момент снимка.</p>
      )}
      {run && run.status === 'asked' && (
        <div className="mt-2.5 rounded-md border border-line p-2.5">
          <p className="text-sm text-primary">{run.question}</p>
          <div className="flex gap-2 mt-2">
            <input value={answerText} onChange={(e) => setAnswerText(e.target.value)}
              placeholder="ответь коротко" disabled={frozen}
              onKeyDown={(e) => { if (e.key === 'Enter' && answerText.trim()) void guard(() => onAnswer(run.id, task.id, answerText.trim())); }}
              className="flex-1 rounded-md bg-surface border border-line text-sm text-primary p-2 placeholder:text-muted focus:outline-none focus:border-zapusk/50 disabled:opacity-50" />
            <Button size="sm" variant="primary" className={BTN} disabled={busy || frozen || !answerText.trim()}
              onClick={() => void guard(() => onAnswer(run.id, task.id, answerText.trim()))}>
              Ответить
            </Button>
          </div>
        </div>
      )}
      {run && run.status === 'done' && (
        <div className="mt-2.5 text-sm text-secondary">
          <b className="text-success">Сделано.</b> {run.summary}
          {run.artifact && <p className="text-xs text-muted mt-1">Лежит тут: {run.artifact}</p>}
        </div>
      )}
      {run && run.status === 'failed' && (
        <div className="mt-2.5 text-sm text-danger">
          Не получилось: {run.summary || 'прогон упал'}
          {run.detail && <p className="text-xs text-muted mt-1">{run.detail.slice(0, 400)}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        {!(run && run.waiting) && (
          <Button size="sm" variant="primary" className={`${BTN} flex-1 sm:flex-none`} disabled={busy || frozen}
            onClick={() => void guard(() => onAct(task.id))}>
            {run ? 'Сделать заново' : 'Сделать'}
          </Button>
        )}
        {ready && <span className="text-xs text-success">Все шаги сделаны</span>}
        {/* «Закрыть» владелец не считывал как «задача реализована» (26.08: «нет
            кнопки, что задача уже реализована») - кнопка называется «Сделано». */}
        {!closing ? (
          <Button size="sm" variant="secondary" className={`${BTN} ml-auto`} disabled={busy || frozen}
            onClick={() => setClosing(true)}>
            {ready ? 'Сделано, закрыть' : 'Сделано'}
          </Button>
        ) : (
          <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
            <input value={resolution} onChange={(e) => setResolution(e.target.value)}
              placeholder="как решено (одной строкой)" autoFocus
              className="flex-1 min-w-40 rounded-md bg-surface border border-line text-sm text-primary p-2 placeholder:text-muted focus:outline-none focus:border-zapusk/50" />
            <Button size="sm" variant="primary" className={BTN} disabled={busy || frozen}
              onClick={() => void guard(async () => {
                await crmwebPmAction({ action: 'close_task', task_id: task.id, resolution: resolution.trim() || undefined });
                setClosing(false);
                onMutated();
              })}>
              Сделано
            </Button>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-danger mt-2">{error}</p>}
      {busy && !error && <p className="text-xs text-muted mt-2">отправляю</p>}
    </Card>
  );
}
