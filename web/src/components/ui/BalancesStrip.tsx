import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ageLabel, fetchReport, type BalancesFacts, type ReportEnvelope } from '../../lib/decide';

// Sprint 63.P3 - балансы в шапке экрана Решений.
//
// Своей страницы они не заслуживают: владелец попадает на Решения каждый день, и
// цифра «сколько осталось» должна быть там, где он уже смотрит, а не за кликом.
//
// Полоска молчит, пока все в порядке: три числа мелким серым. Если сервис ушел ниже
// порога - он и только он краснеет. Красить весь блок из-за одного SMS-баланса
// значит приучить не смотреть на него вовсе.
//
// Отчет строится десятки секунд (ходит в Selectel, SMSC, Deepgram, кабинет OpenAI) и
// живет в кэше моста. Поэтому рядом всегда стоит возраст измерения: это снимок с
// меткой времени, а не поток, и делать вид, что цифра сиюминутная, нечестно.

function money(v: number | null | undefined, unit: string | null | undefined): string {
  if (v == null) return '?';
  const n = v >= 1000 ? Math.round(v).toLocaleString('ru-RU') : v.toFixed(2);
  if (unit === 'USD') return `$${v.toFixed(2)}`;
  return `${n} ${unit ?? ''}`.trim();
}

export function BalancesStrip() {
  const [data, setData] = useState<ReportEnvelope<BalancesFacts> | null>(null);
  const [warming, setWarming] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    fetchReport<BalancesFacts>('balances', ctrl.signal)
      .then((r) => !ctrl.signal.aborted && setData(r))
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        // Отдельно ловим «считается»: это не поломка, а первый холодный запрос.
        setWarming(String(e?.message ?? '').includes('source_warming'));
      });
    return () => ctrl.abort();
  }, []);

  // Балансы - не главное на экране решений. Не загрузились, мост лег, мак спит -
  // полоска просто не появляется. Ронять ради нее разбор очереди незачем.
  if (warming) {
    return <p className="text-xs text-muted mb-4">Балансы считаются, появятся через полминуты</p>;
  }
  const f = data?.facts;
  if (!f) return null;

  const low = f.services.filter((s) => s.low);
  const ai = f.ai;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      {f.services.map((s) => (
        <span
          key={s.name}
          className={s.low ? 'text-danger font-medium' : !s.ok ? 'text-muted' : 'text-secondary'}
          title={s.raw}
        >
          {s.low && <AlertTriangle className="inline w-3 h-3 mr-1 -mt-0.5" />}
          {s.name} {s.ok ? money(s.value, s.unit) : 'не проверен'}
        </span>
      ))}

      {ai.ok && (
        <span className="text-secondary">
          ИИ ${ai.day_usd?.toFixed(2)} за сутки, к месяцу ~${ai.month_forecast_usd?.toFixed(0)}
        </span>
      )}

      <span className="text-muted">{ageLabel(data?.age_sec)}</span>

      {low.length > 0 && (
        <span className="text-danger">
          пополнить: {low.map((s) => s.name).join(', ')}
        </span>
      )}
    </div>
  );
}
