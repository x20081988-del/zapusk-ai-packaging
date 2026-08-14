import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { CrmNav } from '../components/crm/CrmNav';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { DecideError, decisionErrorText } from '../lib/decide';
import { SOURCE_FAILURE_COPY } from '../lib/sourceFailure';
import {
  crmwebDealAction,
  DEAL_STATUS_LABEL,
  fetchCrmwebDeal,
  fetchCrmwebDeals,
  fetchCrmwebMeta,
  type CrmwebDeal,
  type CrmwebDealPayload,
  type CrmwebMeta,
  type DealActionInput,
} from '../lib/crmweb';

// Sprint 63.P13 - воронки сделок (/p/* из crm_web).
//
// Этапы и лейблы приходят из meta (config.CRM_PIPELINES источника) - здесь нет
// ни одного захардкоженного слага. Клик открывает карточку сделки, перетаскивание
// меняет этап в базе сразу; перенос закрытой сделки на этап возвращает ее в
// работу - так делает источник (set_stage с reactivate).

type Status =
  | { phase: 'loading' }
  | { phase: 'ready'; deals: CrmwebDeal[] }
  | { phase: 'failed'; failure: DecideError };

const BTN = 'min-h-11 px-4 sm:min-h-8 sm:px-3';

export function CrmPipeline() {
  const { slug = '' } = useParams();
  const [meta, setMeta] = useState<CrmwebMeta | null>(null);
  const [status, setStatus] = useState<Status>({ phase: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [openDeal, setOpenDeal] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [boardError, setBoardError] = useState('');
  const inFlight = useRef<AbortController | null>(null);

  const pipeline = meta?.pipelines.find((p) => p.slug === slug) ?? null;

  const load = useCallback(async (isRefresh = false) => {
    if (inFlight.current) inFlight.current.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    if (isRefresh) setRefreshing(true);
    else setStatus({ phase: 'loading' });
    try {
      const [m, deals] = await Promise.all([
        meta ? Promise.resolve(meta) : fetchCrmwebMeta(ctrl.signal),
        fetchCrmwebDeals(slug, ctrl.signal),
      ]);
      if (ctrl.signal.aborted) return;
      setMeta(m);
      setStatus({ phase: 'ready', deals });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setStatus({ phase: 'failed', failure: e instanceof DecideError ? e : new DecideError('unknown', String(e)) });
    } finally {
      if (inFlight.current === ctrl) inFlight.current = null;
      setRefreshing(false);
    }
    // meta намеренно вне зависимостей: перезагружать справочник на каждый рефреш незачем
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    setQuery('');
    setOpenDeal(null);
    void load();
    return () => inFlight.current?.abort();
  }, [load]);

  const deals = status.phase === 'ready' ? status.deals : [];
  const active = useMemo(() => deals.filter((d) => d.status === 'active'), [deals]);
  const closed = deals.length - active.length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return active;
    return active.filter((d) =>
      [d.title, d.name, d.handle, d.company].some((v) => (v || '').toLowerCase().includes(q)));
  }, [active, query]);

  const byStage = useMemo(() => {
    const m = new Map<string, CrmwebDeal[]>();
    for (const d of visible) {
      const bucket = m.get(d.stage);
      if (bucket) bucket.push(d);
      else m.set(d.stage, [d]);
    }
    return m;
  }, [visible]);

  // Хвост доски - Выиграно/Пауза/Отказ, как у источника (DEAL_TERMINAL):
  // закрытая сделка не исчезает с доски, а перетаскивание ее на этап
  // возвращает в работу (reactivate внутри set_stage источника).
  const byStatus = useMemo(() => {
    const q = query.trim().toLowerCase();
    const m: Record<string, CrmwebDeal[]> = { won: [], paused: [], lost: [] };
    for (const d of deals) {
      if (d.status === 'active') continue;
      if (q && ![d.title, d.name, d.handle, d.company].some((v) => (v || '').toLowerCase().includes(q))) continue;
      (m[d.status] ?? (m[d.status] = [])).push(d);
    }
    return m;
  }, [deals, query]);

  async function apply(input: DealActionInput) {
    setBoardError('');
    try {
      await crmwebDealAction(input);
      void load(true);
    } catch (e) {
      setBoardError(decisionErrorText(e));
      void load(true);
    }
  }

  function onDropStage(stage: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData('text/deal-id'));
    const deal = deals.find((d) => d.id === id);
    // Закрытую сделку на этап МОЖНО: источник вернет ее в работу одной транзакцией.
    if (!deal || (deal.stage === stage && deal.status === 'active')) return;
    void apply({ action: 'set_stage', id, stage });
  }

  function onDropStatus(status: 'won' | 'paused' | 'lost', e: React.DragEvent) {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData('text/deal-id'));
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.status === status) return;
    void apply({ action: 'set_status', id, status });
  }

  return (
    <AppLayout
      title={pipeline ? pipeline.label : 'Воронка сделок'}
      action={
        <Button variant="secondary" size="md" onClick={() => void load(true)} loading={refreshing}
          iconLeft={<RefreshCw className="w-4 h-4" />}>
          Обновить
        </Button>
      }
    >
      <div>
        <CrmNav active={`/crm/p/${slug}`} />
        <p className="text-sm text-secondary mb-4">
          {status.phase === 'ready'
            ? `Сделки: ${active.length}${closed > 0 ? ` (+${closed} закрыто или отложено)` : ''}. Живая воронка - клик открывает сделку, перетаскивание меняет этап в базе сразу.`
            : 'Воронка сделок из telegram-agent'}
        </p>

        {status.phase === 'ready' && (
          <>
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по названию / контакту / компании..."
              className="w-full rounded-md bg-surface border border-line text-sm text-primary p-2.5 placeholder:text-muted focus:outline-none focus:border-zapusk/50" />
            <p className="text-xs text-muted mt-1.5 mb-4">Видно: {visible.length} из {active.length}</p>
          </>
        )}

        {boardError && <p className="text-xs text-danger mb-3">{boardError}</p>}

        {status.phase === 'loading' && (
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6" aria-busy="true">
            {[0, 1, 2].map((i) => (
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

        {status.phase === 'ready' && !pipeline && (
          <Card className="p-0">
            <EmptyState icon={<AlertTriangle className="w-6 h-6 text-warning" />} title="Нет такой воронки"
              description="Слаг воронки не найден в справочнике источника." />
          </Card>
        )}

        {status.phase === 'ready' && pipeline && (
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4 items-start">
            {pipeline.stages.map((s) => (
              <PipelineColumn key={s.slug} id={s.slug} label={s.label} accent="border-t-success/50"
                list={byStage.get(s.slug) ?? []} dragOver={dragOver === s.slug}
                onDragOverCol={() => setDragOver(s.slug)}
                onDragLeaveCol={() => setDragOver((v) => (v === s.slug ? null : v))}
                onDropCol={(e) => onDropStage(s.slug, e)} onOpen={setOpenDeal} />
            ))}
            {(['won', 'paused', 'lost'] as const).map((st) => (
              <PipelineColumn key={st} id={`status:${st}`}
                label={{ won: 'Выиграно', paused: 'Пауза', lost: 'Отказ' }[st]}
                accent={{ won: 'border-t-zapusk/60', paused: 'border-t-warning/60', lost: 'border-t-line' }[st]}
                list={byStatus[st] ?? []} dragOver={dragOver === `status:${st}`}
                onDragOverCol={() => setDragOver(`status:${st}`)}
                onDragLeaveCol={() => setDragOver((v) => (v === `status:${st}` ? null : v))}
                onDropCol={(e) => onDropStatus(st, e)} onOpen={setOpenDeal} />
            ))}
          </div>
        )}
      </div>

      {openDeal !== null && (
        <DealModal dealId={openDeal} onClose={() => setOpenDeal(null)}
          onMutated={() => void load(true)} />
      )}
    </AppLayout>
  );
}

function PipelineColumn({
  id, label, accent, list, dragOver, onDragOverCol, onDragLeaveCol, onDropCol, onOpen,
}: {
  id: string;
  label: string;
  accent: string;
  list: CrmwebDeal[];
  dragOver: boolean;
  onDragOverCol: () => void;
  onDragLeaveCol: () => void;
  onDropCol: (e: React.DragEvent) => void;
  onOpen: (id: number) => void;
}) {
  return (
    <div key={id}
      onDragOver={(e) => { e.preventDefault(); onDragOverCol(); }}
      onDragLeave={onDragLeaveCol}
      onDrop={onDropCol}
      className={`rounded-lg bg-surface/40 p-2 border-t-2 ${accent} ${dragOver ? 'ring-2 ring-zapusk/40' : ''}`}>
      <p className="text-sm font-semibold text-primary px-1.5 py-1">
        {label} <span className="text-muted font-normal">{list.length}</span>
      </p>
      <div className="space-y-2 mt-1">
        {list.map((d) => (
          <Card key={d.id} draggable
            onDragStart={(e: React.DragEvent) => e.dataTransfer.setData('text/deal-id', String(d.id))}
            className="p-2.5 cursor-grab active:cursor-grabbing">
            <button type="button" onClick={() => onOpen(d.id)} className="w-full text-left">
              <p className="text-xs text-muted">{d.id}</p>
              <p className="text-sm font-medium text-primary">{d.title}</p>
              <p className={`text-xs mt-0.5 ${d.step_display === 'не задан' ? 'text-danger' : 'text-secondary'}`}>
                {d.step_display === 'не задан' ? 'шаг не задан' : d.step_display}
              </p>
            </button>
          </Card>
        ))}
        {list.length === 0 && <p className="text-xs text-muted px-1.5 py-2">пусто</p>}
      </div>
    </div>
  );
}

function DealModal({ dealId, onClose, onMutated }: { dealId: number; onClose: () => void; onMutated: () => void }) {
  const [payload, setPayload] = useState<CrmwebDealPayload | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [stepText, setStepText] = useState('');
  const [stepOwner, setStepOwner] = useState<'owner' | 'agent' | 'contact'>('owner');
  const [stepDue, setStepDue] = useState('');
  const [stepOpen, setStepOpen] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchCrmwebDeal(dealId, ctrl.signal)
      .then((p) => setPayload(p))
      .catch((e) => { if (!ctrl.signal.aborted) setError(decisionErrorText(e)); });
    return () => ctrl.abort();
  }, [dealId]);

  async function act(input: DealActionInput) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await crmwebDealAction(input);
      // Источник отдает свежий payload вместе с патчем доски - модалка живет правдой.
      setPayload(res.payload);
      onMutated();
    } catch (e) {
      setError(decisionErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const d = payload?.deal;

  return (
    <Modal open onClose={onClose} title={d ? d.title : `Сделка #${dealId}`}>
      {!d && !error && <p className="text-sm text-muted p-2">загружаю...</p>}
      {error && <p className="text-sm text-danger p-2">{error}</p>}
      {d && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>{d.pipeline_label}</span>
            <span>статус: <b className="text-secondary">{d.status_label}</b></span>
            {d.handle && (
              <a href={d.handle_url || undefined} target="_blank" rel="noreferrer" className="text-zapusk hover:underline">
                {d.handle}
              </a>
            )}
            {d.company && <span>{d.company}</span>}
            {d.amount && <span>{d.amount}</span>}
            {d.last_display && <span>касание {d.last_display}</span>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted">Этап:</label>
            <select value={d.stage} disabled={busy}
              onChange={(e) => void act({ action: 'set_stage', id: d.id, stage: e.target.value })}
              className="rounded-md bg-surface border border-line text-sm text-primary p-2 focus:outline-none focus:border-zapusk/50">
              {payload!.stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            {(['active', 'won', 'lost', 'paused'] as const).filter((s) => s !== d.status).map((s) => (
              <Button key={s} size="sm" variant={s === 'lost' ? 'danger' : 'secondary'} className={BTN} disabled={busy}
                onClick={() => void act({ action: 'set_status', id: d.id, status: s })}>
                {DEAL_STATUS_LABEL[s]}
              </Button>
            ))}
          </div>

          <div>
            <p className={d.step_display === 'не задан' ? 'text-danger' : 'text-secondary'}>
              Следующий шаг: {d.step_display}
            </p>
            {!stepOpen ? (
              <Button size="sm" variant="ghost" className={`${BTN} mt-1`} onClick={() => setStepOpen(true)}>
                Изменить шаг
              </Button>
            ) : (
              <div className="mt-2 space-y-2">
                <input value={stepText} onChange={(e) => setStepText(e.target.value)}
                  placeholder="Что сделать дальше" autoFocus
                  className="w-full rounded-md bg-surface border border-line text-sm text-primary p-2 placeholder:text-muted focus:outline-none focus:border-zapusk/50" />
                <div className="flex flex-wrap items-center gap-2">
                  <select value={stepOwner} onChange={(e) => setStepOwner(e.target.value as 'owner' | 'agent' | 'contact')}
                    className="rounded-md bg-surface border border-line text-sm text-primary p-2">
                    <option value="owner">мой ход</option>
                    <option value="agent">ход агента</option>
                    <option value="contact">ждем контакта</option>
                  </select>
                  <input type="date" value={stepDue} onChange={(e) => setStepDue(e.target.value)}
                    className="rounded-md bg-surface border border-line text-sm text-primary p-2" />
                  <Button size="sm" variant="primary" className={BTN} disabled={busy || !stepText.trim()}
                    onClick={() => void act({
                      action: 'set_next_step', id: d.id, text: stepText.trim(),
                      owner: stepOwner, due: stepDue || undefined,
                    })}>
                    Записать шаг
                  </Button>
                </div>
              </div>
            )}
          </div>

          {d.notes && <p className="text-xs text-secondary whitespace-pre-wrap">{d.notes}</p>}
          {d.source && <p className="text-xs text-muted">Источник: {d.source}</p>}
          {d.card_id > 0 && (
            <p className="text-xs text-muted">
              Карточка канбана #{d.card_id} - <Link to="/crm/board" className="text-zapusk hover:underline">открыть доску</Link>
            </p>
          )}

          {payload!.links.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted mb-1.5">Материалы</p>
              <div className="space-y-1">
                {payload!.links.map((l, i) => (
                  <p key={i} className="text-xs">
                    <span className="text-muted">{l.kind_label}: </span>
                    <a href={l.url} target="_blank" rel="noreferrer" className="text-zapusk hover:underline">
                      {l.label || l.url}
                    </a>
                    {l.date && <span className="text-muted"> · {l.date}</span>}
                  </p>
                ))}
              </div>
            </div>
          )}

          {payload!.related.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted mb-1.5">Тот же контакт</p>
              <div className="space-y-1">
                {payload!.related.map((r) => (
                  <p key={r.id} className="text-xs">
                    <Link to={`/crm/p/${r.pipeline}`} className="text-zapusk hover:underline">{r.label}</Link>
                  </p>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs uppercase tracking-wide text-muted mb-1.5">История</p>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {payload!.events.length === 0 && <p className="text-xs text-muted">пусто</p>}
              {/* Свежее сверху, как у источника: владелец открывает сделку узнать,
                  что было ПОСЛЕДНИМ, а не с чего все началось в феврале. */}
              {payload!.events.slice().reverse().map((e, i) => (
                <p key={i} className="text-xs text-secondary">
                  <span className="text-muted">{e.date} · {e.kind_label}:</span> {e.text}
                </p>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Заметка к сделке"
              onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) { void act({ action: 'add_note', id: d.id, text: note.trim() }); setNote(''); } }}
              className="flex-1 rounded-md bg-surface border border-line text-sm text-primary p-2 placeholder:text-muted focus:outline-none focus:border-zapusk/50" />
            <Button size="sm" variant="secondary" className={BTN} disabled={busy || !note.trim()}
              onClick={() => { void act({ action: 'add_note', id: d.id, text: note.trim() }); setNote(''); }}>
              Добавить
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
