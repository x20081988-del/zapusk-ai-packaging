import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, RefreshCw, XCircle } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { DecideError, decisionErrorText } from '../lib/decide';
import {
  applyCrmAction,
  CRM_KIND_LABEL,
  fetchCrmBoard,
  OWNER_LABEL,
  STATUS_TAB_LABEL,
  type CrmBoard,
  type CrmBoardStatus,
  type CrmCard,
  type CrmStepOwner,
} from '../lib/crm';

// Sprint 63.P12 - экран «CRM».
//
// Карточки сделок владельца (founder_crm в telegram-agent) жили в CLI и боте.
// Здесь та же доска по 4 стримам с главным инвариантом CRM: у активной карточки
// всегда есть следующий шаг, срок и чей ход. Красное на экране - ровно то, что
// CLI подсвечивает красным: просрочка и карточки без шага.
//
// Источник правды остается в telegram-agent: страница ничего не считает и не
// хранит, действие уходит в мост тем же путем, что решение на экране /decide.

type Status =
  | { phase: 'loading' }
  | { phase: 'ready'; board: CrmBoard }
  | { phase: 'failed'; failure: DecideError };

type Outcome = { state: 'busy' } | { state: 'done'; text: string } | { state: 'error'; text: string };

const FAILURE_COPY: Record<string, { title: string; description: string }> = {
  source_unreachable: {
    title: 'Источник недоступен',
    description: 'Мак не отвечает: спит, офлайн или закрыт туннель. CRM цела, показать ее сейчас нельзя.',
  },
  source_not_configured: {
    title: 'Мост к источнику не настроен',
    description: 'Связка с маком не настроена на сервере. Это правится в настройках хостинга, будить мак не нужно.',
  },
  source_auth: {
    title: 'Секрет моста разъехался',
    description: 'Источник не принял секрет связки. Лечится обновлением секрета в настройках хостинга.',
  },
  source_rate_limited: {
    title: 'Слишком часто',
    description: 'Источник попросил притормозить. Повтори через минуту.',
  },
  unknown: {
    title: 'Доска не загрузилась',
    description: 'Источник ответил неожиданно. Подробности в журнале сервера.',
  },
};

const STATUS_TABS: CrmBoardStatus[] = ['active', 'won', 'lost', 'paused'];

export function Crm() {
  const [tab, setTab] = useState<CrmBoardStatus>('active');
  const [status, setStatus] = useState<Status>({ phase: 'loading' });
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async (which: CrmBoardStatus, isRefresh = false) => {
    if (inFlight.current) inFlight.current.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    if (isRefresh) setRefreshing(true);
    else setStatus({ phase: 'loading' });
    try {
      const board = await fetchCrmBoard(which, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setStatus({ phase: 'ready', board });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setStatus({
        phase: 'failed',
        failure: e instanceof DecideError ? e : new DecideError('unknown', String(e)),
      });
    } finally {
      if (inFlight.current === ctrl) inFlight.current = null;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(tab);
    return () => inFlight.current?.abort();
    // Автополлинга нет намеренно, как на /decide: доска меняется несколько раз в
    // день, фоновый цикл жег бы трафик к маку впустую.
  }, [load, tab]);

  async function act(card: CrmCard, input: Parameters<typeof applyCrmAction>[0]) {
    if (outcomes[card.id]?.state === 'busy') return;
    setOutcomes((prev) => ({ ...prev, [card.id]: { state: 'busy' } }));
    try {
      const res = await applyCrmAction(input);
      setOutcomes((prev) => ({ ...prev, [card.id]: { state: 'done', text: res.detail || 'принято' } }));
      // Тихая перезагрузка: доска отражает то, что реально записал источник, а не
      // то, что фронт себе представил. Скролл и вкладка при этом не сбрасываются.
      void load(tab, true);
    } catch (e) {
      setOutcomes((prev) => ({ ...prev, [card.id]: { state: 'error', text: decisionErrorText(e) } }));
    }
  }

  return (
    <AppLayout
      title="CRM"
      action={
        <Button
          variant="secondary"
          size="md"
          onClick={() => void load(tab, true)}
          loading={refreshing}
          iconLeft={<RefreshCw className="w-4 h-4" />}
        >
          Обновить
        </Button>
      }
    >
      <div className="max-w-3xl">
        <p className="text-sm text-secondary mb-4">
          {status.phase === 'ready' ? headline(status.board, tab) : 'Карточки сделок из telegram-agent'}
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          {STATUS_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setExpanded(null); setOutcomes({}); }}
              className={`rounded-md px-3 py-1.5 text-sm border transition-colors ${
                tab === t
                  ? 'border-zapusk/60 bg-zapusk/10 text-primary'
                  : 'border-line text-secondary hover:text-primary'
              }`}
            >
              {STATUS_TAB_LABEL[t]}
            </button>
          ))}
        </div>

        {status.phase === 'loading' && <LoadingSkeleton />}

        {status.phase === 'failed' && (
          <Card className="p-0">
            <EmptyState
              icon={<AlertTriangle className="w-6 h-6 text-danger" />}
              title={(FAILURE_COPY[status.failure.failure] ?? FAILURE_COPY.unknown).title}
              description={(FAILURE_COPY[status.failure.failure] ?? FAILURE_COPY.unknown).description}
              action={
                <Button variant="secondary" onClick={() => void load(tab, true)} loading={refreshing}>
                  Повторить
                </Button>
              }
            />
          </Card>
        )}

        {status.phase === 'ready' && status.board.counters.total === 0 && (
          <Card className="p-0">
            <EmptyState
              icon={<Inbox className="w-6 h-6" />}
              title="Карточек нет"
              description={
                tab === 'active'
                  ? 'В работе сейчас пусто. Карточки заводятся из CLI, бота и решений на /decide.'
                  : `В разделе «${STATUS_TAB_LABEL[tab]}» пока пусто.`
              }
            />
          </Card>
        )}

        {status.phase === 'ready' && status.board.counters.total > 0 && (
          <div className="space-y-7">
            {status.board.streams.map((group) => (
              <section key={group.stream}>
                <h2 className="text-xs uppercase tracking-wide text-muted mb-2.5">
                  {group.label}
                  <span className="ml-2 text-muted/70">{group.counters.total}</span>
                  {tab === 'active' && group.counters.overdue > 0 && (
                    <span className="ml-2 text-danger normal-case tracking-normal">
                      просрочено {group.counters.overdue}
                    </span>
                  )}
                  {tab === 'active' && group.counters.need_step > 0 && (
                    <span className="ml-2 text-warning normal-case tracking-normal">
                      без шага {group.counters.need_step}
                    </span>
                  )}
                </h2>
                <div className="space-y-2.5">
                  {group.cards.map((card) => (
                    <CrmCardRow
                      key={card.id}
                      card={card}
                      staleDays={status.board.stale_days}
                      outcome={outcomes[card.id]}
                      expanded={expanded === card.id}
                      onToggle={() => setExpanded((cur) => (cur === card.id ? null : card.id))}
                      onAct={(input) => void act(card, input)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function headline(board: CrmBoard, tab: CrmBoardStatus): string {
  const c = board.counters;
  if (tab !== 'active') return `${STATUS_TAB_LABEL[tab]}: ${c.total}`;
  if (c.total === 0) return 'В работе пусто';
  const parts: string[] = [];
  if (c.overdue) parts.push(`просрочено ${c.overdue}`);
  if (c.need_step) parts.push(`без шага ${c.need_step}`);
  if (c.stale) parts.push(`мяч завис ${c.stale}`);
  return parts.length ? `${c.total} в работе: ${parts.join(', ')}` : `${c.total} в работе, все с шагами`;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label="Загрузка доски">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="p-4">
          <div className="animate-pulse space-y-2.5">
            <div className="h-4 w-1/3 bg-surface rounded" />
            <div className="h-3 w-2/3 bg-surface rounded" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/** DD.MM из YYYY-MM-DD - тот же вид даты, что на /decide. */
function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}` : iso;
}

function CrmCardRow({
  card,
  staleDays,
  outcome,
  expanded,
  onToggle,
  onAct,
}: {
  card: CrmCard;
  staleDays: number;
  outcome?: Outcome;
  expanded: boolean;
  onToggle: () => void;
  onAct: (input: Parameters<typeof applyCrmAction>[0]) => void;
}) {
  const busy = outcome?.state === 'busy';
  const accent = card.overdue_days
    ? 'border-l-2 border-l-danger/70'
    : card.needs_step
      ? 'border-l-2 border-l-warning/70'
      : '';

  return (
    <Card className={`p-3.5 ${accent}`}>
      {/* Шапка карточки - кнопка: действия по 120 карточкам разом были бы стеной
          кнопок, поэтому панель действий раскрывается по клику на карточку. */}
      <button type="button" onClick={onToggle} className="w-full text-left">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold text-primary">{card.name}</span>
          {card.handle && <span className="text-xs text-muted">{card.handle}</span>}
          {card.kind && (
            <span className="text-xs text-muted">{CRM_KIND_LABEL[card.kind] ?? card.kind}</span>
          )}
          {card.company && <span className="text-xs text-muted">{card.company}</span>}
          {card.amount && <span className="ml-auto text-xs text-secondary">{card.amount}</span>}
        </div>

        <div className="mt-1.5 text-sm leading-relaxed">
          {card.next_step ? (
            <span className={card.overdue_days ? 'text-danger' : 'text-secondary'}>
              {card.next_step}
              <span className="text-xs text-muted ml-2">
                {OWNER_LABEL[card.next_step_owner as CrmStepOwner] ?? card.next_step_owner}
                {card.due && `, до ${shortDate(card.due)}`}
                {card.overdue_days > 0 && `, просрочен ${card.overdue_days} дн`}
                {!card.due && ', без срока'}
              </span>
            </span>
          ) : card.status === 'active' ? (
            <span className="text-warning">нет следующего шага</span>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
          {card.stage && <span>стадия: {card.stage}</span>}
          {card.last_touch && (
            <span className={card.stale ? 'text-warning' : ''}>
              касание {shortDate(card.last_touch)}
              {card.stale && ` (мяч завис, больше ${staleDays} дн)`}
            </span>
          )}
        </div>
      </button>

      {(outcome?.state === 'done' || outcome?.state === 'error' || busy) && (
        <div className="mt-2">
          {busy && <span className="text-xs text-muted">отправляю</span>}
          {outcome?.state === 'done' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {outcome.text}
            </span>
          )}
          {outcome?.state === 'error' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-danger">
              <XCircle className="w-3.5 h-3.5" />
              {outcome.text}
            </span>
          )}
        </div>
      )}

      {/* key по содержимому: после тихой перезагрузки доски редактор не должен
          подставлять только что закрытый шаг или устаревшую стадию. */}
      {expanded && (
        <CardActions
          key={`${card.id}:${card.next_step}:${card.due}:${card.stage}:${card.status}`}
          card={card}
          busy={busy}
          onAct={onAct}
        />
      )}
    </Card>
  );
}

function CardActions({
  card,
  busy,
  onAct,
}: {
  card: CrmCard;
  busy: boolean;
  onAct: (input: Parameters<typeof applyCrmAction>[0]) => void;
}) {
  const [editor, setEditor] = useState<'step' | 'stage' | null>(null);
  const [stepText, setStepText] = useState(card.next_step);
  const [stepOwner, setStepOwner] = useState<CrmStepOwner>(
    (['owner', 'agent', 'contact'].includes(card.next_step_owner)
      ? card.next_step_owner
      : 'owner') as CrmStepOwner,
  );
  const [stepDue, setStepDue] = useState(card.due);
  const [stageText, setStageText] = useState(card.stage);

  const inputCls =
    'rounded-md bg-surface border border-line text-sm text-primary p-2 placeholder:text-muted focus:outline-none focus:border-zapusk/50';
  // Тач-цель на телефоне не меньше 44px, на широком экране компактно - тот же
  // прием, что у кнопок на /decide: владелец работает с CRM с телефона.
  const btnCls = 'min-h-11 px-4 sm:min-h-8 sm:px-3';

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" className={btnCls} disabled={busy}
          onClick={() => setEditor((e) => (e === 'step' ? null : 'step'))}>
          {card.next_step ? 'Изменить шаг' : 'Поставить шаг'}
        </Button>
        <Button size="sm" variant="secondary" className={btnCls} disabled={busy} onClick={() => onAct({ action: 'touch', id: card.id })}>
          Касание
        </Button>
        {card.next_step && (
          <Button size="sm" variant="secondary" className={btnCls} disabled={busy} onClick={() => onAct({ action: 'complete', id: card.id })}>
            Шаг сделан
          </Button>
        )}
        {card.due && (
          <Button size="sm" variant="secondary" className={btnCls} disabled={busy} onClick={() => onAct({ action: 'snooze', id: card.id, days: 3 })}>
            +3 дня
          </Button>
        )}
        <Button size="sm" variant="ghost" className={btnCls} disabled={busy}
          onClick={() => setEditor((e) => (e === 'stage' ? null : 'stage'))}>
          Стадия
        </Button>
        {card.status === 'active' ? (
          <>
            <Button size="sm" variant="ghost" className={btnCls} disabled={busy} onClick={() => onAct({ action: 'status', id: card.id, status: 'won' })}>
              Выиграна
            </Button>
            <Button size="sm" variant="ghost" className={btnCls} disabled={busy} onClick={() => onAct({ action: 'status', id: card.id, status: 'lost' })}>
              Проиграна
            </Button>
            <Button size="sm" variant="ghost" className={btnCls} disabled={busy} onClick={() => onAct({ action: 'status', id: card.id, status: 'paused' })}>
              Пауза
            </Button>
          </>
        ) : (
          <Button size="sm" variant="secondary" className={btnCls} disabled={busy} onClick={() => onAct({ action: 'status', id: card.id, status: 'active' })}>
            Вернуть в работу
          </Button>
        )}
      </div>

      {editor === 'step' && (
        <div className="mt-3 space-y-2">
          <input
            value={stepText}
            onChange={(e) => setStepText(e.target.value)}
            placeholder="Что сделать дальше"
            autoFocus
            className={`w-full ${inputCls}`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={stepOwner}
              onChange={(e) => setStepOwner(e.target.value as CrmStepOwner)}
              className={inputCls}
            >
              <option value="owner">мой ход</option>
              <option value="agent">ход агента</option>
              <option value="contact">ждем контакта</option>
            </select>
            <input
              type="date"
              value={stepDue}
              onChange={(e) => setStepDue(e.target.value)}
              className={inputCls}
            />
            <Button
              size="sm"
              variant="primary"
              disabled={busy || !stepText.trim()}
              onClick={() =>
                onAct({
                  action: 'next_step',
                  id: card.id,
                  text: stepText.trim(),
                  owner: stepOwner,
                  due: stepDue || undefined,
                })
              }
            >
              Записать шаг
            </Button>
          </div>
          {!stepDue && (
            <p className="text-xs text-muted">Без срока карточка останется красной - инвариант CRM.</p>
          )}
        </div>
      )}

      {editor === 'stage' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={stageText}
            onChange={(e) => setStageText(e.target.value)}
            placeholder="Новая стадия"
            autoFocus
            className={`flex-1 min-w-48 ${inputCls}`}
          />
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !stageText.trim()}
            onClick={() => onAct({ action: 'stage', id: card.id, stage: stageText.trim() })}
          >
            Сменить стадию
          </Button>
        </div>
      )}
    </div>
  );
}
