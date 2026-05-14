import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ChevronRight, Clock, Cpu, ExternalLink, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { Card, CardHeader } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { EmptyState } from './EmptyState';
import { api, type PackagingJob } from '../../lib/api';
import {
  providerLabel, toolLabel, outputTypeLabel,
  providerTone, outputTypeTone,
  toolClientLabel, canSeeAIVendors,
} from '../../lib/aiProviders';
import { getAuth } from '../../lib/auth';

// Sprint 15: «AI generated materials» — лента того, как AI orchestrator
// собрал материалы по проекту.
// Sprint 16: role-gate — client не видит vendor names.
// Sprint 18 — Managed Packaging Flow: status='awaiting_manager' рендерится
// как «Материал готовится командой ZAPUSK AI» для client, и как «На ручной
// обработке» для manager/admin. Кнопка «Перезапустить» скрыта для client'а,
// если job в active-state (queued/running/awaiting_manager).
interface Props {
  projectId: string | undefined;
  onRegenerate?: (templateKey: string) => void;
}

const STATUS_TONE: Record<PackagingJob['status'], 'success' | 'warning' | 'danger' | 'ai' | 'neutral'> = {
  succeeded: 'success',
  running: 'ai',
  queued: 'neutral',
  mock: 'warning',
  failed: 'danger',
  awaiting_manager: 'ai',
};

// Sprint 18: разные labels для client и manager.
const STATUS_LABEL_CLIENT: Record<PackagingJob['status'], string> = {
  succeeded: 'Готово',
  running: 'Готовится',
  queued: 'Готовится',
  // Sprint 18: «mock» для клиента — это «AI не настроен» состояние. Подаём
  // его как «На проверке менеджера», чтобы UX оставался понятным.
  mock: 'На проверке менеджера',
  failed: 'Требуется внимание менеджера',
  awaiting_manager: 'Готовится',
};
const STATUS_LABEL_INTERNAL: Record<PackagingJob['status'], string> = {
  succeeded: 'Готово',
  running: 'Идёт сборка',
  queued: 'В очереди',
  mock: 'Mock fallback',
  failed: 'Ошибка',
  awaiting_manager: 'На ручной обработке',
};

export function AIPackagingHistory({ projectId, onRegenerate }: Props) {
  const [jobs, setJobs] = useState<PackagingJob[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const role = getAuth()?.role ?? 'client';
  const showVendors = canSeeAIVendors(role);

  async function load() {
    if (!projectId) return;
    setRefreshing(true);
    try {
      const r = await api.get<{ jobs: PackagingJob[] }>(`/api/packaging-jobs/project/${projectId}`);
      setJobs(r.jobs);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    setJobs(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Sprint 18: client UI — мягкий заголовок без «pipeline». Admin/manager
  // продолжают видеть технический термин.
  const title = showVendors ? 'AI generated materials' : 'Материалы проекта от ZAPUSK AI';
  const subtitle = showVendors
    ? 'История запусков Packaging Pipeline: какой AI собрал какой артефакт'
    : 'История подготовки материалов: что уже готово, что готовится сейчас';

  // Sprint 18: для client рисуем сверху небольшую плашку «Лендинг готовится
  // дольше», если в списке есть awaiting_manager landing/one_pager/pitch.
  const hasLongRunning = jobs?.some((j) =>
    j.status === 'awaiting_manager'
    && (j.outputType === 'landing' || j.outputType === 'one_pager' || j.outputType === 'pitch_deck'),
  );

  return (
    <Card padded>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />}
            onClick={load}
            loading={refreshing}
          >
            Обновить
          </Button>
        }
      />

      {!showVendors && hasLongRunning && (
        <div className="mb-3 rounded-md border border-zapusk/25 bg-zapusk/8 p-3 flex items-start gap-2">
          <Loader2 size={14} className="text-zapusk-400 mt-0.5 shrink-0 animate-spin" />
          <div className="text-xs text-primary leading-snug">
            <span className="font-semibold">Лендинг готовится чуть дольше:</span>{' '}
            обычно от нескольких часов до 1 рабочего дня. Команда ZAPUSK AI вручную проверит
            визуальную сборку и добавит ссылку в кабинет.
          </div>
        </div>
      )}

      {jobs === null ? (
        <p className="text-sm text-muted text-center py-6">Загружаем историю…</p>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<Cpu size={20} />}
          title="История пуста"
          description={showVendors
            ? 'Когда вы запустите генерацию материала — здесь появится запись с провайдером, инструментом и временем.'
            : 'Когда команда соберёт первый материал по проекту — он появится здесь.'}
        />
      ) : (
        <ul className="space-y-2">
          {jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              showVendors={showVendors}
              onRegenerate={onRegenerate}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function JobRow({
  job, showVendors, onRegenerate,
}: { job: PackagingJob; showVendors: boolean; onRegenerate?: (templateKey: string) => void }) {
  const isAwaiting = job.status === 'awaiting_manager' || job.status === 'queued' || job.status === 'running';
  const statusLabel = (showVendors ? STATUS_LABEL_INTERNAL : STATUS_LABEL_CLIENT)[job.status];

  return (
    <li className="rounded-md border border-hairline bg-canvas/45 p-3 flex flex-col sm:flex-row sm:items-start gap-3">
      <div className={`w-9 h-9 rounded-md ${isAwaiting ? 'bg-zapusk/10 border-zapusk/25 text-zapusk-400' : 'bg-ai/10 border-ai/25 text-ai-glow'} border flex items-center justify-center shrink-0`}>
        {isAwaiting ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          {showVendors ? (
            // Admin / manager: полная AI provenance.
            <>
              <StatusBadge tone={providerTone(job.provider)} dot>{providerLabel(job.provider)}</StatusBadge>
              <StatusBadge tone="neutral">{toolLabel(job.tool)}</StatusBadge>
            </>
          ) : (
            // Client: один generic AI-бейдж, без vendor names.
            <StatusBadge tone="ai" dot>{toolClientLabel(job.tool)}</StatusBadge>
          )}
          <StatusBadge tone={outputTypeTone(job.outputType)} dot>{outputTypeLabel(job.outputType)}</StatusBadge>
          <StatusBadge tone={STATUS_TONE[job.status]} dot>{statusLabel}</StatusBadge>
          {/* Sprint 20: AI-ready pill для landing-style материалов. Это
              визуальный сигнал, что страница включает AEO/semantic слой —
              готова к AI-search и answer engines. */}
          {isAEOMaterial(job.outputType) && (
            <StatusBadge tone="ai" dot>AI-ready</StatusBadge>
          )}
        </div>
        <div className="text-sm text-primary leading-snug line-clamp-3">
          {/* Sprint 18: managerComment — приоритетный текст для клиента, его
              менеджер закидывает руками при закрытии задачи. */}
          {job.managerComment || job.resultPreview || job.templateKey}
        </div>
        <div className="text-[11px] text-muted mt-1 flex items-center gap-2 flex-wrap">
          <Clock size={11} />
          {formatTime(job.completedAt ?? job.createdAt)}
          {showVendors && job.model && <span className="font-mono">· {job.model}</span>}
          {showVendors && job.completedBy && (
            <span className="text-success">· закрыл {job.completedBy}</span>
          )}
          {/* Sprint 17: errorCode виден admin/manager на failed/mock job'ах. */}
          {showVendors && job.errorCode && (
            <span className="flex items-center gap-1 text-warning">
              <AlertTriangle size={11} />
              <span className="font-mono">{job.errorCode}</span>
            </span>
          )}
        </div>
        {/* Sprint 17/18: error баннер. Client не видит technical errorMessage;
            видит только мягкое «AI временно недоступен» — на awaiting_manager
            ничего не показываем (preview уже объясняет ситуацию). */}
        {showVendors && job.errorMessage && (job.status === 'failed' || job.status === 'mock') && (
          <div className="mt-1.5 text-[11px] text-warning leading-snug">
            {job.errorMessage}
          </div>
        )}
        {/* Sprint 18: comment от менеджера в форме отдельного блока, если у нас
            уже есть resultPreview — чтобы оба видны. */}
        {job.managerComment && (job.resultPreview && job.resultPreview !== job.managerComment) && (
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-secondary leading-relaxed">
            <MessageCircle size={11} className="text-zapusk-400 mt-0.5 shrink-0" />
            <span><span className="font-semibold text-primary">Менеджер:</span> {job.managerComment}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {/* Sprint 17/18: если есть previewUrl — главная CTA. Variant ai когда
            готово, secondary когда awaiting (на awaiting обычно URL пустой). */}
        {job.previewUrl && (
          <a href={job.previewUrl} target="_blank" rel="noreferrer">
            <Button
              size="sm"
              variant={job.status === 'succeeded' ? 'ai' : 'secondary'}
              iconRight={<ExternalLink size={12} />}
            >
              Открыть результат
            </Button>
          </a>
        )}
        {/* Sprint 18: «Перезапустить» скрыт для client всегда — он не должен
            видеть, что внутри есть AI pipeline, который можно перезапустить. */}
        {showVendors && onRegenerate
          && job.status !== 'queued' && job.status !== 'running' && job.status !== 'awaiting_manager' && (
          <Button
            size="sm"
            variant="ghost"
            iconRight={<ChevronRight size={12} />}
            onClick={() => onRegenerate(job.templateKey)}
          >
            Перезапустить
          </Button>
        )}
      </div>
    </li>
  );
}

// Sprint 20: landing-style материалы получают AEO/semantic слой в prompt'е,
// и в UI помечаются «AI-ready» бейджем.
function isAEOMaterial(outputType: string): boolean {
  return outputType === 'landing'
    || outputType === 'one_pager'
    || outputType === 'pitch_deck'
    || outputType === 'pitch_structure'
    || outputType === 'ai_visibility_report';
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
