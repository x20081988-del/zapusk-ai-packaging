import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCrmwebFocus, type CrmwebFocus } from '../../lib/crmweb';

// «Фокус дня» в шапке экрана Решений.
//
// Владелец попадает на /decide каждый день, а CRM жила за двумя кликами - и стена
// из всех просрочек канбана отучала туда ходить вовсе. Эта полоса отвечает на
// вопрос «что двигать сегодня» пятью сделками и пятью задачами: выборку считает
// источник (crm_web.focus_view), здесь только рендер - как везде в разделе CRM.
//
// Полоса не смеет ронять разбор очереди: не загрузилась - не появилась. Снимок
// (мак спит) показывается честно, но глушить тут нечего - мутаций в полосе нет.

const DUE_CLASS: Record<string, string> = {
  over: 'text-danger font-medium',
  today: 'text-warning font-medium',
};

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

  // Все разобрано - это состояние тоже стоит показать: пустота без объяснения
  // читается как «полоса сломалась», а не как «молодец, день чист».
  if (deals.length === 0 && tasks.length === 0) {
    return (
      <div className="mb-5 rounded-md border border-line px-3 py-2.5 text-sm text-secondary">
        Фокус дня чист: сделки и задачи без шага на сегодня.{' '}
        <Link to="/crm" className="underline hover:text-primary">Вся CRM</Link>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-md border border-line px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-primary">
          Фокус дня{focus.stale ? ' (снимок)' : ''}
        </span>
        <Link to="/crm" className="text-xs text-secondary underline hover:text-primary">
          Вся CRM
        </Link>
      </div>
      {deals.length > 0 && (
        <ul className="space-y-1 mb-1.5">
          {deals.map((d) => (
            <li key={d.id} className="text-sm text-secondary truncate" title={d.step_display}>
              <span className={`mr-2 text-xs ${DUE_CLASS[d.due_state] ?? 'text-muted'}`}>
                {d.due_label}
              </span>
              <Link to="/crm/board" className="text-primary hover:underline">{d.name}</Link>
              <span className="mx-1.5 text-muted">-</span>
              {d.step_display}
            </li>
          ))}
        </ul>
      )}
      {tasks.length > 0 && (
        <ul className="space-y-1 mb-1.5">
          {tasks.map((t) => (
            <li key={t.id} className="text-sm text-secondary truncate" title={t.text}>
              <span className={`mr-2 text-xs ${DUE_CLASS[t.heat] ?? 'text-muted'}`}>
                {t.heat_label || 'задача'}
              </span>
              <Link to="/crm" className="text-primary hover:underline">{t.title}</Link>
            </li>
          ))}
        </ul>
      )}
      {(restDeals > 0 || (focus.no_step_n ?? 0) > 0) && (
        <p className="text-xs text-muted">
          {restDeals > 0 && <>еще {restDeals} сделок ждут хода</>}
          {restDeals > 0 && (focus.no_step_n ?? 0) > 0 && <span className="mx-1">·</span>}
          {(focus.no_step_n ?? 0) > 0 && (
            <Link to="/crm/board" className="underline hover:text-secondary">
              без следующего шага: {focus.no_step_n}
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
