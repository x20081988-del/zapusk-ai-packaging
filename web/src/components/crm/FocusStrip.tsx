import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { fetchCrmwebFocus, type CrmwebFocus } from '../../lib/crmweb';
import { DueChip } from './DueChip';

// «Фокус дня» в шапке экрана Решений.
//
// Владелец попадает на /decide каждый день, а CRM жила за двумя кликами - и стена
// из всех просрочек канбана отучала туда ходить вовсе. Эта полоса отвечает на
// вопрос «что двигать сегодня» пятью сделками и пятью задачами: выборку считает
// источник (crm_web.focus_view), здесь только рендер - как везде в разделе CRM.
//
// Полоса не смеет ронять разбор очереди: не загрузилась - не появилась. Снимок
// (мак спит) показывается честно, но глушить тут нечего - мутаций в полосе нет.
//
// Design pass 06.10.2026: срок стал компактным чипом, имя сделки - главной строкой,
// шаг - второй серой. Раньше красная подпись съедала половину строки на телефоне,
// и имя сделки обрезалось на третьем слове.

export function FocusStrip() {
  const [focus, setFocus] = useState<CrmwebFocus | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    fetchCrmwebFocus(ctrl.signal)
      .then((f) => !ctrl.signal.aborted && setFocus(f))
      .catch(() => {
        // Фокус - дополнение к очереди, не она сама. Мост лег - полосы просто нет.
      });
    return () => ctrl.abort();
  }, []);

  if (!focus) return null;

  const deals = focus.deals ?? [];
  const tasks = (focus.tasks ?? []).filter((t) => t.heat === 'over' || t.heat === 'today');
  const restDeals = Math.max(0, (focus.deals_total ?? 0) - deals.length);
  const noStep = focus.no_step_n ?? 0;

  // Все разобрано - это состояние тоже стоит показать: пустота без объяснения
  // читается как «полоса сломалась», а не как «молодец, день чист».
  if (deals.length === 0 && tasks.length === 0) {
    return (
      <div className="mb-5 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-secondary flex items-center justify-between gap-3">
        <span>Фокус дня чист: сделки и задачи без шага на сегодня.</span>
        <Link to="/crm" className="text-xs font-medium text-secondary hover:text-primary whitespace-nowrap">Вся CRM</Link>
      </div>
    );
  }

  return (
    <section className="mb-5 rounded-lg border border-line bg-surface shadow-card p-4" aria-label="Фокус дня">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-primary">
          Фокус дня
          {focus.stale && <span className="ml-2 text-xs font-normal text-muted">снимок</span>}
        </h2>
        <Link to="/crm" className="inline-flex items-center gap-1 text-xs font-medium text-secondary hover:text-primary">
          Вся CRM <ArrowUpRight size={13} />
        </Link>
      </div>

      <div className={deals.length > 0 && tasks.length > 0 ? 'grid gap-4 sm:grid-cols-2' : ''}>
        {deals.length > 0 && (
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted mb-1.5">Сделки, где ход твой</p>
            <ul className="space-y-1.5">
              {deals.map((d) => (
                <li key={d.id} className="flex items-start gap-2.5 min-w-0">
                  <DueChip state={d.due_state} label={d.due_label} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <Link to="/crm/board" className="block text-sm font-medium text-primary truncate hover:underline">
                      {d.name}
                    </Link>
                    {d.step_display && (
                      <p className="text-xs text-muted truncate" title={d.step_display}>{d.step_display}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tasks.length > 0 && (
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted mb-1.5">Горящие задачи</p>
            <ul className="space-y-1.5">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-2.5 min-w-0">
                  <DueChip state={t.heat} label={t.heat_label || 'задача'} className="mt-0.5" />
                  <Link to="/crm" className="min-w-0 flex-1 text-sm font-medium text-primary truncate hover:underline" title={t.text}>
                    {t.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {(restDeals > 0 || noStep > 0) && (
        <p className="mt-3 pt-2.5 border-t border-hairline text-xs text-muted">
          {restDeals > 0 && <>еще <span className="font-num">{restDeals}</span> сделок ждут хода</>}
          {restDeals > 0 && noStep > 0 && <span className="mx-1.5">·</span>}
          {noStep > 0 && (
            <Link to="/crm/board" className="underline underline-offset-2 hover:text-secondary">
              без следующего шага: <span className="font-num">{noStep}</span>
            </Link>
          )}
        </p>
      )}
    </section>
  );
}
