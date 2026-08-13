import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ageLabel, fetchReport, type ReportEnvelope } from '../lib/decide';

// Sprint 63.P4 - экран «Здоровье системы».
//
// Четыре аудита, которые раньше приходили в бота четырьмя отдельными пушами:
// сторож автозадач в 8:40, аудит автозадач по понедельникам, ревизия скиллов и
// ревизия памяти первого числа. По отдельности каждый был уместен, вместе - четыре
// утренних уведомления про одно и то же: жива ли система.
//
// Ключевая разница между пушем и экраном. Пуш дедуплицирован: он молчит про то, что
// уже говорил, иначе владелец каждый день читал бы одно и то же. Экран наоборот
// показывает СОСТОЯНИЕ целиком - он открывается тогда, когда владелец сам решил
// посмотреть, и «тут пусто, потому что вчера уже сказали» было бы враньем.
// Поэтому источник отдает сюда полные рендеры (web_report), а не краткие.

interface Panel {
  name: string;
  title: string;
  hint: string;
}

const PANELS: Panel[] = [
  { name: 'jobs-watchdog', title: 'Сторож автозадач', hint: 'кто упал и кто замолчал' },
  { name: 'jobs-audit', title: 'Аудит автозадач', hint: 'гигиена и стоимость' },
  { name: 'skills-audit', title: 'Ревизия скиллов', hint: 'пересечения, сироты, битые ссылки' },
  { name: 'memory-audit', title: 'Ревизия памяти', hint: 'дубли, протухшее, вес индекса' },
];

type Slot =
  | { phase: 'loading' }
  | { phase: 'ready'; report: ReportEnvelope<unknown> }
  | { phase: 'warming' }
  | { phase: 'failed'; text: string };

export function SystemHealth() {
  const [slots, setSlots] = useState<Record<string, Slot>>(() =>
    Object.fromEntries(PANELS.map((p) => [p.name, { phase: 'loading' } as Slot])),
  );
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    if (isRefresh) setRefreshing(true);

    // Панели грузятся независимо: один упавший аудит не должен прятать три живых.
    await Promise.all(
      PANELS.map(async (p) => {
        if (!isRefresh) setSlots((s) => ({ ...s, [p.name]: { phase: 'loading' } }));
        try {
          const report = await fetchReport<unknown>(p.name, ctrl.signal);
          if (ctrl.signal.aborted) return;
          setSlots((s) => ({ ...s, [p.name]: { phase: 'ready', report } }));
        } catch (e) {
          if (ctrl.signal.aborted) return;
          const msg = String((e as Error)?.message ?? e);
          setSlots((s) => ({
            ...s,
            [p.name]: msg.includes('source_warming')
              ? { phase: 'warming' }
              : { phase: 'failed', text: failureText(msg) },
          }));
        }
      }),
    );
    if (inFlight.current === ctrl) inFlight.current = null;
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
    return () => inFlight.current?.abort();
  }, [load]);

  return (
    <AppLayout
      title="Здоровье системы"
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
      <div className="max-w-3xl space-y-4">
        <p className="text-sm text-secondary">
          Четыре разбора, которые раньше приходили отдельными сообщениями в бота.
          Показывают состояние на момент замера, а не поток событий.
        </p>

        {PANELS.map((p) => (
          <PanelCard key={p.name} panel={p} slot={slots[p.name]} />
        ))}
      </div>
    </AppLayout>
  );
}

function failureText(raw: string): string {
  if (raw.includes('source_unreachable')) return 'мак не отвечает: спит, офлайн или закрыт туннель';
  if (raw.includes('source_not_configured')) return 'мост к источнику не настроен';
  if (raw.includes('source_auth')) return 'секрет моста разъехался';
  return 'источник ответил неожиданно, подробности в журнале сервера';
}

function PanelCard({ panel, slot }: { panel: Panel; slot?: Slot }) {
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <div>
          <h2 className="text-sm font-semibold text-primary">{panel.title}</h2>
          <p className="text-xs text-muted">{panel.hint}</p>
        </div>
        {slot?.phase === 'ready' && (
          <span className="text-xs text-muted">{ageLabel(slot.report.age_sec ?? undefined)}</span>
        )}
      </div>

      {(!slot || slot.phase === 'loading') && (
        <div className="animate-pulse space-y-2" aria-busy="true">
          <div className="h-3 w-2/3 bg-surface rounded" />
          <div className="h-3 w-1/2 bg-surface rounded" />
        </div>
      )}

      {slot?.phase === 'warming' && (
        <p className="text-sm text-muted">Считается, обнови через полминуты</p>
      )}

      {slot?.phase === 'failed' && (
        <p className="inline-flex items-start gap-1.5 text-sm text-danger">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {slot.text}
        </p>
      )}

      {slot?.phase === 'ready' && (
        // Разбор приходит готовым текстом: это слова, а не набор чисел, и раскладывать
        // их на поля значило бы переписать четыре генератора ради верстки. Показываем
        // как есть, моноширинным, с переносом - ровно то, что владелец читал в боте.
        <pre className="text-xs text-secondary whitespace-pre-wrap break-words font-mono leading-relaxed max-h-96 overflow-y-auto">
          {slot.report.text}
        </pre>
      )}
    </Card>
  );
}
