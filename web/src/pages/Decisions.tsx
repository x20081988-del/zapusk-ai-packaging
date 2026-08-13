import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, RefreshCw, XCircle } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import {
  actionLabel,
  applyDecision,
  decisionErrorText,
  DecideError,
  fetchPack,
  groupByKind,
  kindLabel,
  packDate,
  needsComment,
  sortActions,
  type DecideItem,
  type DecidePack,
} from '../lib/decide';

// Sprint 63.P1 - экран «Решения».
//
// Очередь решений владельца жила в телеграм-боте. Экран /decide в telegram-agent за всю
// историю открывали девять раз: ссылка вела через туннель, который менял адрес при каждом
// рестарте. Здесь та же очередь, но по нормальному постоянному адресу и под обычным
// логином.
//
// Источник правды остается в telegram-agent. Эта страница ничего не считает сама и ничего
// не запоминает: пакет приходит целиком, решение уходит обратно тем же путем, что кнопка
// в боте.

type Status =
  | { phase: 'loading' }
  | { phase: 'ready'; pack: DecidePack }
  | { phase: 'failed'; failure: DecideError };

/** Результат решения по одной карточке - живет рядом с ней, а не в глобальном тосте. */
type Outcome = { state: 'busy' } | { state: 'done'; text: string } | { state: 'error'; text: string };

const FAILURE_COPY: Record<string, { title: string; description: string }> = {
  source_unreachable: {
    title: 'Источник недоступен',
    description:
      'Мак не отвечает: спит, офлайн или закрыт туннель. Очередь цела, показать ее сейчас нельзя.',
  },
  source_not_configured: {
    title: 'Мост к источнику не настроен',
    description:
      'В настройках сервера пустые DECIDE_BRIDGE_URL или DECIDE_BRIDGE_TOKEN. Это правится в конфигурации, будить мак не нужно.',
  },
  source_auth: {
    title: 'Секрет моста разъехался',
    description:
      'Источник не принял наш секрет. Нужно обновить DECIDE_BRIDGE_TOKEN, чтобы он совпал с тем, что на маке.',
  },
  source_rate_limited: {
    title: 'Слишком часто',
    description: 'Источник попросил притормозить. Повтори через минуту.',
  },
  unknown: {
    title: 'Очередь не загрузилась',
    description: 'Источник ответил неожиданно. Подробности в журнале сервера.',
  },
};

export function Decisions() {
  const [status, setStatus] = useState<Status>({ phase: 'loading' });
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [openEditor, setOpenEditor] = useState<Record<string, string | null>>({});
  const [refreshing, setRefreshing] = useState(false);
  // Повторный «Обновить» во время загрузки не должен плодить параллельные запросы:
  // два ответа вразнобой перерисовали бы экран дважды и потеряли бы порядок.
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (inFlight.current) inFlight.current.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    if (isRefresh) setRefreshing(true);
    else setStatus({ phase: 'loading' });
    try {
      const pack = await fetchPack(ctrl.signal);
      if (ctrl.signal.aborted) return;
      setStatus({ phase: 'ready', pack });
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
    void load();
    return () => inFlight.current?.abort();
    // Автополлинга нет намеренно: фоновый цикл жег бы трафик к маку впустую, а очередь
    // меняется от силы несколько раз в день.
  }, [load]);

  const keyOf = (it: DecideItem) => `${it.kind}:${it.id}`;

  async function decide(item: DecideItem, action: string) {
    const key = keyOf(item);
    if (outcomes[key]?.state === 'busy') return;
    const comment = (drafts[key] ?? '').trim();
    if (needsComment(action) && !comment) return;

    setOutcomes((prev) => ({ ...prev, [key]: { state: 'busy' } }));
    try {
      const res = await applyDecision({ kind: item.kind, id: item.id, action, comment: comment || undefined });
      setOutcomes((prev) => ({ ...prev, [key]: { state: 'done', text: res.detail || 'принято' } }));
      setOpenEditor((prev) => ({ ...prev, [key]: null }));
    } catch (e) {
      // Ошибка по одной карточке не должна уносить остальную очередь: владелец разбирает
      // пакет целиком, и терять восемнадцать карточек из-за одной неудачной - плохой обмен.
      setOutcomes((prev) => ({ ...prev, [key]: { state: 'error', text: decisionErrorText(e) } }));
    }
  }

  return (
    <AppLayout
      title="Решения"
      action={
        <Button
          variant="secondary"
          size="md"
          onClick={() => void load(true)}
          loading={refreshing}
          iconLeft={<RefreshCw className="w-4 h-4" />}
        >
          Обновить
        </Button>
      }
    >
      <div className="max-w-3xl">
        <p className="text-sm text-secondary mb-5">
          {status.phase === 'ready'
            ? status.pack.total > status.pack.shown
              ? `Показано ${status.pack.shown} из ${status.pack.total} за ${packDate(status.pack.date)}`
              : `${status.pack.shown} на разбор за ${packDate(status.pack.date)}`
            : 'Очередь из telegram-agent'}
        </p>

        {status.phase === 'ready' && (status.pack.degraded?.length ?? 0) > 0 && (
          <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning">
            <span className="font-medium">Очередь неполная.</span>{' '}
            Не загрузились: {status.pack.degraded!.map(kindLabel).join(', ')}. Эти решения есть,
            но показать их сейчас нельзя.
          </div>
        )}

        {status.phase === 'loading' && <LoadingSkeleton />}

        {status.phase === 'failed' && (
          <Card className="p-0">
            <EmptyState
              icon={<AlertTriangle className="w-6 h-6 text-danger" />}
              title={(FAILURE_COPY[status.failure.failure] ?? FAILURE_COPY.unknown).title}
              description={(FAILURE_COPY[status.failure.failure] ?? FAILURE_COPY.unknown).description}
              action={
                <Button variant="secondary" onClick={() => void load(true)} loading={refreshing}>
                  Повторить
                </Button>
              }
            />
          </Card>
        )}

        {status.phase === 'ready' && status.pack.items.length === 0 && (
          <Card className="p-0">
            <EmptyState
              icon={<Inbox className="w-6 h-6" />}
              title="Решений нет"
              description="Очередь пуста. Ничего не ждет твоего ответа прямо сейчас."
            />
          </Card>
        )}

        {status.phase === 'ready' && status.pack.items.length > 0 && (
          <div className="space-y-7">
            {groupByKind(status.pack.items).map((group) => (
              <section key={group.kind}>
                <h2 className="text-xs uppercase tracking-wide text-muted mb-2.5">
                  {kindLabel(group.kind)}
                  <span className="ml-2 text-muted/70">{group.items.length}</span>
                </h2>
                <div className="space-y-3">
                  {group.items.map((item) => {
                    const key = keyOf(item);
                    return (
                      <DecisionCard
                        key={key}
                        item={item}
                        outcome={outcomes[key]}
                        draft={drafts[key] ?? ''}
                        editorFor={openEditor[key] ?? null}
                        onDraft={(v) => setDrafts((p) => ({ ...p, [key]: v }))}
                        onOpenEditor={(a) => setOpenEditor((p) => ({ ...p, [key]: a }))}
                        onDecide={(a) => void decide(item, a)}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

/** Скелет вместо пустоты: показать «решений нет» до первого ответа значит соврать. */
function LoadingSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Загрузка очереди">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-4">
          <div className="animate-pulse space-y-2.5">
            <div className="h-3 w-1/3 bg-surface rounded" />
            <div className="h-4 w-3/4 bg-surface rounded" />
            <div className="h-3 w-1/2 bg-surface rounded" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function DecisionCard({
  item,
  outcome,
  draft,
  editorFor,
  onDraft,
  onOpenEditor,
  onDecide,
}: {
  item: DecideItem;
  outcome?: Outcome;
  draft: string;
  editorFor: string | null;
  onDraft: (v: string) => void;
  onOpenEditor: (action: string | null) => void;
  onDecide: (action: string) => void;
}) {
  const busy = outcome?.state === 'busy';
  const settled = outcome?.state === 'done';

  return (
    <Card className={`p-4 ${settled ? 'opacity-70' : ''}`}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm font-semibold text-primary">{item.who}</span>
        {item.context && <span className="text-xs text-muted">{item.context}</span>}
      </div>

      <p className="text-sm text-primary mt-1.5 leading-relaxed">{item.title}</p>

      {item.body && (
        <p className="text-sm text-secondary mt-2 whitespace-pre-wrap leading-relaxed break-words">
          {item.body}
        </p>
      )}

      {item.hint && <p className="text-xs text-muted mt-2.5">{item.hint}</p>}

      {editorFor && (
        <div className="mt-3">
          <textarea
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            rows={3}
            autoFocus
            placeholder={editorFor === 'answer' ? 'Что ответить' : 'Что поменять'}
            className="w-full rounded-md bg-surface border border-line text-sm text-primary p-2.5 placeholder:text-muted focus:outline-none focus:border-zapusk/50"
          />
          {!draft.trim() && (
            <p className="text-xs text-muted mt-1">
              {actionLabel(editorFor)} без комментария источник не примет
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3.5">
        {sortActions(item.actions).map((action) => {
          const wantsComment = needsComment(action);
          const editorOpen = editorFor === action;
          // Действие с комментарием сначала раскрывает поле, и только вторым нажатием
          // отправляет: иначе владелец жмет «Правка» и получает 400 от источника.
          const blocked = wantsComment && editorOpen && !draft.trim();
          return (
            <Button
              key={action}
              size="sm"
              // На телефоне цель должна быть не меньше 44px: владелец разбирает очередь
              // с телефона, а рядом с «Да» стоит необратимое «Закрыть». На широком
              // экране возвращаемся к компактному размеру, иначе двадцать карточек по
              // три крупные кнопки превращаются в стену.
              className="min-h-11 px-4 sm:min-h-8 sm:px-3"
              variant={action === 'approve' ? 'primary' : action === 'close' ? 'danger' : 'secondary'}
              disabled={busy || settled || blocked}
              onClick={() => {
                if (wantsComment && !editorOpen) {
                  onOpenEditor(action);
                  return;
                }
                onDecide(action);
              }}
            >
              {actionLabel(action)}
            </Button>
          );
        })}

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
    </Card>
  );
}
