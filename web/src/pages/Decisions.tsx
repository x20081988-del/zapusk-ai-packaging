import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, MoonStar, RefreshCw, XCircle } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { BalancesStrip } from '../components/ui/BalancesStrip';
import { renderInlineMarkup } from '../lib/markup';
import {
  actionLabel,
  applyDecision,
  decisionErrorText,
  DecideError,
  fetchPack,
  groupByKind,
  kindLabel,
  packDate,
  fetchImageObjectUrl,
  needsComment,
  snapshotLabel,
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
  // stale: мак недоступен, показан последний снимок от fetchedAt. Смотреть можно,
  // решать нельзя - кнопки в этом режиме глушатся, действие все равно не доедет.
  | { phase: 'ready'; pack: DecidePack; stale: boolean; fetchedAt: string | null }
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
      'Связка с маком не настроена на сервере. Это правится в настройках хостинга, будить мак не нужно.',
  },
  source_auth: {
    title: 'Секрет моста разъехался',
    description:
      'Источник не принял секрет связки. Лечится обновлением секрета в настройках хостинга, мак будить не нужно.',
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
  const [showAll, setShowAll] = useState(false);
  // Повторный «Обновить» во время загрузки не должен плодить параллельные запросы:
  // два ответа вразнобой перерисовали бы экран дважды и потеряли бы порядок.
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async (isRefresh = false, all = false) => {
    if (inFlight.current) inFlight.current.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    if (isRefresh) setRefreshing(true);
    else setStatus({ phase: 'loading' });
    try {
      const res = await fetchPack(ctrl.signal, all);
      if (ctrl.signal.aborted) return;
      setStatus({ phase: 'ready', pack: res.pack, stale: res.stale, fetchedAt: res.fetchedAt });
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

  const frozen = status.phase === 'ready' && status.stale;

  async function decide(item: DecideItem, action: string) {
    // Второй пояс к задизейбленным кнопкам: по снимку не решают.
    if (frozen) return;
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
          onClick={() => void load(true, showAll)}
          loading={refreshing}
          iconLeft={<RefreshCw className="w-4 h-4" />}
        >
          Обновить
        </Button>
      }
    >
      <div className="max-w-3xl">
        {/* Балансы сервисов и расход на ИИ. Отдельной страницы им не надо: владелец
            приходит сюда каждый день, и цифра «сколько осталось» должна попадаться
            ему на глаза по дороге к решениям, а не ждать отдельного клика. */}
        <BalancesStrip />

        <p className="text-sm text-secondary mb-5">
          {status.phase === 'ready' ? headline(status.pack, outcomes) : 'Очередь из telegram-agent'}
        </p>

        {frozen && status.phase === 'ready' && (
          <div className="mb-4 rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-secondary flex items-start gap-2.5">
            <MoonStar className="w-4 h-4 mt-0.5 shrink-0 text-muted" />
            <span>
              <span className="font-medium text-primary">Мак сейчас недоступен.</span>{' '}
              Это снимок очереди на {snapshotLabel(status.fetchedAt) || 'последний удачный момент'}.
              Кнопки решений заработают, когда мак проснется.{' '}
              <button
                type="button"
                onClick={() => void load(true, showAll)}
                className="underline underline-offset-2 hover:text-primary"
              >
                Проверить снова
              </button>
            </span>
          </div>
        )}

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
            {(status.pack.degraded?.length ?? 0) > 0 ? (
              // Все живые источники пусты, но часть недоступна: писать «очередь
              // пуста» рядом с баннером «решения есть, показать нельзя» - это два
              // взаимоисключающих утверждения на одном экране.
              <EmptyState
                icon={<AlertTriangle className="w-6 h-6 text-warning" />}
                title="Показать нечего"
                description="Доступные источники пусты, но часть очереди не загрузилась - решения там могут быть."
                action={
                  <Button variant="secondary" onClick={() => void load(true, showAll)} loading={refreshing}>
                    Повторить
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<Inbox className="w-6 h-6" />}
                title="Решений нет"
                description="Очередь пуста. Ничего не ждет твоего ответа прямо сейчас."
              />
            )}
          </Card>
        )}

        {status.phase === 'ready' && allSettled(status.pack, outcomes) && (
          <Card className="p-5 mb-5 text-center">
            <p className="text-sm font-semibold text-primary mb-1">
              {status.pack.total > status.pack.items.length ? 'Показанное разобрано' : 'Все разобрано'}
            </p>
            <p className="text-sm text-secondary mb-3">
              {status.pack.total > status.pack.items.length
                ? `За кадром еще ${status.pack.total - status.pack.items.length}.`
                : 'Очередь на сегодня закрыта.'}
            </p>
            {status.pack.total > status.pack.items.length && !showAll && !frozen && (
              <Button variant="secondary" size="sm" onClick={() => { setShowAll(true); void load(true, true); }}>
                Показать следующие {status.pack.total - status.pack.items.length}
              </Button>
            )}
          </Card>
        )}

        {status.phase === 'ready' && status.pack.items.length > 0 && (
          <div className="space-y-7">
            {groupByKind(status.pack.items).map((group) => (
              <section key={group.kind}>
                <h2 className="text-xs uppercase tracking-wide text-muted mb-1">
                  {kindLabel(group.kind)}
                  <span className="ml-2 text-muted/70">{group.items.length}</span>
                </h2>
                {/* Подсказка одна на группу: действия у вида общие, и та же фраза
                    на каждой карточке четыре раза подряд - шум, а не помощь. */}
                {group.items[0]?.hint && (
                  <p className="text-xs text-muted mb-2.5">{group.items[0].hint}</p>
                )}
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
                        frozen={frozen}
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

        {/* «Показать следующие» в stale прячем: глубже снимка сервер все равно не отдаст. */}
        {status.phase === 'ready' && status.pack.total > status.pack.items.length && !showAll && !frozen && (
          <div className="mt-6 text-center">
            <Button variant="ghost" size="sm" onClick={() => { setShowAll(true); void load(true, true); }}>
              Показать следующие {status.pack.total - status.pack.items.length}
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

/** Живая шапка: сколько осталось разобрать прямо сейчас, а не статичная надпись. */
function headline(pack: DecidePack, outcomes: Record<string, Outcome>): string {
  const done = pack.items.filter((it) => outcomes[`${it.kind}:${it.id}`]?.state === 'done').length;
  const left = pack.items.length - done;
  const date = packDate(pack.date);
  if (left <= 0) return `Разобрано ${done} за ${date}`;
  if (done > 0) return `Осталось ${left} из ${pack.items.length} за ${date}`;
  return pack.total > pack.items.length
    ? `${pack.items.length} на разбор за ${date}, всего ${pack.total}`
    : `${pack.items.length} на разбор за ${date}`;
}

function allSettled(pack: DecidePack, outcomes: Record<string, Outcome>): boolean {
  return (
    pack.items.length > 0 &&
    pack.items.every((it) => outcomes[`${it.kind}:${it.id}`]?.state === 'done')
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

const BODY_CLAMP = 420;

function DecisionCard({
  item,
  outcome,
  draft,
  editorFor,
  frozen,
  onDraft,
  onOpenEditor,
  onDecide,
}: {
  item: DecideItem;
  outcome?: Outcome;
  draft: string;
  editorFor: string | null;
  /** Пакет показан из снимка: мак спит, действия не доедут - кнопки глушим. */
  frozen: boolean;
  onDraft: (v: string) => void;
  onOpenEditor: (action: string | null) => void;
  onDecide: (action: string) => void;
}) {
  const busy = outcome?.state === 'busy';
  const settled = outcome?.state === 'done';
  const [expanded, setExpanded] = useState(false);
  // «Закрыть» снимает задачу с повестки насовсем, а кнопка стоит через одну от «Да».
  // Первый клик - вопрос, второй - действие; через 4 секунды вопрос сбрасывается.
  const [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => {
    if (!confirmClose) return;
    const id = setTimeout(() => setConfirmClose(false), 4000);
    return () => clearTimeout(id);
  }, [confirmClose]);

  const longBody = (item.body?.length ?? 0) > BODY_CLAMP;
  const bodyText = !item.body ? '' : expanded || !longBody ? item.body : item.body.slice(0, BODY_CLAMP);

  return (
    <Card className={`p-4 ${settled ? 'opacity-70' : ''}`}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm font-semibold text-primary">{item.who}</span>
        {item.context && <span className="text-xs text-muted">{item.context}</span>}
      </div>

      {/* Заголовок, дословно равный имени, не повторяем: «Зоя» два раза подряд -
          шум. У таких карточек суть лежит в теле. */}
      {item.title && item.title !== item.who && (
        <p className="text-sm text-primary mt-1.5 leading-relaxed">{item.title}</p>
      )}

      {item.body && (
        // Разметку разбираем: тела приходят сверстанными под Telegram, и владелец
        // видел бы `**SPV**` звездочками. Длинное тело сворачиваем: решение по
        // простыне не читается, но и резать текст насовсем нельзя - «развернуть»
        // отдает его целиком.
        <p className="text-sm text-secondary mt-2 whitespace-pre-wrap leading-relaxed break-words">
          {renderInlineMarkup(bodyText)}
          {longBody && !expanded && '...'}
          {longBody && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="ml-2 text-xs text-muted underline underline-offset-2 hover:text-primary"
            >
              {expanded ? 'свернуть' : 'развернуть'}
            </button>
          )}
        </p>
      )}

      {/* Sprint 63.P8 - превью картинки к посту. Решение «да» по карточке канала
          означает публикацию, а пост уходит с изображением: без него владелец
          одобрял бы вслепую. Раньше картинку показывал дублирующий пуш в бота.
          Картинки может не быть - тогда onError убирает блок и карточка живет без
          него, а не показывает битую иконку. */}
      {item.kind === 'channel' && item.id.endsWith(':pending') && (
        <ChannelPreview channel={item.id.split(':')[0]} />
      )}


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
              disabled={busy || settled || blocked || frozen}
              onClick={() => {
                if (action === 'close' && !confirmClose) {
                  setConfirmClose(true);
                  return;
                }
                if (action === 'close') setConfirmClose(false);
                if (wantsComment && !editorOpen) {
                  onOpenEditor(action);
                  return;
                }
                onDecide(action);
              }}
            >
              {action === 'close' && confirmClose ? 'Точно закрыть?' : actionLabel(action)}
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

/** Картинка к готовому посту. Молча исчезает, если ее нет. */
function ChannelPreview({ channel }: { channel: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    let objectUrl: string | null = null;
    fetchImageObjectUrl(`/api/decide/image/${channel}`, ctrl.signal)
      .then((u) => {
        if (ctrl.signal.aborted) {
          if (u) URL.revokeObjectURL(u);
          return;
        }
        objectUrl = u;
        setUrl(u);
      })
      .catch(() => {
        /* картинки может не быть - карточка живет без нее */
      });
    return () => {
      ctrl.abort();
      // Отзываем обязательно: blob иначе живет до перезагрузки вкладки, а экран
      // открывают по многу раз в день.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [channel]);

  if (!url) return null;
  return (
    <img
      src={url}
      alt="Картинка к посту"
      className="mt-3 rounded-md border border-line max-h-72 w-auto max-w-full object-contain"
    />
  );
}
