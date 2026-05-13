import { useEffect, useState } from 'react';
import { Activity, ChevronRight, Clock, Cpu, RefreshCw } from 'lucide-react';
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
// собрал материалы по проекту. Показывает: какой AI работал, чем, какой
// артефакт получился и когда. Это аудит-трейл оркестрации.
//
// Источник данных — /api/packaging-jobs/project/:id (read-only).
//
// onRegenerate — опциональный hook: если родитель умеет пересобирать
// артефакт (как ProjectCockpit для prompt-style материалов), мы показываем
// кнопку перегенерации напрямую из истории.
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
};

const STATUS_LABEL: Record<PackagingJob['status'], string> = {
  succeeded: 'Готово',
  running: 'Идёт сборка',
  queued: 'В очереди',
  mock: 'Mock',
  failed: 'Ошибка',
};

export function AIPackagingHistory({ projectId, onRegenerate }: Props) {
  const [jobs, setJobs] = useState<PackagingJob[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Sprint 16: role-gate AI provenance. Client видит только «AI · Pitch Deck»;
  // admin/manager — полный «Claude Design · Claude Design PDF · Pitch Deck».
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

  return (
    <Card padded>
      <CardHeader
        title="AI generated materials"
        subtitle="История запусков Packaging Pipeline: какой AI собрал какой артефакт"
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

      {jobs === null ? (
        <p className="text-sm text-muted text-center py-6">Загружаем историю…</p>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<Cpu size={20} />}
          title="История пуста"
          description="Когда вы запустите генерацию материала — здесь появится запись с провайдером, инструментом и временем."
        />
      ) : (
        <ul className="space-y-2">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="rounded-md border border-hairline bg-canvas/45 p-3 flex flex-col sm:flex-row sm:items-start gap-3"
            >
              <div className="w-9 h-9 rounded-md bg-ai/10 border border-ai/25 text-ai-glow flex items-center justify-center shrink-0">
                <Activity size={14} />
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
                    // Client: только generic AI-бейдж + character инструмента,
                    // без vendor names («AI Reasoning», «AI Web Studio» и т.п.).
                    <StatusBadge tone="ai" dot>{toolClientLabel(job.tool)}</StatusBadge>
                  )}
                  <StatusBadge tone={outputTypeTone(job.outputType)} dot>{outputTypeLabel(job.outputType)}</StatusBadge>
                  <StatusBadge tone={STATUS_TONE[job.status]} dot>{STATUS_LABEL[job.status]}</StatusBadge>
                </div>
                <div className="text-sm text-primary leading-snug truncate">
                  {job.resultPreview || job.templateKey}
                </div>
                <div className="text-[11px] text-muted mt-1 flex items-center gap-2">
                  <Clock size={11} />
                  {formatTime(job.createdAt)}
                  {showVendors && job.model && <span className="font-mono">· {job.model}</span>}
                </div>
              </div>
              {onRegenerate && job.status !== 'queued' && job.status !== 'running' && (
                <Button
                  size="sm"
                  variant="ghost"
                  iconRight={<ChevronRight size={12} />}
                  onClick={() => onRegenerate(job.templateKey)}
                >
                  Перезапустить
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
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
