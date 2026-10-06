import { useState, type ReactNode } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { decisionErrorText } from '../../lib/decide';
import { crmwebPmAction, PM_OWNER_LABEL, type PmRun, type PmTask } from '../../lib/crmweb';
import { DueChip, shortDue } from './DueChip';

// Карточка задачи реестра - одна на все экраны CRM: «Проекты и задачи» и «Отделы».
// Вынесена из CrmPm 28.09.2026 (Sprint 66): отделам нужна та же карточка с теми же
// кнопками, а две копии разъехались бы на первой правке.

// Тач-цель на телефоне не меньше 44px - владелец живет в телефоне.
export const BTN = 'min-h-11 px-4 sm:min-h-8 sm:px-3';

export const HEAT_TEXT: Record<string, string> = {
  over: 'text-danger', today: 'text-warning', soon: 'text-warning',
  ok: 'text-success', none: 'text-muted',
};
export const HEAT_DOT: Record<string, string> = {
  over: 'bg-danger', today: 'bg-warning', soon: 'bg-warning',
  ok: 'bg-success', none: 'bg-muted/60',
};
export const HEAT_PLAQUE: Record<string, string> = {
  over: 'bg-danger/10 text-danger', today: 'bg-warning/10 text-warning',
  soon: 'bg-warning/10 text-warning', ok: 'bg-success/10 text-success',
  none: 'bg-surface text-muted',
};

export function TaskCard({
  task, run, compact = false, frozen, onAct, onAnswer, onMutated, footer,
}: {
  task: PmTask;
  run: PmRun | null;
  compact?: boolean;
  /** Строка под кнопками - экран отдела кладет сюда перенос в другой отдел. */
  footer?: ReactNode;
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
        <span className="ml-auto font-num">#{task.id}</span>
      </div>

      <h3 className="text-[15px] font-semibold text-primary mt-1.5 leading-snug">{task.title}</h3>
      {task.rest && <p className="text-sm text-secondary mt-1 leading-relaxed">{task.rest}</p>}

      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
        <DueChip
          state={task.heat}
          label={task.due_ts ? `${task.due_date} · ${shortDue(task.due_label)}` : task.heat_label}
        />
        {task.total_n > 0 && task.turn_label && (
          <span className="text-muted">ход: <b className="text-secondary">{task.turn_label}</b></span>
        )}
      </div>

      {task.total_n > 0 ? (
        <div className="mt-2.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded bg-hairline overflow-hidden">
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

      {footer}

      {error && <p className="text-xs text-danger mt-2">{error}</p>}
      {busy && !error && <p className="text-xs text-muted mt-2">отправляю</p>}
    </Card>
  );
}
