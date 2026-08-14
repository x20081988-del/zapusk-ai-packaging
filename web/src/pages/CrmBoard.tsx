import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { CrmNav } from '../components/crm/CrmNav';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { DecideError, decisionErrorText } from '../lib/decide';
import { SOURCE_FAILURE_COPY } from '../lib/sourceFailure';
import {
  cardButtons,
  crmwebCardAction,
  fetchCrmwebCards,
  type CardActionInput,
  type CrmwebCard,
} from '../lib/crmweb';

// Sprint 63.P13 - канбан всех карточек founder_crm (доска «/» из crm_web).
//
// Колонки, подсветки и строка шага пришли готовыми от источника (card_view,
// card_bucket) - экран ничего не пересчитывает. Клик и перетаскивание меняют
// статус в базе сразу, как по токен-ссылке. В «Выиграно» перетащить нельзя -
// won ставится осознанно, это канон источника.

type Status =
  | { phase: 'loading' }
  | { phase: 'ready'; generated: string; cards: CrmwebCard[] }
  | { phase: 'failed'; failure: DecideError };

const BTN = 'min-h-11 px-4 sm:min-h-8 sm:px-3';

// Колонки канбана: слаг -> подпись и акцент. Порядок как у источника.
const BUCKETS: Array<{ slug: string; label: string; accent: string }> = [
  { slug: 'active', label: 'В работе', accent: 'border-t-2 border-t-success/60' },
  { slug: 'snoozed', label: 'Отложено', accent: 'border-t-2 border-t-warning/60' },
  { slug: 'declined', label: 'Отказ', accent: 'border-t-2 border-t-line' },
  { slug: 'won', label: 'Выиграно', accent: 'border-t-2 border-t-zapusk/60' },
];

// Бросок карточки в колонку = действие источника. В won не бросают.
const DROP_ACTION: Record<string, 'reactivate' | 'snooze' | 'decline' | undefined> = {
  active: 'reactivate', snoozed: 'snooze', declined: 'decline', won: undefined,
};

export function CrmBoard() {
  const [status, setStatus] = useState<Status>({ phase: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [stream, setStream] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [dragOver, setDragOver] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (inFlight.current) inFlight.current.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    if (isRefresh) setRefreshing(true);
    else setStatus({ phase: 'loading' });
    try {
      const res = await fetchCrmwebCards(ctrl.signal);
      if (ctrl.signal.aborted) return;
      setStatus({ phase: 'ready', generated: res.generated, cards: res.cards });
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

  async function act(card: CrmwebCard, input: CardActionInput) {
    setErrors((p) => ({ ...p, [card.id]: '' }));
    try {
      await crmwebCardAction(input);
      void load(true);
    } catch (e) {
      setErrors((p) => ({ ...p, [card.id]: decisionErrorText(e) }));
      // Оптимистичный перенос мог соврать - честная перечитка вернет как есть.
      void load(true);
    }
  }

  const all = status.phase === 'ready' ? status.cards : [];

  const streams = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>();
    for (const c of all) {
      const cur = m.get(c.stream) ?? { label: c.stream_label || c.stream, n: 0 };
      cur.n += 1;
      m.set(c.stream, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [all]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((c) => {
      if (stream && c.stream !== stream) return false;
      if (!q) return true;
      // Поля поиска как у источника: имя, handle, компания, стадия и «почему».
      return [c.name, c.handle, c.company, c.stage, c.why]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [all, query, stream]);

  const byBucket = useMemo(() => {
    const m: Record<string, CrmwebCard[]> = { active: [], snoozed: [], declined: [], won: [] };
    for (const c of visible) (m[c.bucket] ?? (m[c.bucket] = [])).push(c);
    return m;
  }, [visible]);

  function onDrop(bucket: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData('text/card-id'));
    const card = all.find((c) => c.id === id);
    const action = DROP_ACTION[bucket];
    if (!card || !action || card.bucket === bucket) return;
    // Тот же контракт доступности, что у кнопок (_btn_disabled): won-карточку
    // нельзя уронить в «Отказ» перетаскиванием, раз кнопка это запрещает.
    const allowed = cardButtons(card.status);
    const key = ({ reactivate: 'reactivate', snooze: 'snooze', decline: 'decline' } as const)[action];
    if (!allowed[key]) return;
    void act(card, { action, id });
  }

  return (
    <AppLayout
      title="Карточки"
      action={
        <Button variant="secondary" size="md" onClick={() => void load(true)} loading={refreshing}
          iconLeft={<RefreshCw className="w-4 h-4" />}>
          Обновить
        </Button>
      }
    >
      <div>
        <CrmNav active="/crm/board" />
        <p className="text-sm text-secondary mb-4">
          {status.phase === 'ready'
            ? `Живая доска - клик и перетаскивание меняют статус в базе сразу. Всего ${all.length}.`
            : 'Все карточки CRM из telegram-agent'}
        </p>

        {status.phase === 'ready' && (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              <button type="button" onClick={() => setStream('')}
                className={`rounded-md px-3 py-1.5 text-sm border ${!stream ? 'border-zapusk/60 bg-zapusk/10 text-primary' : 'border-line text-secondary hover:text-primary'}`}>
                все <b>{all.length}</b>
              </button>
              {streams.map(([slug, s]) => (
                <button key={slug} type="button" onClick={() => setStream(stream === slug ? '' : slug)}
                  className={`rounded-md px-3 py-1.5 text-sm border ${stream === slug ? 'border-zapusk/60 bg-zapusk/10 text-primary' : 'border-line text-secondary hover:text-primary'}`}>
                  {s.label} <b>{s.n}</b>
                </button>
              ))}
            </div>
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по имени / @handle / компании..."
              className="w-full rounded-md bg-surface border border-line text-sm text-primary p-2.5 placeholder:text-muted focus:outline-none focus:border-zapusk/50" />
            <p className="text-xs text-muted mt-1.5 mb-4">Видно: {visible.length} из {all.length}</p>
          </>
        )}

        {status.phase === 'loading' && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <div className="animate-pulse space-y-2.5">
                  <div className="h-4 w-1/2 bg-surface rounded" />
                  <div className="h-3 w-3/4 bg-surface rounded" />
                </div>
              </Card>
            ))}
          </div>
        )}

        {status.phase === 'failed' && (
          <Card className="p-0">
            <EmptyState
              icon={<AlertTriangle className="w-6 h-6 text-danger" />}
              title={(SOURCE_FAILURE_COPY[status.failure.failure] ?? SOURCE_FAILURE_COPY.unknown).title}
              description={(SOURCE_FAILURE_COPY[status.failure.failure] ?? SOURCE_FAILURE_COPY.unknown).description}
              action={<Button variant="secondary" onClick={() => void load(true)} loading={refreshing}>Повторить</Button>}
            />
          </Card>
        )}

        {status.phase === 'ready' && all.length === 0 && (
          <Card className="p-0">
            <EmptyState icon={<Inbox className="w-6 h-6" />} title="Карточек нет"
              description="CRM пуста - карточки заводятся из CLI, бота и решений." />
          </Card>
        )}

        {status.phase === 'ready' && all.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 items-start">
            {BUCKETS.map((b) => (
              <div key={b.slug}
                onDragOver={(e) => { if (DROP_ACTION[b.slug]) { e.preventDefault(); setDragOver(b.slug); } }}
                onDragLeave={() => setDragOver((v) => (v === b.slug ? null : v))}
                onDrop={(e) => onDrop(b.slug, e)}
                className={`rounded-lg bg-surface/40 p-2 ${b.accent} ${dragOver === b.slug ? 'ring-2 ring-zapusk/40' : ''}`}>
                <p className="text-sm font-semibold text-primary px-1.5 py-1">
                  {b.label} <span className="text-muted font-normal">{byBucket[b.slug]?.length ?? 0}</span>
                </p>
                <div className="space-y-2 mt-1">
                  {(byBucket[b.slug] ?? []).map((c) => (
                    <BoardCard key={c.id} card={c} error={errors[c.id] ?? ''}
                      expanded={expanded === c.id}
                      onToggle={() => setExpanded((cur) => (cur === c.id ? null : c.id))}
                      onAct={(input) => void act(c, input)} />
                  ))}
                  {(byBucket[b.slug] ?? []).length === 0 && (
                    <p className="text-xs text-muted px-1.5 py-2">пусто</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function BoardCard({
  card, error, expanded, onToggle, onAct,
}: {
  card: CrmwebCard;
  error: string;
  expanded: boolean;
  onToggle: () => void;
  onAct: (input: CardActionInput) => void;
}) {
  const btns = cardButtons(card.status);
  const [editor, setEditor] = useState<'step' | 'stage' | null>(null);
  const [stepText, setStepText] = useState('');
  const [stepOwner, setStepOwner] = useState<'owner' | 'agent' | 'contact'>('owner');
  const [stepDue, setStepDue] = useState('');
  const [stageText, setStageText] = useState(card.stage);
  const noStep = card.step_display === 'не задан';

  const inputCls =
    'rounded-md bg-surface border border-line text-sm text-primary p-2 placeholder:text-muted focus:outline-none focus:border-zapusk/50';

  return (
    <Card
      draggable
      onDragStart={(e: React.DragEvent) => e.dataTransfer.setData('text/card-id', String(card.id))}
      className="p-3 cursor-grab active:cursor-grabbing"
    >
      <button type="button" onClick={onToggle} className="w-full text-left">
        <div className="flex items-baseline gap-1.5 flex-wrap text-xs text-muted">
          <span>#{card.id}</span>
          <span className="text-sm font-semibold text-primary">{card.name}</span>
          <span className="ml-auto rounded bg-surface px-1.5 py-0.5">{card.stream_label}</span>
        </div>
        <div className="mt-1 space-y-0.5 text-xs">
          {card.handle && (
            <a href={card.handle_url || undefined} target="_blank" rel="noreferrer"
              onClick={(e) => e.stopPropagation()} className="text-zapusk hover:underline">
              {card.handle}
            </a>
          )}
          {card.company && <p className="text-secondary">{card.company}</p>}
          {card.stage && <p className="text-muted">Стадия: <span className="text-secondary">{card.stage}</span></p>}
          <p className={noStep ? 'text-danger' : 'text-secondary'}>
            {noStep ? 'шаг не задан' : card.step_display}
          </p>
          {/* Почему/источник/касание видны всегда, как у источника: владелец
              сканирует доску, не раскрывая каждую карточку. */}
          {card.why && <p className="text-muted">Почему: {card.why}</p>}
          {card.source && <p className="text-muted">Источник: {card.source}</p>}
          {card.last_display && <p className="text-muted">Касание: {card.last_display}</p>}
        </div>
      </button>

      {expanded && (
        <div className="mt-2.5 border-t border-line pt-2.5">
          <div className="flex flex-wrap gap-1.5">
            {btns.done && (
              <Button size="sm" variant="secondary" className={BTN}
                onClick={() => onAct({ action: 'complete_step', id: card.id })}>
                Сделал шаг
              </Button>
            )}
            {btns.snooze && (
              <Button size="sm" variant="secondary" className={BTN}
                onClick={() => onAct({ action: 'snooze', id: card.id })}>
                Отложить
              </Button>
            )}
            {btns.decline && (
              <Button size="sm" variant="danger" className={BTN}
                onClick={() => onAct({ action: 'decline', id: card.id })}>
                Отказ
              </Button>
            )}
            {btns.reactivate && (
              <Button size="sm" variant="secondary" className={BTN}
                onClick={() => onAct({ action: 'reactivate', id: card.id })}>
                Вернуть
              </Button>
            )}
            <Button size="sm" variant="ghost" className={BTN}
              onClick={() => setEditor((e) => (e === 'step' ? null : 'step'))}>
              Шаг
            </Button>
            <Button size="sm" variant="ghost" className={BTN}
              onClick={() => setEditor((e) => (e === 'stage' ? null : 'stage'))}>
              Стадия
            </Button>
          </div>

          {editor === 'step' && (
            <div className="mt-2 space-y-2">
              <input value={stepText} onChange={(e) => setStepText(e.target.value)}
                placeholder="Что сделать дальше" autoFocus className={`w-full ${inputCls}`} />
              <div className="flex flex-wrap items-center gap-2">
                <select value={stepOwner} onChange={(e) => setStepOwner(e.target.value as 'owner' | 'agent' | 'contact')}
                  className={inputCls}>
                  <option value="owner">мой ход</option>
                  <option value="agent">ход агента</option>
                  <option value="contact">ждем контакта</option>
                </select>
                <input type="date" value={stepDue} onChange={(e) => setStepDue(e.target.value)} className={inputCls} />
                <Button size="sm" variant="primary" className={BTN} disabled={!stepText.trim()}
                  onClick={() => onAct({
                    action: 'set_next_step', id: card.id, text: stepText.trim(),
                    owner: stepOwner, due: stepDue || undefined,
                  })}>
                  Записать шаг
                </Button>
              </div>
            </div>
          )}

          {editor === 'stage' && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input value={stageText} onChange={(e) => setStageText(e.target.value)}
                placeholder="Новая стадия" autoFocus className={`flex-1 min-w-40 ${inputCls}`} />
              <Button size="sm" variant="primary" className={BTN} disabled={!stageText.trim()}
                onClick={() => onAct({ action: 'set_stage', id: card.id, stage: stageText.trim() })}>
                Сменить стадию
              </Button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </Card>
  );
}
