import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ageLabel, fetchReport, type ReportEnvelope } from '../lib/decide';
import { renderInlineMarkup } from '../lib/markup';

// Sprint 63.P7 - экран «Почта».
//
// Утренний бриф по четырем ящикам приходил в бота в 10:00. Он честный дайджест, а
// значит его место здесь: пуш дедуплицирован и молчит про письма, о которых уже
// говорил, а экран показывает СОСТОЯНИЕ - что вообще висит важного, независимо от
// того, упоминалось оно вчера или нет.
//
// Джоба mailbrief при этом НЕ выключена и выключать ее нельзя: она не только шлет,
// но и ЗАГРУЖАЕТ письма в индекс. Заглушена только доставка, через тот же
// digest_gate, что и остальные десять источников.
//
// Источник не ходит в IMAP и не зовет AI на показ страницы: и то и другое стоит
// денег и секунд, а экран открывают когда захочется. Отсюда возраст рядом с
// заголовком - это снимок индекса, а не живая почта.

export function MailBrief() {
  const [data, setData] = useState<ReportEnvelope<unknown> | null>(null);
  const [state, setState] = useState<'loading' | 'warming' | 'failed' | 'ready'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    if (isRefresh) setRefreshing(true);
    else setState('loading');
    try {
      const r = await fetchReport<unknown>('mail', ctrl.signal);
      if (ctrl.signal.aborted) return;
      setData(r);
      setState('ready');
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const msg = String((e as Error)?.message ?? e);
      if (msg.includes('source_warming')) {
        setState('warming');
      } else {
        setError(
          msg.includes('source_unreachable')
            ? 'Мак не отвечает: спит, офлайн или закрыт туннель'
            : msg.includes('source_not_configured')
              ? 'Мост к источнику не настроен'
              : 'Источник ответил неожиданно, подробности в журнале сервера',
        );
        setState('failed');
      }
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
      title="Почта"
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
        <p className="text-sm text-secondary mb-4">
          Важное из четырех ящиков: Яндекс и три Gmail. Только чтение, письма никуда
          не уходят.{' '}
          {state === 'ready' && (
            <span className="text-muted">Снимок индекса {ageLabel(data?.age_sec ?? undefined)}.</span>
          )}
        </p>

        {state === 'loading' && (
          <Card className="p-4">
            <div className="animate-pulse space-y-2" aria-busy="true">
              <div className="h-3 w-1/2 bg-surface rounded" />
              <div className="h-3 w-3/4 bg-surface rounded" />
              <div className="h-3 w-2/3 bg-surface rounded" />
            </div>
          </Card>
        )}

        {state === 'warming' && (
          <Card className="p-4">
            <p className="text-sm text-muted">Бриф считается, обнови через полминуты</p>
          </Card>
        )}

        {state === 'failed' && (
          <Card className="p-4">
            <p className="inline-flex items-start gap-1.5 text-sm text-danger">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </p>
            <div className="mt-3">
              <Button variant="secondary" size="sm" onClick={() => void load(true)} loading={refreshing}>
                Повторить
              </Button>
            </div>
          </Card>
        )}

        {state === 'ready' && (
          <Card className="p-4">
            {/* Источник отдает текст со звездочками вместо тегов: содержимое писем
                приходит от чужих людей, и исполнять оттуда разметку нельзя. Жирное
                разбираем тем же рендером, что и тела карточек решений. */}
            <p className="text-sm text-secondary whitespace-pre-wrap break-words leading-relaxed">
              {renderInlineMarkup(data?.text ?? '')}
            </p>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
