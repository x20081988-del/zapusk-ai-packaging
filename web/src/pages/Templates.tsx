import { useEffect, useRef, useState } from 'react';
import { FileCode2, Plus, Trash2, Cpu, Wand2, Paperclip, Download, X as XIcon } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { TemplateCard } from '../components/ui/TemplateCard';
import { Modal } from '../components/ui/Modal';
import { Textarea, Input, Select } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { api, type PromptTemplate } from '../lib/api';
import { PROVIDER_UI, TOOL_UI, OUTPUT_TYPE_UI } from '../lib/aiProviders';

type TemplateDraft = Pick<
  PromptTemplate,
  'key' | 'name' | 'category' | 'description' | 'body' | 'active' | 'provider' | 'tool' | 'model' | 'outputType'
> & { id?: string };

const EMPTY_TEMPLATE: TemplateDraft = {
  key: '',
  name: '',
  category: 'custom',
  description: '',
  body: '',
  active: true,
  provider: null,
  tool: null,
  model: null,
  outputType: null,
};

// Sprint 15: option lists для select'ов в Templates UI. Берём из общего
// registry (single source of truth), чтобы list был согласован с server-side.
const PROVIDER_OPTIONS = [
  { value: '', label: '— не назначен —' },
  ...Object.entries(PROVIDER_UI).map(([value, meta]) => ({ value, label: meta.label })),
];
const TOOL_OPTIONS = [
  { value: '', label: '— не назначен —' },
  ...Object.entries(TOOL_UI).map(([value, meta]) => ({ value, label: `${meta.label} · ${PROVIDER_UI[meta.provider]?.label ?? meta.provider}` })),
];
const OUTPUT_TYPE_OPTIONS = [
  { value: '', label: '— не назначен —' },
  ...Object.entries(OUTPUT_TYPE_UI).map(([value, meta]) => ({ value, label: meta.label })),
];

export default function Templates() {
  const [templates, setTemplates] = useState<PromptTemplate[] | null>(null);
  const [current, setCurrent] = useState<PromptTemplate | null>(null);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await api.get<{ templates: PromptTemplate[] }>('/api/templates');
    setTemplates(r.templates);
  }
  useEffect(() => { load(); }, []);

  function open(t: PromptTemplate) {
    setCurrent(t);
    setDraft({ ...t });
    setError(null);
  }

  function createNew() {
    setCurrent(null);
    setDraft({ ...EMPTY_TEMPLATE });
    setError(null);
  }

  function close() {
    setCurrent(null);
    setDraft(null);
    setError(null);
  }

  function validate(d: TemplateDraft): string | null {
    if (!d.name.trim()) return 'Название обязательно.';
    if (!d.category.trim()) return 'Категория обязательна.';
    if (!d.body.trim()) return 'Текст задания обязателен.';
    if (!current && !/^[a-z0-9_.-]+$/.test(d.key.trim())) return 'Ключ: lowercase, цифры, точка, _ или -.';
    return null;
  }

  async function save() {
    if (!draft) return;
    const validationError = validate(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        key: draft.key.trim(),
        name: draft.name,
        category: draft.category,
        description: draft.description ?? '',
        body: draft.body,
        active: draft.active,
        // Sprint 15: orchestration metadata — пустую строку трактуем как null,
        // чтобы template вернулся в режим «использует default registry».
        provider: draft.provider?.trim() || null,
        tool: draft.tool?.trim() || null,
        model: draft.model?.trim() || null,
        outputType: draft.outputType?.trim() || null,
      };
      if (current) {
        await api.patch(`/api/templates/${current.id}`, payload);
      } else {
        await api.post('/api/templates', payload);
      }
      await load();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить шаблон.');
    } finally {
      setSaving(false);
    }
  }

  async function removeCurrent() {
    if (!current) return;
    if (!window.confirm(`Удалить шаблон «${current.name}»?`)) return;
    setSaving(true);
    try {
      await api.delete(`/api/templates/${current.id}`);
      await load();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить шаблон.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout title="AI Orchestration · Шаблоны">
      {/* Sprint 15: Templates перестали быть «библиотекой промптов» и стали
          orchestration center. Объясняем это явно сверху страницы. */}
      <Card padded className="mb-6" accent="ai">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-md bg-ai/15 border border-ai/30 text-ai-glow flex items-center justify-center shrink-0">
            <Cpu size={18} />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-primary">AI Orchestration Center</h2>
            <p className="text-xs text-secondary mt-1 leading-relaxed">
              Каждый шаблон — это не просто текст. Это правило оркестрации: какой AI-провайдер
              исполняет задание, каким инструментом, и какой тип артефакта получается на выходе.
              Когда фаундер запускает процесс упаковки, мы используем именно эти настройки.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge tone="ai" dot>4 провайдера</StatusBadge>
              <StatusBadge tone="zapusk" dot>6 инструментов</StatusBadge>
              <StatusBadge tone="success" dot>9 типов артефактов</StatusBadge>
              <span className="text-[11px] text-muted self-center">
                · provider + tool + outputType хранятся прямо в шаблоне
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card padded>
        <CardHeader
          title="Библиотека шаблонов"
          subtitle="Каждая карточка показывает, какой AI работает и что генерирует. Переменные в {{фигурных}} заполняются данными проекта."
          action={<Button size="sm" iconLeft={<Plus size={14} />} onClick={createNew}>Создать</Button>}
        />
        {!templates ? (
          <p className="text-sm text-muted text-center py-8">Загрузка…</p>
        ) : templates.length === 0 ? (
          <EmptyState
            icon={<FileCode2 size={20} />}
            title="Шаблонов нет"
            description="Загрузите базовый набор шаблонов или создайте первый шаблон вручную."
            action={<Button iconLeft={<Plus size={14} />} onClick={createNew}>Создать шаблон</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {templates.map((t) => <TemplateCard key={t.id} template={t} onOpen={() => open(t)} />)}
          </div>
        )}
      </Card>

      <Modal open={Boolean(draft)} onClose={close} title={current?.name ?? 'Новый шаблон'} width="max-w-4xl">
        {draft && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Название" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <Input label="Категория" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
            </div>
            <Input
              label="Ключ"
              hint={current ? 'Ключ нельзя менять после создания.' : 'Например: investor_update или sales_assistant.prepare_meeting'}
              value={draft.key}
              disabled={Boolean(current)}
              onChange={(e) => setDraft({ ...draft, key: e.target.value })}
            />
            <Input
              label="Описание"
              value={draft.description ?? ''}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />

            {/* Sprint 15: AI Orchestration mapping. 3 select'а — провайдер,
                инструмент, тип выхода. Они привязаны к общему registry, но
                админ может оставить «не назначен» и Pipeline сделает fallback
                на default mapping по template.key. */}
            <div className="rounded-md border border-ai/25 bg-ai/8 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Wand2 size={14} className="text-ai-glow" />
                <div>
                  <div className="text-sm font-semibold text-primary">AI Orchestration</div>
                  <div className="text-[11px] text-muted">Какой AI исполняет шаблон и какой артефакт собирается на выходе.</div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Select
                  label="Провайдер"
                  options={PROVIDER_OPTIONS}
                  value={draft.provider ?? ''}
                  onChange={(e) => setDraft({ ...draft, provider: e.target.value || null })}
                />
                <Select
                  label="Инструмент"
                  options={TOOL_OPTIONS}
                  value={draft.tool ?? ''}
                  onChange={(e) => setDraft({ ...draft, tool: e.target.value || null })}
                />
                <Select
                  label="Тип артефакта"
                  options={OUTPUT_TYPE_OPTIONS}
                  value={draft.outputType ?? ''}
                  onChange={(e) => setDraft({ ...draft, outputType: e.target.value || null })}
                />
              </div>
              <Input
                label="Конкретная модель (опционально)"
                hint="Например: gpt-4.1-2025-04, claude-opus-2025. Если пусто — берём дефолт провайдера."
                value={draft.model ?? ''}
                onChange={(e) => setDraft({ ...draft, model: e.target.value || null })}
              />
            </div>

            <Textarea
              label="Текст задания"
              hint="Используйте {{project_name}}, {{raise_amount}}, {{equity}}, {{business_summary}}, {{strengths}}, {{weaknesses}}, {{missing_data}}, {{napkin}} и т.п."
              rows={18}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              className="font-mono text-xs"
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            {/* Sprint 52 P0.1 — attachments. Только для существующего
                шаблона (нужен templateId). Для нового шаблона сначала
                сохраняем, потом можем прикреплять. */}
            {current && <TemplateAttachmentsSection templateId={current.id} />}
            <div className="flex items-center justify-between gap-2 pt-2">
              <div>
                {current && (
                  <Button variant="ghost" iconLeft={<Trash2 size={14} />} onClick={removeCurrent} loading={saving}>
                    Удалить
                  </Button>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={close}>Отмена</Button>
                <Button onClick={save} loading={saving}>Сохранить</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

// Sprint 52 P0.1 — Template Context Attachments UI. Список + upload + remove.
// Раздел рендерится только при editing existing template (нужен id).
function TemplateAttachmentsSection({ templateId }: { templateId: string }) {
  interface AttachmentRow {
    id: string;
    originalName: string;
    mime: string;
    size: number;
    createdAt: string;
  }
  const [items, setItems] = useState<AttachmentRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function reload() {
    try {
      const r = await api.get<{ attachments: AttachmentRow[] }>(`/api/templates/${templateId}/attachments`);
      setItems(r.attachments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить файлы');
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      // Используем api.upload (FormData-friendly через api.ts:line 70).
      await api.upload<{ attachment: AttachmentRow }>(`/api/templates/${templateId}/attachments`, form);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить файл');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(attId: string) {
    setError(null);
    try {
      await api.delete(`/api/templates/${templateId}/attachments/${attId}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить файл');
    }
  }

  function downloadUrl(attId: string) {
    return `/api/templates/${templateId}/attachments/${attId}/download`;
  }

  function humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="rounded-md border border-line bg-elevated p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Paperclip size={14} className="text-zapusk-400" />
          Контекстные файлы
          <span className="text-[11px] text-muted font-normal">
            {items ? `${items.length}` : '…'}
          </span>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.pptx,.json,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={onFileChange}
            disabled={uploading}
          />
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Plus size={13} />}
            onClick={() => fileRef.current?.click()}
            loading={uploading}
          >
            Прикрепить файл
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted">
        PDF / DOCX / TXT / MD / CSV / XLSX / PPTX / JSON / изображения. До 25 МБ.
        AI пока не читает их автоматически (foundation под RAG, появится дальше).
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
      {items && items.length === 0 && (
        <p className="text-[11px] text-muted italic">К шаблону пока ничего не прикреплено.</p>
      )}
      {items && items.length > 0 && (
        <ul className="space-y-1">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-canvas border border-hairline">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-primary truncate" title={a.originalName}>{a.originalName}</div>
                <div className="text-[10.5px] text-muted">
                  {a.mime} · {humanSize(a.size)} · {new Date(a.createdAt).toLocaleString('ru-RU')}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={downloadUrl(a.id)}
                  className="inline-flex items-center justify-center w-7 h-7 rounded text-secondary hover:text-primary hover:bg-elevated"
                  title="Скачать"
                >
                  <Download size={13} />
                </a>
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  className="inline-flex items-center justify-center w-7 h-7 rounded text-secondary hover:text-danger hover:bg-elevated"
                  title="Удалить"
                >
                  <XIcon size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
