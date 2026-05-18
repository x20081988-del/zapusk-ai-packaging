import { useMemo } from 'react';
import {
  Activity, Clock, FileText, Headphones, MessageCircle, Sparkles, UserRound,
} from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import {
  outputTypeLabel, canSeeAIVendors, providerLabel, toolClientLabel,
} from '../../lib/aiProviders';
import { getAuth } from '../../lib/auth';
import { recoverDisplayFilename } from '../../lib/filenameDisplay';
import type { PackagingJob, Project, UploadedFile } from '../../lib/api';

// Sprint 21 — история активности по проекту. Сводит в одну ленту:
//   • загруженные материалы (UploadedFile)
//   • событие генерации брифа (увеличение версии)
//   • готовые / отправленные на проверку артефакты (PackagingJob)
//   • закрытие задач менеджером (completedBy)
//
// Без новых таблиц — производный view над уже существующими данными.
// Лента отсортирована по времени, последние 15 событий.

interface Props {
  project: Project;
  jobs: PackagingJob[];
}

type EventKind = 'file_uploaded' | 'brief_updated' | 'material_ready' | 'material_review' | 'material_in_progress';

interface ActivityEvent {
  id: string;
  at: string;
  kind: EventKind;
  title: string;
  detail?: string;
}

export function ActivityHistory({ project, jobs }: Props) {
  const role = getAuth()?.role ?? 'client';
  const showVendors = canSeeAIVendors(role);

  const events = useMemo(() => buildEvents(project, jobs, showVendors), [project, jobs, showVendors]);

  return (
    <Card padded>
      <CardHeader
        title="История проекта"
        subtitle="Последние события по проекту: материалы, этапы и проверки"
      />
      {events.length === 0 ? (
        <EmptyState
          icon={<Activity size={20} />}
          title="Пока пусто"
          description="Когда команда проекта загрузит материалы или система соберёт первый артефакт — событие появится здесь."
        />
      ) : (
        <ul className="space-y-2">
          {events.slice(0, 15).map((event) => (
            <li
              key={event.id}
              className="flex items-start gap-3 rounded-md border border-hairline bg-canvas/40 px-3 py-2.5"
            >
              <div className={`w-8 h-8 rounded-md border flex items-center justify-center shrink-0 ${iconWrapClass(event.kind)}`}>
                {iconFor(event.kind)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-primary leading-snug">{event.title}</div>
                {event.detail && <div className="text-[11px] text-muted mt-0.5">{event.detail}</div>}
              </div>
              <div className="text-[11px] text-muted flex items-center gap-1 shrink-0">
                <Clock size={10} />
                {formatRelative(event.at)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function buildEvents(project: Project, jobs: PackagingJob[], showVendors: boolean): ActivityEvent[] {
  const out: ActivityEvent[] = [];

  // Файлы
  for (const f of project.files ?? []) {
    out.push({
      id: `file:${f.id}`,
      at: f.createdAt,
      kind: 'file_uploaded',
      title: `${labelForFile(f)} · ${recoverDisplayFilename(f.originalName)}`,
      detail: humanFileMeta(f),
    });
  }

  // Бриф (одно событие на версию)
  if (project.brief) {
    out.push({
      id: `brief:${project.brief.id}`,
      at: project.brief.updatedAt,
      kind: 'brief_updated',
      title: project.brief.version === 1
        ? 'AI собрал первый бриф проекта'
        : `Бриф обновлён · версия ${project.brief.version}`,
      detail: 'Бизнес-резюме, монетизация, инвестиционный запрос, сильные стороны.',
    });
  }

  // PackagingJob'ы
  for (const job of jobs) {
    const label = outputTypeLabel(job.outputType);
    const vendorBit = showVendors ? ` · ${providerLabel(job.provider)}` : '';
    const aiBit = showVendors ? '' : ` · ${toolClientLabel(job.tool)}`;
    if (job.status === 'succeeded' && job.completedBy) {
      out.push({
        id: `job:${job.id}:done`,
        at: job.completedAt ?? job.createdAt,
        kind: 'material_ready',
        title: `Готово · ${label}${vendorBit}${aiBit}`,
        detail: showVendors
          ? `Закрыл ${job.completedBy}`
          : 'Команда ZAPUSK AI подтвердила готовность материала.',
      });
    } else if (job.status === 'succeeded') {
      // AI fast-path: материал готов автоматически, без manager check.
      out.push({
        id: `job:${job.id}:autodone`,
        at: job.completedAt ?? job.createdAt,
        kind: 'material_ready',
        title: `AI собрал · ${label}${vendorBit}${aiBit}`,
      });
    } else if (job.status === 'awaiting_manager') {
      out.push({
        id: `job:${job.id}:review`,
        at: job.createdAt,
        kind: 'material_review',
        title: `На проверке у команды ZAPUSK AI · ${label}`,
        detail: 'Команда упаковки готовит финальную версию материала.',
      });
    } else if (job.status === 'running' || job.status === 'queued') {
      out.push({
        id: `job:${job.id}:run`,
        at: job.createdAt,
        kind: 'material_in_progress',
        title: `В работе · ${label}${vendorBit}${aiBit}`,
      });
    }
  }

  // Sort desc by time
  out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return out;
}

function humanFileMeta(f: UploadedFile): string {
  const sizeKb = Math.max(1, Math.round(f.size / 1024));
  if (f.url) return f.url;
  // Sprint 61.HOTFIX (P1) — append KB-ingestion hint so founder knows
  // which files actually fed the AI context vs. which were just stored.
  const ingestHint = isIngestibleFile(f) ? '· добавлено в AI-контекст' : '· текст не извлечён';
  return `${sizeKb} КБ · ${categoryLabel(f.category)} ${ingestHint}`;
}

// Sprint 61.HOTFIX (P1) — нагляднее, чем «Загружен материал».
function labelForFile(f: UploadedFile): string {
  if (f.url) return 'Добавлена ссылка';
  switch (f.category) {
    case 'pitch':       return 'Загружена презентация';
    case 'financial':   return 'Загружена финмодель';
    case 'description': return 'Загружено описание';
    case 'reference':   return 'Загружен референс';
    case 'image':       return 'Загружено изображение';
    case 'logo':        return 'Загружен логотип';
    default:            return 'Загружен материал';
  }
}

function categoryLabel(cat: string): string {
  switch (cat) {
    case 'pitch': return 'презентация';
    case 'financial': return 'финансовая модель';
    case 'description': return 'описание';
    case 'image': return 'изображение';
    case 'logo': return 'логотип';
    case 'reference': return 'референс';
    default: return cat;
  }
}

// Sprint 61.HOTFIX (P1) — match server-side isIngestibleMime in
// projectKnowledgeIngest.ts. Files whose text we can extract end up in
// project-scoped KB; images/audio/video do not. Keep these in sync.
function isIngestibleFile(f: UploadedFile): boolean {
  if (f.url) return false; // external link — not indexed
  const ext = (f.originalName.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
  if (ext === '.pdf' || ext === '.docx' || ext === '.xlsx' || ext === '.txt' || ext === '.md') return true;
  const mime = f.mimeType ?? '';
  if (mime.startsWith('text/')) return true;
  return false;
}

function iconFor(kind: EventKind) {
  switch (kind) {
    case 'file_uploaded': return <FileText size={14} />;
    case 'brief_updated': return <Sparkles size={14} />;
    case 'material_ready': return <Headphones size={14} />;
    case 'material_review': return <MessageCircle size={14} />;
    case 'material_in_progress': return <Activity size={14} />;
    default: return <UserRound size={14} />;
  }
}

function iconWrapClass(kind: EventKind): string {
  switch (kind) {
    case 'file_uploaded': return 'border-line bg-elevated text-secondary';
    case 'brief_updated': return 'border-ai/30 bg-ai/10 text-ai-glow';
    case 'material_ready': return 'border-success/30 bg-success/10 text-success';
    case 'material_review': return 'border-zapusk/30 bg-zapusk/10 text-zapusk-400';
    case 'material_in_progress': return 'border-ai/30 bg-ai/10 text-ai-glow';
    default: return 'border-line bg-elevated text-secondary';
  }
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
    if (diffMin < 1) return 'только что';
    if (diffMin < 60) return `${diffMin} мин назад`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} ч назад`;
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
  } catch {
    return iso;
  }
}
