import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Plus, Upload, Search, Filter, FileText, Sparkles,
  CheckCircle2, EyeOff, Archive, AlertTriangle, ChevronRight,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea, Select } from '../components/ui/Input';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Modal } from '../components/ui/Modal';
import { Drawer } from '../components/ui/Drawer';
import { EmptyState } from '../components/ui/EmptyState';
import { api } from '../lib/api';

// Sprint 39 — UI для управления Knowledge Base AI-продаж.
//
// Backend Sprint 38 уже умеет создавать source'ы, нарезать на chunks, искать
// релевантные фрагменты и подмешивать их в AI-ассистента. Эта страница
// добавляет управляемость: admin/manager могут просматривать список,
// фильтровать, создавать ручные заметки, загружать файлы, публиковать/
// отключать, смотреть chunks preview и тестировать retrieval.
//
// Доступ: SUPER_ADMIN / ADMIN / MANAGER. FOUNDER и INVESTOR — нет (см.
// App.tsx RequireRole + Sidebar nav).

// ─── Types (mirror server/src/services/knowledgeService.ts) ───────────────

const SOURCE_TYPES = [
  { value: 'successful_sale', label: 'Успешная продажа' },
  { value: 'failed_sale', label: 'Неуспешная продажа' },
  { value: 'objection', label: 'Возражение' },
  { value: 'qualification', label: 'Квалификация' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'legal_question', label: 'Юридический вопрос' },
  { value: 'financial_question', label: 'Финансовый вопрос' },
  { value: 'project_presentation', label: 'Презентация проекта' },
  { value: 'deal_case', label: 'Кейс сделки' },
  { value: 'manager_script', label: 'Скрипт менеджера' },
  { value: 'messenger_thread', label: 'Переписка в мессенджере' },
  { value: 'meeting_recording', label: 'Запись встречи' },
  { value: 'other', label: 'Другое' },
] as const;
const SOURCE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  SOURCE_TYPES.map((t) => [t.value, t.label]),
);

// Sprint 40 — Russian plural agreement: 1 кандидат / 2-4 кандидата / 5+ кандидатов.
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

interface KbSource {
  id: string;
  scope: 'global' | 'project';
  projectId: string | null;
  title: string;
  sourceType: string;
  status: 'draft' | 'published' | 'disabled';
  visibility: 'internal' | 'client_safe';
  tags: string[];
  summary: string | null;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
  // Sprint 40
  isCandidate?: boolean;
  qualityScore?: number | null;
  qualityReasons?: string[];
  originType?: string | null;
  environment?: 'production' | 'demo' | 'synthetic';
  verifiedAt?: string | null;
  publishedAt?: string | null;
  disabledReason?: string | null;
  retrievalCount?: number;
  lastRetrievedAt?: string | null;
}

interface KbChunkPreview {
  chunkIndex: number;
  tokenEstimate: number;
  text: string | null; // только admin/manager
  redactedText: string | null;
}

interface KbPreviewResponse {
  source: {
    id: string; title: string; sourceType: string; scope: 'global' | 'project';
    status: string; visibility: string; summary: string | null; tags: string[];
  };
  chunks: KbChunkPreview[];
}

interface SearchHit {
  sourceId: string;
  title: string;
  sourceType: string;
  scope: 'global' | 'project';
  visibility: string;
  summary: string | null;
  snippet: string;
  score: number;
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function AdminKnowledge() {
  const [sources, setSources] = useState<KbSource[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'published' | 'disabled'>('all');
  const [filterScope, setFilterScope] = useState<'all' | 'global' | 'project'>('all');
  const [filterType, setFilterType] = useState<'all' | string>('all');
  const [filterQuery, setFilterQuery] = useState('');
  // Sprint 40 — candidate-flow filter. По умолчанию показываем кандидатов
  // первыми (admin/manager должны их разобрать).
  const [filterCandidate, setFilterCandidate] = useState<'all' | 'candidates' | 'verified'>('all');
  const [openSourceId, setOpenSourceId] = useState<string | null>(null);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{ sources: KbSource[] }>('/api/knowledge');
      setSources(r.sources);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load_failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!sources) return [];
    return sources.filter((s) => {
      if (filterStatus !== 'all' && s.status !== filterStatus) return false;
      if (filterScope !== 'all' && s.scope !== filterScope) return false;
      if (filterType !== 'all' && s.sourceType !== filterType) return false;
      if (filterCandidate === 'candidates' && !s.isCandidate) return false;
      if (filterCandidate === 'verified' && s.isCandidate) return false;
      if (filterQuery) {
        const q = filterQuery.toLowerCase();
        const hay = `${s.title} ${s.summary ?? ''} ${(s.tags ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sources, filterStatus, filterScope, filterType, filterCandidate, filterQuery]);

  // Sprint 40 — счётчик кандидатов в шапке: чтобы admin сразу видел сколько
  // материалов ждут разбора.
  const candidateCount = sources?.filter((s) => s.isCandidate).length ?? 0;

  return (
    <AppLayout
      title="База знаний AI-продаж"
      action={
        <div className="flex items-center gap-2">
          <Link to="/admin">
            <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={14} />}>Админ-панель</Button>
          </Link>
          <Button variant="secondary" size="sm" iconLeft={<Upload size={14} />} onClick={() => setShowUploadForm(true)}>
            Загрузить файл
          </Button>
          <Button variant="primary" size="sm" iconLeft={<Plus size={14} />} onClick={() => setShowNoteForm(true)}>
            Создать заметку
          </Button>
        </div>
      }
    >
      <Card padded className="mb-6">
        <CardHeader
          title="Источники знаний"
          subtitle="AI-ассистент опирается на эти кейсы при подготовке подсказок. Опубликованные источники участвуют в retrieval, draft и disabled — нет."
          action={
            <StatusBadge tone="info" dot>
              {loading ? '…' : `${filtered.length} / ${sources?.length ?? 0}`}
            </StatusBadge>
          }
        />

        {/* Sprint 40 — заметная плашка «N кандидатов ждут разбора», если они
            есть. Кликабельная — переключает фильтр сразу на candidates. */}
        {candidateCount > 0 && (
          <button
            type="button"
            className="w-full text-left mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 flex items-center justify-between hover:bg-warning/15 transition-colors"
            onClick={() => setFilterCandidate('candidates')}
          >
            <span className="text-sm text-primary">
              <span className="font-semibold">{candidateCount}</span> {plural(candidateCount, 'кандидат', 'кандидата', 'кандидатов')} ждут разбора —
              auto-capture'нутых из встреч и анализов разговоров.
            </span>
            <span className="text-[11px] text-warning underline underline-offset-2">показать только кандидатов →</span>
          </button>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <Select
            label="Кандидаты"
            value={filterCandidate}
            onChange={(e) => setFilterCandidate(e.target.value as typeof filterCandidate)}
            options={[
              { value: 'all', label: 'Все' },
              { value: 'candidates', label: 'Кандидаты (ждут разбора)' },
              { value: 'verified', label: 'Проверенные' },
            ]}
          />
          <Select
            label="Статус"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            options={[
              { value: 'all', label: 'Все' },
              { value: 'draft', label: 'Черновик' },
              { value: 'published', label: 'Опубликовано' },
              { value: 'disabled', label: 'Отключено' },
            ]}
          />
          <Select
            label="Область"
            value={filterScope}
            onChange={(e) => setFilterScope(e.target.value as typeof filterScope)}
            options={[
              { value: 'all', label: 'Все' },
              { value: 'global', label: 'Глобальная база' },
              { value: 'project', label: 'Проект' },
            ]}
          />
          <Select
            label="Тип материала"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            options={[{ value: 'all', label: 'Все' }, ...SOURCE_TYPES.map((t) => ({ value: t.value, label: t.label }))]}
          />
          <Input
            label="Поиск по названию / тегам"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="например: возражения"
          />
        </div>

        {error && (
          <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 mb-3 flex items-start gap-2 text-xs text-warning">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <EmptyState
            title="Пока пусто"
            description={
              sources && sources.length > 0
                ? 'Под фильтры ничего не подходит. Сбросьте фильтры или поменяйте условия.'
                : 'Создайте первую заметку или загрузите файл, чтобы AI-ассистент начал использовать опыт команды.'
            }
          />
        )}

        {filtered.length > 0 && (
          <ul className="space-y-2">
            {filtered.map((s) => (
              <li key={s.id}>
                <SourceRow source={s} onOpen={() => setOpenSourceId(s.id)} onChanged={load} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SearchDebugCard />

      {showNoteForm && (
        <CreateNoteModal
          onClose={() => setShowNoteForm(false)}
          onCreated={() => { setShowNoteForm(false); load(); }}
        />
      )}
      {showUploadForm && (
        <UploadFormModal
          onClose={() => setShowUploadForm(false)}
          onCreated={() => { setShowUploadForm(false); load(); }}
        />
      )}
      {openSourceId && (
        <PreviewDrawer
          sourceId={openSourceId}
          onClose={() => setOpenSourceId(null)}
          onChanged={load}
        />
      )}
    </AppLayout>
  );
}

// ─── Source row ────────────────────────────────────────────────────────────

function SourceRow({ source, onOpen, onChanged }: { source: KbSource; onOpen: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      await api.patch(`/api/knowledge/${source.id}`, payload);
      onChanged();
    } catch (e) {
      console.warn('[kb] patch failed', e);
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    const reason = window.prompt('Причина отключения (опционально):') ?? '';
    await patch({ status: 'disabled', disabledReason: reason.trim() || null });
  }

  const statusTone = source.status === 'published' ? 'success' : source.status === 'disabled' ? 'danger' : 'neutral';
  const statusLabel = source.status === 'published' ? 'Опубликовано' : source.status === 'disabled' ? 'Отключено' : 'Черновик';
  const scopeLabel = source.scope === 'global' ? 'Глобальная' : 'Проект';
  const visLabel = source.visibility === 'internal' ? 'Внутренняя' : 'Безопасная';
  const envLabel = source.environment === 'demo' ? 'демо' : source.environment === 'synthetic' ? 'синтетика' : 'production';
  const qualityTone = (source.qualityScore ?? 0) >= 70 ? 'success' : (source.qualityScore ?? 0) >= 40 ? 'warning' : 'neutral';

  return (
    <div className={`rounded-md border px-3 py-2.5 flex items-start gap-3 group ${source.isCandidate ? 'border-warning/30 bg-warning/5' : 'border-hairline bg-canvas/40'}`}>
      <button
        type="button"
        onClick={onOpen}
        className="w-8 h-8 rounded-md bg-surface border border-line flex items-center justify-center shrink-0 hover:border-ai/40 transition-colors"
        title="Открыть фрагменты"
      >
        <BookOpen size={13} className="text-ai-glow" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={onOpen} className="text-sm font-medium text-primary text-left hover:text-ai-glow transition-colors">
            {source.title}
          </button>
          {/* Sprint 40 — candidate badge на видном месте. */}
          {source.isCandidate && <StatusBadge tone="warning" dot>Кандидат</StatusBadge>}
          {typeof source.qualityScore === 'number' && (
            <StatusBadge tone={qualityTone} dot>quality {source.qualityScore}</StatusBadge>
          )}
          {source.environment && source.environment !== 'production' && (
            <StatusBadge tone="info" dot>{envLabel}</StatusBadge>
          )}
        </div>
        <div className="text-[11px] text-muted mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{SOURCE_TYPE_LABELS[source.sourceType] ?? source.sourceType}</span>
          <span>· {scopeLabel}</span>
          <span>· {visLabel}</span>
          <span>· {source.chunkCount} фрагм.</span>
          <span>· {new Date(source.createdAt).toLocaleDateString('ru-RU')}</span>
          {source.originType && <span>· источник: {source.originType.replace(/_/g, ' ')}</span>}
          {typeof source.retrievalCount === 'number' && source.retrievalCount > 0 && (
            <span title="Сколько раз AI использовал этот source">· AI исп.: {source.retrievalCount}</span>
          )}
        </div>
        {source.summary && (
          <div className="text-[12px] text-secondary mt-1 leading-snug line-clamp-2">{source.summary}</div>
        )}
        {(source.qualityReasons?.length ?? 0) > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {(source.qualityReasons ?? []).map((r) => (
              <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 border border-warning/30 text-warning">
                {r}
              </span>
            ))}
          </div>
        )}
        {(source.tags?.length ?? 0) > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {source.tags.map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-line text-secondary">
                {t}
              </span>
            ))}
          </div>
        )}
        {source.disabledReason && (
          <div className="mt-1 text-[11px] text-danger leading-snug">
            <span className="opacity-70">отключено:</span> {source.disabledReason}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
        <StatusBadge tone={statusTone} dot>{statusLabel}</StatusBadge>
        {/* Sprint 40 — candidate-flow primary action: «Подтвердить и опубликовать».
            Это PATCH status=published; backend сам выставит isCandidate=false +
            verifiedAt + publishedAt + verifiedById. */}
        {source.isCandidate && (
          <Button size="sm" variant="primary" iconLeft={<CheckCircle2 size={12} />} loading={busy} onClick={() => patch({ status: 'published' })}>
            Подтвердить
          </Button>
        )}
        {!source.isCandidate && source.status !== 'published' && (
          <Button size="sm" variant="ghost" iconLeft={<CheckCircle2 size={12} />} loading={busy} onClick={() => patch({ status: 'published' })}>
            Опубликовать
          </Button>
        )}
        {source.status !== 'disabled' && (
          <Button size="sm" variant="ghost" iconLeft={<EyeOff size={12} />} loading={busy} onClick={reject}>
            {source.isCandidate ? 'Отклонить' : 'Отключить'}
          </Button>
        )}
        {source.status !== 'draft' && (
          <Button size="sm" variant="ghost" iconLeft={<Archive size={12} />} loading={busy} onClick={() => patch({ status: 'draft' })}>
            В черновик
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Create note modal ────────────────────────────────────────────────────

function CreateNoteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [sourceType, setSourceType] = useState<string>('successful_sale');
  const [scope, setScope] = useState<'global' | 'project'>('global');
  const [projectId, setProjectId] = useState('');
  const [visibility, setVisibility] = useState<'internal' | 'client_safe'>('internal');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [tagsInput, setTagsInput] = useState('');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!title.trim()) return setError('Введите название');
    if (text.trim().length < 40) return setError('Текст должен содержать минимум 40 символов');
    if (scope === 'project' && !projectId.trim()) return setError('Укажите projectId для project scope');
    setBusy(true);
    try {
      await api.post('/api/knowledge/create-note', {
        title: title.trim(),
        text,
        sourceType,
        scope,
        projectId: scope === 'project' ? projectId.trim() : null,
        visibility,
        status,
        tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
        summary: summary.trim() || null,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'create_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Создать заметку в базе знаний" width="max-w-3xl">
      <div className="p-5 space-y-3">
        <Input label="Название" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: продажа премиум-инвестору 5 млн" />
        <Textarea
          label="Текст заметки"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder="Описание кейса, успешного подхода, скрипта или возражения. Чем подробнее, тем лучше retrieval."
          hint={`${text.length} символов · минимум 40`}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select
            label="Тип материала"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            options={SOURCE_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          />
          <Select
            label="Область"
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            options={[
              { value: 'global', label: 'Глобальная база' },
              { value: 'project', label: 'Проект' },
            ]}
          />
          {scope === 'project' && (
            <Input
              label="ID проекта"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="cmXXX..."
            />
          )}
          <Select
            label="Видимость"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as typeof visibility)}
            options={[
              { value: 'internal', label: 'Внутренняя (только команда)' },
              { value: 'client_safe', label: 'Безопасная для клиента' },
            ]}
          />
          <Select
            label="Статус"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            options={[
              { value: 'draft', label: 'Черновик' },
              { value: 'published', label: 'Опубликовать сразу' },
            ]}
          />
        </div>
        <Input
          label="Теги (через запятую)"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="premium, real_estate, dividends"
        />
        <Textarea
          label="Краткое описание (опционально)"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          hint="Покажется в карточке источника и в AI-подсказке как safe-summary."
        />
        {error && (
          <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 flex items-start gap-2 text-xs text-warning">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Отмена</Button>
          <Button variant="primary" onClick={submit} loading={busy} iconLeft={<Sparkles size={14} />}>
            Создать
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Upload file modal ────────────────────────────────────────────────────

function UploadFormModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  // Sprint 39 — этот flow требует, чтобы файл сначала жил в каком-то проекте
  // (UploadedFile FK на Project). Самый простой UX в MVP: пользователь
  // указывает projectId (свой dev-project или demo-project), туда грузится
  // файл через /api/files/:projectId/upload, потом /api/knowledge/import-from-file.
  //
  // На MVP оставляем простую двухшаговую форму. В Sprint 40+ можно
  // упростить до single-input.
  const [projectId, setProjectId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState<string>('project_presentation');
  const [scope, setScope] = useState<'global' | 'project'>('project');
  const [visibility, setVisibility] = useState<'internal' | 'client_safe'>('internal');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [tagsInput, setTagsInput] = useState('');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!projectId.trim()) return setError('Укажите projectId, к которому привязать файл');
    if (!file) return setError('Выберите файл');
    if (!title.trim()) return setError('Введите название');
    setBusy(true);
    try {
      // Step 1 — upload file
      const form = new FormData();
      form.append('files', file, file.name);
      form.append('category', 'reference');
      const up = await api.upload<{ files: Array<{ id: string }> }>(`/api/files/${projectId.trim()}/upload`, form);
      const uploadedFileId = up.files?.[0]?.id;
      if (!uploadedFileId) throw new Error('upload_failed');

      // Step 2 — ingest into KB
      await api.post('/api/knowledge/import-from-file', {
        scope,
        projectId: scope === 'project' ? projectId.trim() : null,
        uploadedFileId,
        title: title.trim(),
        sourceType,
        status,
        visibility,
        tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
        summary: summary.trim() || null,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Загрузить файл в базу знаний" width="max-w-3xl">
      <div className="p-5 space-y-3">
        <div className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-xs text-secondary">
          Файл сначала загружается как UploadedFile в указанный проект, затем индексируется
          в базу знаний. Это нужно потому, что у каждого файла должен быть владелец-проект.
        </div>
        <Input
          label="ID проекта (куда загрузить файл)"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          placeholder="cmXXX... (свой проект, demo-проект или специальный 'KB Library' проект)"
        />
        <div>
          <label className="block text-[11px] uppercase tracking-[0.08em] text-muted font-semibold mb-1.5">
            Файл (PDF / DOCX / XLSX / TXT)
          </label>
          <input
            type="file"
            accept=".pdf,.docx,.xlsx,.txt,.md"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-line file:bg-surface file:text-secondary hover:file:bg-elevated file:cursor-pointer file:transition-colors"
          />
          {file && (
            <div className="mt-1 text-xs text-muted flex items-center gap-1.5">
              <FileText size={12} />
              {file.name} · {Math.round(file.size / 1024)} КБ
            </div>
          )}
        </div>
        <Input label="Название" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Главснаб pitch-deck лето 2026" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select
            label="Тип материала"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            options={SOURCE_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          />
          <Select
            label="Область"
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            options={[
              { value: 'global', label: 'Глобальная база' },
              { value: 'project', label: 'Только этот проект' },
            ]}
          />
          <Select
            label="Видимость"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as typeof visibility)}
            options={[
              { value: 'internal', label: 'Внутренняя' },
              { value: 'client_safe', label: 'Безопасная для клиента' },
            ]}
          />
          <Select
            label="Статус"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            options={[
              { value: 'draft', label: 'Черновик' },
              { value: 'published', label: 'Опубликовать сразу' },
            ]}
          />
        </div>
        <Input label="Теги (через запятую)" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="pitch, real_estate" />
        <Textarea
          label="Краткое описание (опционально)"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
        />
        {error && (
          <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 flex items-start gap-2 text-xs text-warning">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Отмена</Button>
          <Button variant="primary" onClick={submit} loading={busy} iconLeft={<Upload size={14} />}>
            Загрузить и проиндексировать
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Preview drawer ────────────────────────────────────────────────────────

function PreviewDrawer({
  sourceId,
  onClose,
  onChanged,
}: {
  sourceId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<KbPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get<KbPreviewResponse>(`/api/knowledge/${sourceId}/preview`)
      .then((r) => { if (alive) setData(r); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sourceId]);

  async function archive() {
    if (!window.confirm('Архивировать источник? Он перестанет участвовать в retrieval.')) return;
    try {
      await api.delete(`/api/knowledge/${sourceId}`);
      onChanged();
      onClose();
    } catch (e) {
      console.warn('[kb] archive failed', e);
    }
  }

  return (
    <Drawer open onClose={onClose} title={data?.source?.title ?? 'Источник'} subtitle="Фрагменты + метаданные" width="max-w-2xl">
      {loading && <div className="text-sm text-muted py-8 text-center">Загрузка…</div>}
      {!loading && !data && <div className="text-sm text-muted py-8 text-center">Не удалось загрузить.</div>}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Meta label="Тип" value={SOURCE_TYPE_LABELS[data.source.sourceType] ?? data.source.sourceType} />
            <Meta label="Область" value={data.source.scope === 'global' ? 'Глобальная' : 'Проект'} />
            <Meta label="Статус" value={data.source.status} />
            <Meta label="Видимость" value={data.source.visibility === 'internal' ? 'Внутренняя' : 'Безопасная для клиента'} />
          </div>
          {data.source.summary && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1">Краткое описание</div>
              <p className="text-sm text-primary leading-snug">{data.source.summary}</p>
            </div>
          )}
          {(data.source.tags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.source.tags.map((t) => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-surface border border-line text-secondary">{t}</span>
              ))}
            </div>
          )}
          <div className="border-t border-hairline pt-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-2">
              Фрагменты ({data.chunks.length})
            </div>
            {data.chunks.length === 0 ? (
              <div className="text-xs text-muted">Фрагментов нет.</div>
            ) : (
              <ul className="space-y-2">
                {data.chunks.map((c) => (
                  <li key={c.chunkIndex} className="rounded-md border border-hairline bg-canvas/40 px-3 py-2">
                    <div className="text-[10px] text-muted mb-1">
                      Фрагмент {c.chunkIndex + 1} · ≈{c.tokenEstimate} токенов
                    </div>
                    <pre className="text-[12px] text-primary leading-relaxed whitespace-pre-wrap font-sans">
                      {/* Sprint 38/39 — если backend вернул text=null, значит роль
                          founder и raw скрыт. У нас сюда зайдут только admin/manager
                          (страница role-guarded), но defense-in-depth. */}
                      {c.text ?? c.redactedText ?? '(пусто)'}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-hairline pt-3">
            <Button variant="danger" size="sm" iconLeft={<Archive size={12} />} onClick={archive}>
              Архивировать источник
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-0.5">{label}</div>
      <div className="text-sm text-primary">{value}</div>
    </div>
  );
}

// ─── Search debug card (P1) ───────────────────────────────────────────────

function SearchDebugCard() {
  const [query, setQuery] = useState('');
  const [projectId, setProjectId] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<number | null>(null);

  async function run() {
    if (query.trim().length < 3) { setError('Минимум 3 символа'); return; }
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<{ sources: SearchHit[]; totalChunksScanned: number }>('/api/knowledge/search-debug', {
        query,
        projectId: projectId.trim() || null,
        topN: 8,
      });
      setHits(r.sources);
      setScanned(r.totalChunksScanned);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'search_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padded>
      <CardHeader
        title="Проверить поиск"
        subtitle="Тест retrieval: какие источники AI-ассистент найдёт для данного запроса. Используется только admin/manager — нужно для отладки качества."
      />
      <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-3 mb-3">
        <Textarea
          label="Запрос (transcript-like текст)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          placeholder="Здравствуйте, я инвестор. Какой минимальный чек и какая доходность?"
        />
        <Input
          label="projectId (опционально)"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          placeholder="оставьте пустым для global-only"
        />
      </div>
      <div className="flex items-center gap-2 mb-3">
        <Button variant="ai" iconLeft={<Search size={14} />} loading={busy} onClick={run}>Найти фрагменты</Button>
        {scanned !== null && (
          <span className="text-[11px] text-muted">просканировано фрагментов: {scanned}</span>
        )}
      </div>
      {error && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 mb-3 flex items-start gap-2 text-xs text-warning">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {hits && (
        hits.length === 0 ? (
          <EmptyState
            title="Ничего не нашлось"
            description="Запрос не пересекается с published+неархивированными источниками. Попробуйте другой текст или загрузите больше материала."
          />
        ) : (
          <ul className="space-y-2">
            {hits.map((h) => (
              <li key={h.sourceId} className="rounded-md border border-hairline bg-canvas/40 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="text-sm font-medium text-primary">{h.title}</div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge tone="ai" dot>score {h.score.toFixed(3)}</StatusBadge>
                  </div>
                </div>
                <div className="text-[11px] text-muted mt-0.5 flex flex-wrap gap-x-3">
                  <span><Filter size={10} className="inline-block -mt-0.5" /> {SOURCE_TYPE_LABELS[h.sourceType] ?? h.sourceType}</span>
                  <span>· {h.scope === 'global' ? 'Глобальная' : 'Проект'}</span>
                  <span>· {h.visibility === 'internal' ? 'Внутренняя' : 'Безопасная'}</span>
                </div>
                {h.summary && <div className="text-[12px] text-secondary mt-1">{h.summary}</div>}
                <details className="mt-1">
                  <summary className="text-[11px] text-muted cursor-pointer flex items-center gap-1 hover:text-primary transition-colors">
                    <ChevronRight size={11} /> snippet
                  </summary>
                  <pre className="mt-1 text-[11.5px] text-muted whitespace-pre-wrap font-sans leading-snug border-l border-line pl-2">
                    {h.snippet.slice(0, 600)}{h.snippet.length > 600 ? '…' : ''}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )
      )}
    </Card>
  );
}
