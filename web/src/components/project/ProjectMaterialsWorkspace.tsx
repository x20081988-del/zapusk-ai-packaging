import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, Download, ExternalLink, FileText, Link2,
  PackageCheck, RefreshCw, Sparkles, Trash2, UploadCloud,
} from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { StatusBadge } from '../ui/StatusBadge';
import { UploadZone } from '../ui/UploadZone';
import { api, downloadBlob, type ProjectMaterialsRegistry, type SourceMaterialRegistryItem } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { recoverDisplayFilename } from '../../lib/filenameDisplay';

interface Props {
  projectId: string;
  onChanged?: () => void | Promise<void>;
}

export function ProjectMaterialsWorkspace({ projectId, onChanged }: Props) {
  const [registry, setRegistry] = useState<ProjectMaterialsRegistry | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get<ProjectMaterialsRegistry>(`/api/files/${projectId}/registry`);
      setRegistry(r);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  async function refreshAll() {
    await load();
    await onChanged?.();
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.append('category', inferUploadCategory(files[0]?.name ?? ''));
      files.forEach((f) => form.append('files', f));
      await api.upload(`/api/files/${projectId}/upload`, form);
      setNotice('Файл загружен, AI-анализ ещё выполняется. Статус обновится после извлечения текста.');
      await refreshAll();
    } finally {
      setUploading(false);
    }
  }

  async function addLink(url: string, note: string) {
    await api.post(`/api/files/${projectId}/link`, { url, note, category: 'reference' });
    setNotice('Ссылка добавлена. Внешние ссылки пока хранятся как источник, но не индексируются автоматически.');
    await refreshAll();
  }

  async function removeFile(item: SourceMaterialRegistryItem) {
    if (!window.confirm('Убрать исходный материал из проекта? Файл будет скрыт из списка материалов.')) return;
    await api.delete(`/api/files/${projectId}/${item.file.id}`);
    setNotice('Материал скрыт из списка проекта.');
    await refreshAll();
  }

  const connected = useMemo(
    () => registry?.sourceMaterials.filter((m) => m.aiContext.status === 'connected') ?? [],
    [registry],
  );

  return (
    <Card padded className="mb-6">
      <CardHeader
        title="Материалы проекта"
        subtitle="Исходные файлы, AI-контекст и материалы, которые уже подготовила система"
        action={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" iconLeft={<RefreshCw size={12} />} onClick={load} loading={loading}>
              Обновить
            </Button>
            <Button size="sm" variant="ghost" iconLeft={<Link2 size={12} />} onClick={() => setLinkOpen(true)}>
              Ссылка
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        <RegistryMetric label="Исходные" value={registry?.summary.sourceCount ?? 0} />
        <RegistryMetric label="В AI-контексте" value={registry?.summary.aiContextCount ?? 0} accent="ai" />
        <RegistryMetric label="Фрагменты" value={registry?.summary.chunkCount ?? 0} />
        <RegistryMetric label="Факты из цифр" value={registry?.summary.numericFactsCount ?? 0} accent="success" />
      </div>

      <div className="rounded-md border border-ai/25 bg-ai/8 px-3 py-2.5 mb-4">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-secondary">
          <PipelineStep label="Upload" />
          <PipelineArrow />
          <PipelineStep label="Извлечение текста" />
          <PipelineArrow />
          <PipelineStep label="Chunking" />
          <PipelineArrow />
          <PipelineStep label="AI indexing" />
          <PipelineArrow />
          <PipelineStep label="Financial facts" />
          <PipelineArrow />
          <PipelineStep label="AI Assistant" />
        </div>
      </div>

      {notice && (
        <div className="mb-4 rounded-md border border-info/25 bg-info/10 px-3 py-2 text-xs text-secondary">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
        <section className="min-w-0">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-primary">Исходные материалы проекта</h3>
              <p className="text-xs text-muted mt-0.5">
                Презентации, финмодели, транскрипты, описания, ссылки и контекстные документы.
              </p>
            </div>
            {uploading && <StatusBadge tone="ai" dot>AI анализируется</StatusBadge>}
          </div>

          <UploadZone onFiles={uploadFiles} hint="PDF, XLSX, DOCX, TXT, презентации, финмодели и транскрипты" />

          {loading && (
            <div className="mt-4 text-sm text-muted text-center py-6">Загрузка материалов…</div>
          )}

          {!loading && registry && registry.sourceMaterials.length === 0 && (
            <EmptyState
              icon={<UploadCloud size={20} />}
              title="Исходные материалы ещё не загружены"
              description="Загрузите презентацию, финансовую модель или описание — система добавит их в AI-контекст проекта."
            />
          )}

          {!loading && registry && registry.sourceMaterials.length > 0 && (
            <div className="mt-4 space-y-3">
              {registry.sourceMaterials.map((item) => (
                <SourceMaterialRow
                  key={item.id}
                  item={item}
                  projectId={projectId}
                  onRemove={() => removeFile(item)}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4 min-w-0">
          <div className="rounded-lg border border-line bg-canvas/45 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-ai-glow" />
              <h3 className="text-sm font-semibold text-primary">AI использует в контексте</h3>
            </div>
            <p className="text-xs text-muted mb-3">
              Это файлы, из которых извлечён текст и которые доступны AI при подсказках и разборе проекта.
            </p>
            {connected.length === 0 ? (
              <div className="rounded-md border border-dashed border-line bg-surface/50 p-3 text-xs text-muted">
                Пока нет файлов с подключённым AI-контекстом.
              </div>
            ) : (
              <ul className="space-y-2">
                {connected.map((item) => (
                  <li key={item.id} className="rounded-md border border-hairline bg-surface/70 p-3">
                    <div className="text-xs font-medium text-primary truncate">
                      {recoverDisplayFilename(item.file.originalName)}
                    </div>
                    <div className="mt-1 text-[11px] text-muted">
                      {item.aiContext.chunkCount} chunks · {item.aiContext.numericFactsCount} numeric facts
                    </div>
                    <div className="mt-1 text-[10px] text-muted">
                      {item.aiContext.lastAnalyzedAt ? `Индекс обновлён ${formatDate(item.aiContext.lastAnalyzedAt)}` : 'Индекс создан'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-line bg-canvas/45 p-4">
            <div className="flex items-center gap-2 mb-2">
              <PackageCheck size={14} className="text-zapusk-400" />
              <h3 className="text-sm font-semibold text-primary">AI-сгенерированные материалы</h3>
            </div>
            <p className="text-xs text-muted mb-3">
              Задания и документы, которые уже собрала система. Финальные карточки ниже показывают готовые материалы для инвестора.
            </p>
            {!registry || registry.generatedMaterials.length === 0 ? (
              <div className="rounded-md border border-dashed border-line bg-surface/50 p-3 text-xs text-muted">
                Пока нет AI-generated материалов.
              </div>
            ) : (
              <ul className="space-y-2">
                {registry.generatedMaterials.slice(0, 6).map((m) => (
                  <li key={`${m.generatedType}:${m.id}`} className="flex items-center justify-between gap-2 rounded-md border border-hairline bg-surface/70 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-primary truncate">{generatedKindLabel(m.kind, m.title)}</div>
                      <div className="text-[10px] text-muted">{m.generatedType === 'document' ? 'Документ' : 'Задание'} · v{m.version}</div>
                    </div>
                    <StatusBadge tone="ai">v{m.version}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <AddLinkModal open={linkOpen} onClose={() => setLinkOpen(false)} onAdd={addLink} />
    </Card>
  );
}

function SourceMaterialRow({ item, projectId, onRemove }: { item: SourceMaterialRegistryItem; projectId: string; onRemove: () => void }) {
  const file = item.file;
  const isLink = Boolean(file.url);
  const aiTone = aiStatusTone(item.aiContext.status);
  const displayName = recoverDisplayFilename(file.originalName);

  return (
    <div className="rounded-lg border border-hairline bg-canvas/45 p-3">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-md bg-surface border border-line flex items-center justify-center shrink-0">
            {isLink ? <Link2 size={15} className="text-secondary" /> : <FileText size={15} className="text-secondary" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <StatusBadge tone="neutral">Source</StatusBadge>
              <StatusBadge tone="zapusk">v{item.version}</StatusBadge>
              <StatusBadge tone={aiTone} dot>{item.aiContext.label}</StatusBadge>
            </div>
            <h4 className="text-sm font-semibold text-primary truncate">{displayName}</h4>
            <div className="mt-1 text-[11px] text-muted">
              {categoryLabel(file.category)} · {formatDate(file.createdAt)} · {isLink ? 'ссылка' : formatSize(file.size)} · загрузил: команда проекта
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 md:justify-end shrink-0">
          {isLink && file.url ? (
            <Button size="sm" variant="secondary" iconLeft={<ExternalLink size={12} />} onClick={() => window.open(file.url!, '_blank', 'noreferrer')}>
              Открыть
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<Download size={12} />}
              onClick={() => downloadBlob(`/api/files/${projectId}/${file.id}/download`, displayName)}
            >
              Скачать
            </Button>
          )}
          <Button size="sm" variant="danger" iconLeft={<Trash2 size={12} />} onClick={onRemove}>
            Убрать
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {item.aiContext.badges.map((badge) => (
          <StatusBadge key={badge} tone={badgeTone(badge)}>{badge}</StatusBadge>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <Meta label="AI chunks" value={String(item.aiContext.chunkCount)} />
        <Meta label="Numeric facts" value={String(item.aiContext.numericFactsCount)} />
        <Meta label="Тип источника" value={sourceTypeLabel(item.aiContext.sourceType)} />
        <Meta label="Видимость" value={visibilityLabel(item.aiContext.visibility)} />
      </div>
    </div>
  );
}

function RegistryMetric({ label, value, accent }: { label: string; value: number; accent?: 'ai' | 'success' }) {
  const cls = accent === 'ai' ? 'text-ai-glow' : accent === 'success' ? 'text-success' : 'text-primary';
  return (
    <div className="rounded-md border border-hairline bg-canvas/45 p-3">
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold">{label}</div>
      <div className={`mt-1 text-2xl font-bold font-num ${cls}`}>{value}</div>
    </div>
  );
}

function PipelineStep({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-2 py-1">
      <CheckCircle2 size={10} className="text-ai-glow" />
      {label}
    </span>
  );
}

function PipelineArrow() {
  return <span className="text-muted">→</span>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-surface/60 px-2.5 py-2 min-w-0">
      <div className="text-[9px] uppercase tracking-[0.08em] text-muted font-semibold truncate">{label}</div>
      <div className="text-[11px] text-primary font-medium truncate mt-0.5">{value}</div>
    </div>
  );
}

function AddLinkModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (url: string, note: string) => void | Promise<void> }) {
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await onAdd(url, note);
      setUrl('');
      setNote('');
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Добавить ссылку">
      <div className="p-5 space-y-4">
        <Input label="Ссылка" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/…" />
        <Input label="Подпись" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Финансовая модель или сайт проекта" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} loading={saving} disabled={!url.trim()}>Добавить</Button>
        </div>
      </div>
    </Modal>
  );
}

function aiStatusTone(status: SourceMaterialRegistryItem['aiContext']['status']): 'success' | 'ai' | 'neutral' | 'danger' {
  if (status === 'connected') return 'success';
  if (status === 'analyzing') return 'ai';
  if (status === 'error') return 'danger';
  return 'neutral';
}

function badgeTone(badge: string): 'success' | 'ai' | 'warning' | 'danger' | 'neutral' {
  if (badge.includes('подключён') || badge.includes('извлечён') || badge.includes('Numeric')) return 'success';
  if (badge.includes('анализируется') || badge.includes('структурирован')) return 'ai';
  if (badge.includes('Ошибка')) return 'danger';
  if (badge.includes('ждёт')) return 'warning';
  return 'neutral';
}

function inferUploadCategory(name: string): string {
  const ext = name.toLowerCase();
  if (ext.endsWith('.xlsx') || ext.includes('финмодель') || ext.includes('financial')) return 'financial';
  if (ext.endsWith('.txt') || ext.endsWith('.docx')) return 'description';
  if (ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg')) return 'image';
  return 'pitch';
}

function categoryLabel(category: string): string {
  switch (category) {
    case 'pitch': return 'презентация';
    case 'financial': return 'финансовая модель';
    case 'description': return 'описание / транскрипт';
    case 'image': return 'изображение';
    case 'logo': return 'логотип';
    case 'reference': return 'референс';
    default: return category || 'материал';
  }
}

function sourceTypeLabel(sourceType: string | null): string {
  switch (sourceType) {
    case 'project_presentation': return 'презентация проекта';
    case 'financial_question': return 'финансовые данные';
    case 'meeting_recording': return 'встреча';
    case 'messenger_thread': return 'переписка';
    case 'other': return 'другое';
    case null: return '—';
    default: return sourceType;
  }
}

function visibilityLabel(visibility: string | null): string {
  if (visibility === 'internal') return 'внутренний AI-контекст';
  if (visibility === 'client_safe') return 'видно клиенту';
  return '—';
}

function generatedKindLabel(kind: string, title: string): string {
  if (title && title !== kind) return title;
  switch (kind) {
    case 'investment_summary': return 'Инвесторское резюме';
    case 'cloud_design': return 'Инвестиционная презентация';
    case 'lovable_landing': return 'Посадочная страница';
    case 'financial': return 'Финансовая модель';
    case 'one_pager': return 'Краткая страница проекта';
    case 'sales_gpt': return 'Сценарий продаж инвесторам';
    default: return kind;
  }
}

function formatSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(size / 1024))} КБ`;
}
