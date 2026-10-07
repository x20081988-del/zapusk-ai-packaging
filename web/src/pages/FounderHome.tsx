import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, ChevronRight, Inbox, MoonStar, RefreshCw } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/ui/StatusBadge';
import { DueChip } from '../components/crm/DueChip';
import { SOURCE_FAILURE_COPY } from '../lib/sourceFailure';
import {
  clockLabel, fetchHome, HomeError, rub,
  type DealItem, type DeptItem, type HomePayload, type ProductItem, type ReportItem,
  type ReportingSection, type RevenueSection, type ServiceItem, type ServicesSection,
  type TasksSection, type TelegramSection, type TgItem,
} from '../lib/home';

// Sprint 70 - главная основателя (владелец 07.10.2026: «чтобы я заходил и все видел
// на одном экране»). Сверху шесть фокус-цифр, под ними топ-3 по каждой: кто ждет
// ответа в Telegram, подвисшие задачи, ближайшая отчетность, сервисы на исходе,
// сделки к выручке, продукты и отделы. Сводку считает мак и сам кладет на сайт раз
// в 5 минут, поэтому экран не пустеет, когда мак спит: видно, на какое время цифры.
// Секция без данных рисуется «нет данных», а не нулем.

const STALE_SEC = 15 * 60;

type Status =
  | { phase: 'loading' }
  | { phase: 'ready'; data: HomePayload }
  | { phase: 'failed'; failure: HomeError };

export function FounderHome() {
  const [status, setStatus] = useState<Status>({ phase: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (inFlight.current) inFlight.current.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    if (isRefresh) setRefreshing(true);
    else setStatus({ phase: 'loading' });
    try {
      const data = await fetchHome(ctrl.signal);
      if (ctrl.signal.aborted) return;
      setStatus({ phase: 'ready', data });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setStatus({ phase: 'failed', failure: e instanceof HomeError ? e : new HomeError('unknown', String(e)) });
    } finally {
      if (inFlight.current === ctrl) inFlight.current = null;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => inFlight.current?.abort();
  }, [load]);

  return (
    <AppLayout
      title="Главная"
      action={
        <Button variant="secondary" size="md" onClick={() => void load(true)} loading={refreshing}
          iconLeft={<RefreshCw className="w-4 h-4" />}>
          Обновить
        </Button>
      }
    >
      {status.phase === 'loading' && <LoadingSkeleton />}
      {status.phase === 'failed' && <Failure failure={status.failure} onRetry={() => void load(true)} />}
      {status.phase === 'ready' && <Home data={status.data} onRetry={() => void load(true)} />}
    </AppLayout>
  );
}

function Failure({ failure, onRetry }: { failure: HomeError; onRetry: () => void }) {
  const copy = failure.failure === 'not_received'
    ? {
        title: 'Сводка с мака еще не приходила',
        description: 'Мак присылает ее раз в 5 минут. Если ее нет дольше, значит мак выключен или спит.',
      }
    : SOURCE_FAILURE_COPY.unknown;
  return (
    <Card className="p-0">
      <EmptyState
        icon={<AlertTriangle className="w-6 h-6 text-danger" />}
        title={copy.title}
        description={copy.description}
        action={<Button variant="secondary" onClick={onRetry}>Повторить</Button>}
      />
    </Card>
  );
}

function Home({ data, onRetry }: { data: HomePayload; onRetry: () => void }) {
  const stale = data.age_sec > STALE_SEC;
  return (
    <div>
      {stale ? (
        <div className="mb-4 rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-secondary flex items-start gap-2.5">
          <MoonStar className="w-4 h-4 mt-0.5 shrink-0 text-muted" />
          <span>
            <span className="font-medium text-primary">Мак не присылал сводку с {clockLabel(data.generated_at)}.</span>{' '}
            Цифры на это время: мак выключен или спит.{' '}
            <button type="button" onClick={onRetry} className="underline underline-offset-2 hover:text-primary">
              Проверить снова
            </button>
          </span>
        </div>
      ) : (
        <p className="text-sm text-secondary mb-4">
          Сводка на {clockLabel(data.generated_at)}. Мак присылает ее сам раз в 5 минут.
        </p>
      )}

      <KpiRow data={data} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mt-5">
        <TelegramCard s={data.telegram} />
        <TasksCard s={data.tasks} />
        <ServicesCard s={data.services} />
        <ReportingCard s={data.reporting} />
        <RevenueCard s={data.revenue} />
        <ProductsCard s={data.products} />
      </div>

      <DeptsStrip s={data.depts} />
    </div>
  );
}

// --- Фокус-цифры ------------------------------------------------------------------

function compactRub(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')} млн ₽`;
  if (v >= 1_000) return `${Math.round(v / 1_000)} тыс ₽`;
  return `${Math.round(v)} ₽`;
}

function Tile({ href, label, value, sub, tone = 'text-primary', subTone = 'text-muted' }: {
  href: string; label: string; value: ReactNode; sub?: ReactNode; tone?: string; subTone?: string;
}) {
  return (
    <a href={href}
      className="block rounded-lg border border-line bg-surface shadow-card px-4 py-3 min-w-0 hover:border-zapusk/40 transition-colors">
      <div className="text-xs text-muted leading-tight line-clamp-2">{label}</div>
      <div className={`font-display text-2xl font-semibold leading-tight mt-1 truncate ${tone}`}>{value}</div>
      {sub && <div className={`text-xs mt-0.5 truncate ${subTone}`}>{sub}</div>}
    </a>
  );
}

function KpiRow({ data }: { data: HomePayload }) {
  const { telegram: tg, tasks, reporting: rep, services: sv, revenue: rv } = data;
  const fines = rep.ok ? rep.fines : undefined;
  const none = <span className="text-muted">?</span>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      <Tile href="#tg" label="Ждут ответа в Telegram"
        value={tg.ok ? tg.total : none}
        tone={tg.ok && (tg.over_day ?? 0) > 0 ? 'text-danger' : 'text-primary'}
        sub={tg.ok ? ((tg.over_day ?? 0) > 0 ? `дольше суток ${tg.over_day}` : 'все свежие') : 'нет данных'}
        subTone={tg.ok && (tg.over_day ?? 0) > 0 ? 'text-danger' : 'text-muted'} />
      <Tile href="#tasks" label="Подвисшие задачи"
        value={tasks.ok ? tasks.stalled : none}
        tone={tasks.ok && (tasks.stalled ?? 0) > 0 ? 'text-danger' : 'text-primary'}
        sub={tasks.ok ? `из ${tasks.open} открытых` : 'нет данных'} />
      <Tile href="#reporting" label="Отчетность за 30 дней"
        value={rep.ok ? rep.next30 : none}
        sub={rep.ok ? ((rep.overdue ?? 0) > 0 ? `просрочено ${rep.overdue}` : 'просрочек нет') : 'нет данных'}
        subTone={rep.ok && (rep.overdue ?? 0) > 0 ? 'text-danger' : 'text-muted'} />
      <Tile href="#services" label="Сервисы на исходе"
        value={sv.ok ? sv.at_risk : none}
        tone={sv.ok && (sv.at_risk ?? 0) > 0 ? 'text-danger' : 'text-primary'}
        sub={sv.ok ? ((sv.charges ?? 0) > 0 ? `списаний за неделю ${sv.charges}` : 'списаний на неделе нет') : 'нет данных'} />
      <Tile href="#revenue" label="Сделки к выручке"
        value={rv.ok ? rv.deals : none}
        sub={rv.ok ? `с суммой ${rv.with_amount}` : 'нет данных'}
        subTone={rv.ok && (rv.with_amount ?? 0) * 2 < (rv.deals ?? 0) ? 'text-warning' : 'text-muted'} />
      <Tile href="#reporting" label="Штрафы ЦБ к оплате"
        value={fines?.total ? compactRub(fines.total) : rep.ok ? '0 ₽' : none}
        tone={(fines?.overdue_sum ?? 0) > 0 ? 'text-danger' : 'text-primary'}
        sub={(fines?.overdue_sum ?? 0) > 0
          ? `просрочено ${compactRub(fines?.overdue_sum ?? 0)}`
          : fines?.next_date ? `следующий платеж ${fines.next_date}` : rep.ok ? 'долгов нет' : 'нет данных'}
        subTone={(fines?.overdue_sum ?? 0) > 0 ? 'text-danger' : 'text-muted'} />
    </div>
  );
}

// --- Каркас карточки ------------------------------------------------------------

function HomeCard({ id, title, meta, to, toLabel, children, footer }: {
  id: string; title: string; meta?: ReactNode; to?: string; toLabel?: string;
  children: ReactNode; footer?: ReactNode;
}) {
  return (
    <Card padded={false} className="p-4 flex flex-col">
      <div id={id} className="scroll-mt-20 flex items-center justify-between gap-3 mb-3">
        <h2 className="text-[15px] font-semibold text-primary">
          {title}
          {meta != null && <span className="ml-2 text-xs font-normal text-muted">{meta}</span>}
        </h2>
        {to && (
          <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-secondary hover:text-primary whitespace-nowrap">
            {toLabel ?? 'Все'} <ArrowUpRight size={13} />
          </Link>
        )}
      </div>
      <div className="min-w-0">{children}</div>
      {footer && <div className="mt-auto pt-3"><div className="pt-2.5 border-t border-hairline text-xs text-muted leading-relaxed">{footer}</div></div>}
    </Card>
  );
}

function NoData({ error }: { error?: string }) {
  return (
    <p className="flex items-start gap-2 text-sm text-muted">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
      <span>Нет данных{error ? `: ${error}` : ''}</span>
    </p>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-secondary">{children}</p>;
}

function useMore<T>(items: T[] | undefined, top = 3) {
  const [open, setOpen] = useState(false);
  const all = items ?? [];
  const shown = open ? all : all.slice(0, top);
  const rest = all.length - top;
  const toggle = rest > 0 ? (
    <button type="button" onClick={() => setOpen((v) => !v)}
      className="mt-2 text-xs font-medium text-secondary hover:text-primary underline underline-offset-2">
      {open ? 'Свернуть' : `Еще ${rest}`}
    </button>
  ) : null;
  return { shown, toggle };
}

// --- Telegram ---------------------------------------------------------------------

function TelegramCard({ s }: { s: TelegramSection }) {
  const { shown, toggle } = useMore<TgItem>(s.items);
  return (
    <HomeCard id="tg" title="Ждут ответа в Telegram" meta={s.ok ? s.total : undefined}
      footer={s.ok && (
        <>
          Личные чаты за 7 дней, сверху сделки и те, кто ждет дольше.
          {(s.settled ?? 0) > 0 && <> Не считаю {s.settled}, где ответ не нужен («спасибо», «подумаю»).</>}
          {s.decisions_error && (
            <span className="text-warning"> Решения драфтера не прочитались: в счет вошли и чаты, где ответ не нужен.</span>
          )}
          {(s.unreadable ?? []).length > 0 && (
            <span className="text-warning"> Не прочитался снимок: {(s.unreadable ?? []).join(', ')}.</span>
          )}
          {' '}Снимок {clockLabel(s.as_of)}{s.stale ? ', старый: драфтер давно не обновлял' : ''}.
        </>
      )}>
      {!s.ok ? <NoData error={s.error} /> : shown.length === 0 ? (
        <Empty>Все отвечены.</Empty>
      ) : (
        <>
          <ul className="space-y-2.5">
            {shown.map((it, i) => (
              <li key={`${it.handle}-${i}`} className="flex items-start gap-2.5 min-w-0">
                <DueChip state={it.hours >= 24 ? 'over' : it.hours >= 4 ? 'today' : 'none'} label={it.waiting} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 min-w-0">
                    {it.handle ? (
                      <a href={`https://t.me/${it.handle}`} target="_blank" rel="noreferrer"
                        className="text-sm font-medium text-primary truncate hover:underline">{it.name}</a>
                    ) : (
                      <span className="text-sm font-medium text-primary truncate">{it.name}</span>
                    )}
                    {it.account && <span className="text-[11px] text-muted whitespace-nowrap">{it.account}</span>}
                  </div>
                  {it.text && <p className="text-xs text-muted leading-snug line-clamp-2">{it.text}</p>}
                  {it.deal && <p className="text-[11px] text-zapusk-400 truncate">сделка: {it.deal}</p>}
                </div>
              </li>
            ))}
          </ul>
          {toggle}
        </>
      )}
    </HomeCard>
  );
}

// --- Задачи -------------------------------------------------------------------------

function TasksCard({ s }: { s: TasksSection }) {
  return (
    <HomeCard id="tasks" title="Подвисшие задачи" meta={s.ok ? s.stalled : undefined} to="/crm" toLabel="Задачи"
      footer={s.ok && (
        <>
          Просрочены {s.stalled} из {s.open} открытых, дольше двух недель {s.over14}.
          {(s.elsewhere ?? 0) > 0 && <> Отчетность и оплаты ({s.elsewhere}) в своих блоках.</>}
          {(s.doubt ?? 0) > 0 && <> Похоже сделаны, но не закрыты: {s.doubt}.</>}
        </>
      )}>
      {!s.ok ? <NoData error={s.error} /> : (s.items ?? []).length === 0 ? (
        <Empty>Просроченных задач нет.</Empty>
      ) : (
        <ul className="space-y-2.5">
          {(s.items ?? []).map((t) => (
            <li key={t.id} className="flex items-start gap-2.5 min-w-0">
              <DueChip state={t.due_state} label={t.due_label} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-primary leading-snug line-clamp-2" title={t.title}>{t.title}</p>
                {t.dept && (
                  <Link to={`/crm/depts/${t.dept_code}`} className="text-[11px] text-muted hover:text-secondary">
                    #{t.id} · {t.dept}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}

// --- Сервисы --------------------------------------------------------------------

const LEVEL_BADGE: Record<string, { tone: 'danger' | 'warning' | 'info' | 'neutral'; label: string }> = {
  out: { tone: 'danger', label: 'кончились' },
  low: { tone: 'warning', label: 'на исходе' },
  charge: { tone: 'info', label: 'списание' },
  ok: { tone: 'neutral', label: 'в норме' },
};

function ServicesCard({ s }: { s: ServicesSection }) {
  const { shown, toggle } = useMore<ServiceItem>(s.items);
  const measured = s.measured ?? [];
  const errors = s.measure_errors ?? [];
  // Без замеров (всех или части) экран не вправе говорить «денег хватает»: он знает
  // только сигналы бота и реестр оплат.
  const blind = s.measured_ok === false || errors.length > 0;
  return (
    <HomeCard id="services" title="Сервисы: скоро кончатся" meta={s.ok ? s.at_risk : undefined}
      footer={s.ok && (measured.length > 0 || blind) && (
        <>
          {s.measured_ok === false && (
            <span className="block text-warning">Замеров балансов нет: список держится на сигналах бота и реестре оплат.</span>
          )}
          {measured.map((m, i) => (
            <span key={m.name}>
              {i > 0 && <span className="mx-1.5">·</span>}
              <span className={m.level === 'out' ? 'text-danger' : m.level === 'low' ? 'text-warning' : ''}>
                {m.name} <span className="font-num">{m.value}</span>
              </span>
            </span>
          ))}
          {measured.length > 0 && s.as_of && <span className="ml-1.5">(замер {clockLabel(s.as_of)})</span>}
          {errors.length > 0 && (
            <span className="block mt-1 text-warning">Не замерены: {errors.join(', ')}.</span>
          )}
        </>
      )}>
      {!s.ok ? <NoData error={s.error} /> : shown.length === 0 ? (
        <Empty>{blind ? 'Сигналов о деньгах и близких списаний нет, но замеры балансов неполные.' : 'Все оплачено, денег хватает.'}</Empty>
      ) : (
        <>
          <ul className="space-y-2.5">
            {shown.map((it) => {
              const b = LEVEL_BADGE[it.level] ?? LEVEL_BADGE.ok;
              return (
                <li key={it.name} className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusBadge tone={b.tone}>{b.label}</StatusBadge>
                    <span className="text-sm font-medium text-primary truncate">{it.name}</span>
                    {it.value && <span className="ml-auto text-sm text-secondary font-num whitespace-nowrap">{it.value}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1 min-w-0">
                    {it.due_label && <DueChip state={it.due_state} label={it.due_label} />}
                    <p className="text-xs text-muted leading-snug min-w-0 line-clamp-2">{it.reason}</p>
                    {it.cabinet && (
                      <a href={it.cabinet} target="_blank" rel="noreferrer"
                        className="ml-auto shrink-0 inline-flex items-center gap-0.5 text-[11px] font-medium text-secondary hover:text-primary">
                        кабинет <ArrowUpRight size={11} />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {toggle}
        </>
      )}
    </HomeCard>
  );
}

// --- Отчетность -----------------------------------------------------------------

const DUE_TEXT: Record<string, string> = {
  over: 'text-danger', today: 'text-warning', soon: 'text-warning', ok: 'text-muted', none: 'text-muted',
};

function ReportRow({ r }: { r: ReportItem }) {
  return (
    <li className="flex items-start gap-3 min-w-0">
      <div className="w-16 shrink-0">
        <div className="font-display text-base font-semibold text-primary leading-none">{r.date}</div>
        <div className={`text-[11px] font-medium mt-1 ${DUE_TEXT[r.due_state] ?? 'text-muted'}`}>{r.due_label}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium text-primary">{r.entity}</span>
          <span className="text-xs text-secondary">{r.body}</span>
        </div>
        <p className="text-xs text-muted leading-snug line-clamp-2 mt-0.5" title={r.what}>{r.what}</p>
        {(r.critical || r.reminder) && (
          <div className="flex gap-1.5 mt-1">
            {r.critical && <StatusBadge tone="warning">критично</StatusBadge>}
            {r.reminder && <StatusBadge tone="neutral">напоминание</StatusBadge>}
          </div>
        )}
      </div>
    </li>
  );
}

function ReportingCard({ s }: { s: ReportingSection }) {
  const [showOver, setShowOver] = useState(false);
  const f = s.fines ?? {};
  return (
    <HomeCard id="reporting" title="Отчетность: ближайшие сроки" to="/crm/depts/reporting" toLabel="Отдел"
      footer={s.ok && (f.total ?? 0) > 0 && (
        <>
          Штрафы ЦБ к оплате: <span className="font-num text-secondary">{rub(f.total)}</span>
          {(f.overdue_sum ?? 0) > 0 && <>, из них просрочено <span className="font-num text-danger">{rub(f.overdue_sum)}</span></>}.
          {f.next_date && <> Следующий платеж {f.next_date}: <span className="font-num">{rub(f.next_sum)}</span>.</>}
        </>
      )}>
      {!s.ok ? <NoData error={s.error} /> : (
        <>
          {(s.overdue ?? 0) > 0 && (
            <div className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
              <button type="button" onClick={() => setShowOver((v) => !v)} className="font-medium underline underline-offset-2">
                Просрочено {s.overdue}: {showOver ? 'свернуть' : 'показать'}
              </button>
              <span className="text-danger/80"> (или сдано, но не отмечено в календаре)</span>
              {showOver && (
                <ul className="mt-2 space-y-1">
                  {(s.overdue_items ?? []).map((r) => (
                    <li key={`${r.date}-${r.entity}-${r.body}`}>
                      {r.date} · {r.entity} {r.body} · {r.what}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {(s.items ?? []).length === 0 ? (
            <Empty>Ближайших сроков нет.</Empty>
          ) : (
            <ul className="space-y-3">
              {(s.items ?? []).map((r) => <ReportRow key={`${r.date}-${r.entity}-${r.body}`} r={r} />)}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">Всего сроков на 30 дней вперед: {s.next30}.</p>
        </>
      )}
    </HomeCard>
  );
}

// --- Выручка --------------------------------------------------------------------

function DealRow({ d }: { d: DealItem }) {
  return (
    <li className="min-w-0">
      <div className="flex items-start gap-2 min-w-0">
        <Link to={`/crm/p/${d.pipeline_code}`} className="text-sm font-medium text-primary leading-snug line-clamp-2 hover:underline min-w-0">
          {d.name}
        </Link>
        <span className={`ml-auto text-sm font-num whitespace-nowrap ${d.amount_label ? 'text-primary font-semibold' : 'text-muted'}`}>
          {d.amount_label || 'суммы нет'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
        <StatusBadge tone="zapusk">{d.prob}%</StatusBadge>
        <span className="text-xs text-muted">{d.pipeline} · {d.stage}</span>
      </div>
      {d.step && (
        <div className="flex items-start gap-2 mt-1.5 min-w-0">
          <DueChip state={d.due_state} label={d.due_label} className="mt-0.5" />
          <p className="text-xs text-secondary leading-snug min-w-0 line-clamp-2" title={d.step}>
            {d.owner_turn ? (/^ход/i.test(d.step) ? '' : 'Ход твой: ') : (/^жд/i.test(d.step) ? '' : 'Ждем: ')}{d.step}
          </p>
        </div>
      )}
    </li>
  );
}

function RevenueCard({ s }: { s: RevenueSection }) {
  return (
    <HomeCard id="revenue" title="Сделки к выручке: топ-3" to="/crm" toLabel="CRM"
      footer={s.ok && (
        <>
          Порядок: сумма, умноженная на вероятность этапа воронки. Сумма указана у {s.with_amount} из {s.deals} сделок
          {(s.weighted ?? 0) > 0 && <>, взвешенно <span className="font-num text-secondary">{rub(s.weighted)}</span></>}.
          {(s.with_amount ?? 0) * 2 < (s.deals ?? 0) && <span className="text-warning"> Без сумм топ неполный.</span>}
        </>
      )}>
      {!s.ok ? <NoData error={s.error} /> : (s.items ?? []).length === 0 ? (
        <Empty>Активных сделок нет.</Empty>
      ) : (
        <ul className="space-y-3.5">
          {(s.items ?? []).map((d) => <DealRow key={d.id} d={d} />)}
        </ul>
      )}
    </HomeCard>
  );
}

// --- Продукты и отделы ------------------------------------------------------------

function ProductsCard({ s }: { s: HomePayload['products'] }) {
  return (
    <HomeCard id="products" title="Продукты" to="/crm" toLabel="CRM">
      {!s.ok ? <NoData error={s.error} /> : (
        <ul className="divide-y divide-hairline">
          {(s.items ?? []).map((p: ProductItem) => (
            <li key={p.code} className="py-2 first:pt-0 last:pb-0">
              <Link to={`/crm/p/${p.code}`} className="flex items-center gap-3 group min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-primary group-hover:text-zapusk-400 transition-colors truncate">{p.name}</div>
                  <div className="text-xs text-muted truncate">
                    {p.far.length > 0 ? `дальше всех: ${p.far.join(', ')}` : 'пока только в начале'}
                  </div>
                  {p.steps_over > 0 && <div className="text-[11px] text-warning">шагов просрочено {p.steps_over}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-lg font-semibold text-primary leading-none">{p.active}</div>
                  <div className="text-[11px] text-muted">в работе</div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}

function DeptsStrip({ s }: { s: HomePayload['depts'] }) {
  if (!s.ok) {
    return <Card padded={false} className="p-4 mt-4"><NoData error={s.error} /></Card>;
  }
  const items = s.items ?? [];
  if (items.length === 0) {
    return (
      <Card padded={false} className="p-0 mt-4">
        <EmptyState icon={<Inbox className="w-6 h-6" />} title="Открытых задач по отделам нет" />
      </Card>
    );
  }
  return (
    <Card padded={false} className="p-4 mt-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-[15px] font-semibold text-primary">Отделы: открыто и просрочено</h2>
        <Link to="/crm/depts" className="inline-flex items-center gap-1 text-xs font-medium text-secondary hover:text-primary">
          Все отделы <ArrowUpRight size={13} />
        </Link>
      </div>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {items.map((d: DeptItem) => (
          <Link key={d.code} to={`/crm/depts/${d.code}`}
            className="rounded-md border border-hairline bg-canvas/60 px-3 py-2 min-w-0 hover:border-line transition-colors">
            <div className="text-xs text-secondary truncate" title={d.name}>{d.name}</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-display text-lg font-semibold text-primary leading-none">{d.open}</span>
              {d.over > 0
                ? <span className="text-[11px] text-danger">просрочено {d.over}</span>
                : <span className="text-[11px] text-muted">без просрочек</span>}
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загрузка главной">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-lg border border-line bg-surface px-4 py-3">
            <div className="animate-pulse space-y-2">
              <div className="h-3 w-2/3 bg-hairline rounded" />
              <div className="h-6 w-1/3 bg-hairline rounded" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mt-5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Card key={i} padded={false} className="p-4">
            <div className="animate-pulse space-y-2.5">
              <div className="h-4 w-1/2 bg-hairline rounded" />
              <div className="h-3 w-3/4 bg-hairline rounded" />
              <div className="h-3 w-2/3 bg-hairline rounded" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
