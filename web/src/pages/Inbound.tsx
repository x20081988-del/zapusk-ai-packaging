import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ageLabel, fetchReport, type ReportEnvelope } from '../lib/decide';
import { renderInlineMarkup } from '../lib/markup';

// Sprint 63.P9 - экран «Входящие».
//
// Три канала входящих: заявки с формы «Привлечь капитал», обращения через Jivo и
// переписка с поддержкой Авито.
//
// ПУШИ У ВСЕХ ТРЕХ ОСТАЮТСЯ. Это события с ценой промедления: заявка в 14:20 не
// может ждать, пока владелец откроет браузер. Экран их не заменяет, а дополняет:
// пуш говорит «пришло», экран отвечает «что с каждым сейчас» - статусы, черновики
// ответов, история. Пуш дедуплицирован и про старое молчит, экран показывает
// состояние целиком.

interface Panel {
  name: string;
  title: string;
  hint: string;
}

const PANELS: Panel[] = [
  { name: 'site-leads', title: 'Заявки с сайта', hint: 'форма «Привлечь капитал» на zapusk.tech' },
  { name: 'jivo', title: 'Обращения Jivo', hint: 'виджет на сайте, черновики ответов' },
  { name: 'avito', title: 'Авито', hint: 'ответы поддержки и уведомления профиля' },
];

type Slot =
  | { phase: 'loading' }
  | { phase: 'ready'; report: ReportEnvelope<unknown> }
  | { phase: 'warming' }
  | { phase: 'failed'; text: string };

export function Inbound() {
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
      title="Заявки и чаты"
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
          Три канала входящих. Пуши в бота остаются - тут видно, что с каждым
          обращением сейчас: статусы и готовые черновики ответов.
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

      {slot?.phase === 'ready' && <ReportBody text={slot.report.text} />}
    </Card>
  );
}

/**
 * Тело отчета: вердикт сверху, простыня под «подробнее».
 *
 * Источник отдает первой строкой «ИТОГ: ...» - ответ на единственный вопрос владельца
 * «все ли живо». Полный разбор с командами и путями к логам написан для агента, а не
 * для человека, поэтому по умолчанию свернут. Жирное в звездочках разбираем - раньше
 * владелец видел `**Зоя**` буквально.
 */
function ReportBody({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const lines = (text ?? '').split('\n');
  const hasVerdict = lines[0]?.startsWith('ИТОГ:');
  const verdict = hasVerdict ? lines[0].replace(/^ИТОГ:\s*/, '') : null;
  const rest = hasVerdict ? lines.slice(1).join('\n').trim() : text;
  const ok = hasVerdict && /все (живо|ок|в порядке|чисто)|замечаний нет|решать нечего/.test(verdict ?? '');

  if (!hasVerdict) {
    return (
      <p className="text-sm text-secondary whitespace-pre-wrap break-words leading-relaxed max-h-96 overflow-y-auto">
        {renderInlineMarkup(text)}
      </p>
    );
  }
  return (
    <div>
      <p className={`text-sm font-medium ${ok ? 'text-success' : 'text-warning'}`}>{verdict}</p>
      {rest && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-1.5 text-xs text-muted underline underline-offset-2 hover:text-primary"
          >
            {open ? 'скрыть разбор' : 'подробнее'}
          </button>
          {open && (
            <p className="mt-2 text-xs text-secondary whitespace-pre-wrap break-words leading-relaxed max-h-96 overflow-y-auto">
              {renderInlineMarkup(rest)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
