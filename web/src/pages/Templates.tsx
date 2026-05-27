import { useEffect, useRef, useState } from 'react';
import { FileCode2, Plus, Trash2, Cpu, Wand2, Paperclip, Download, X as XIcon, Mic, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';
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

// Sprint 62.P1 — which template keys actually honor template.model at runtime.
// Keep in sync with:
//   • server/src/routes/realtime.ts:resolveTranscriptionModel
//   • server/src/services/openaiTranscribe.ts (file upload транскрипция)
// All other keys (sales_gpt, sales_assistant.prepare_meeting, brief.*, …) read
// model from env.OPENAI_MODEL_MAIN / _FAST and IGNORE template.model. The UI
// shows a warning so admins don't think they're tuning a knob that isn't wired.
const TEMPLATE_MODEL_HONORED_KEYS = new Set<string>([
  'realtime_transcription',
]);

function isTemplateModelHonored(key: string | null | undefined): boolean {
  if (!key) return false;
  return TEMPLATE_MODEL_HONORED_KEYS.has(key.trim());
}

// Sprint 62.P7 — transcription model presets. Shown as a <datalist> for the
// realtime_transcription template so admin doesn't have to memorise the names
// (the regular «Инструмент» dropdown lists LLM tools, not transcription
// models). Admin can also type a custom value — the input is still free-text.
// Keep in sync with the cascade in:
//   • server/src/routes/realtime.ts:resolveTranscriptionModel
//   • server/src/services/openaiTranscribe.ts
// All values verified against the OpenAI /v1/audio/transcriptions + /v1/realtime
// API model lists (May 2026).
const TRANSCRIPTION_MODEL_PRESETS: Array<{ value: string; label: string }> = [
  { value: 'gpt-4o-transcribe',       label: 'gpt-4o-transcribe · качество, по умолчанию' },
  { value: 'gpt-4o-mini-transcribe',  label: 'gpt-4o-mini-transcribe · быстрее, дешевле' },
  { value: 'whisper-1',               label: 'whisper-1 · legacy / совместимость' },
];
const TRANSCRIPTION_PRESETS_DATALIST_ID = 'transcription-model-presets';

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
              {/* Sprint 62.P7 — transcription templates get a datalist with
                  preset transcription models (not LLM tools). Admin can pick
                  from the list or type any custom value. */}
              {isTemplateModelHonored(draft.key) ? (
                <>
                  <Input
                    label="Конкретная модель транскрипции"
                    hint="Выберите из списка ниже или впишите кастомную модель. Если пусто — будет использован OPENAI_MODEL_REALTIME_TRANSCRIBE из env (fallback: gpt-4o-transcribe)."
                    value={draft.model ?? ''}
                    onChange={(e) => setDraft({ ...draft, model: e.target.value || null })}
                    list={TRANSCRIPTION_PRESETS_DATALIST_ID}
                    placeholder="например, gpt-4o-transcribe"
                  />
                  <datalist id={TRANSCRIPTION_PRESETS_DATALIST_ID}>
                    {TRANSCRIPTION_MODEL_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </datalist>
                </>
              ) : (
                <Input
                  label="Конкретная модель (опционально)"
                  hint="Например: gpt-4.1-2025-04, claude-opus-2025. Если пусто — берём дефолт провайдера."
                  value={draft.model ?? ''}
                  onChange={(e) => setDraft({ ...draft, model: e.target.value || null })}
                />
              )}
              {/* Sprint 62.P1 — honest warning about template.model behavior.
                  Today the field is only respected by the realtime_transcription
                  template (live + file upload транскрипция). For sales_gpt /
                  brief / packaging оно ignored at runtime — model берётся из
                  OPENAI_MODEL_MAIN / _FAST. До починки в Sprint 63 это
                  ожидаемое поведение, но founder/admin должен это видеть. */}
              {!isTemplateModelHonored(draft.key) && draft.model && draft.model.trim().length > 0 && (
                <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                  <strong className="font-semibold">⚠ Эта модель сейчас не применяется.</strong>{' '}
                  Поле «Конкретная модель» работает только для transcription
                  шаблонов (realtime_transcription). Для остальных runtime
                  читает <code className="font-mono">OPENAI_MODEL_MAIN</code> /
                  <code className="font-mono">OPENAI_MODEL_FAST</code> из env.
                  Реальную модель можно посмотреть в{' '}
                  <a href="/admin" className="underline">Admin → /api/admin/ai/active-models</a>.
                </div>
              )}
              {/* Sprint 62.P6 — positive help for realtime_transcription.
                  Founder asked для прозрачности: «какая модель отвечает за
                  скорость, и можно ли её сменить тут без деплоя». Ответ — да,
                  это поле и есть переключатель для двух путей транскрипции. */}
              {isTemplateModelHonored(draft.key) && (
                <div className="rounded-md border border-ai/30 bg-ai/8 px-3 py-2 text-xs text-secondary leading-relaxed space-y-1.5">
                  <div className="font-semibold text-ai-glow">Это поле управляет моделью транскрипции.</div>
                  <div>
                    <strong className="text-primary">Realtime (live микрофон / WebRTC):</strong>
                    {' '}значение этого поля становится session model для OpenAI Realtime API.
                    Если пусто → <code className="font-mono">OPENAI_MODEL_REALTIME_TRANSCRIBE</code> из env →
                    {' '}жёсткий fallback <code className="font-mono">gpt-4o-transcribe</code>.
                  </div>
                  <div>
                    <strong className="text-primary">Upload (загруженные аудио-файлы):</strong>
                    {' '}то же значение используется в <code className="font-mono">/v1/audio/transcriptions</code>.
                    Если пусто → <code className="font-mono">OPENAI_MODEL_TRANSCRIBE</code> из env →
                    fallback <code className="font-mono">gpt-4o-transcribe</code>.
                  </div>
                  <div>
                    <strong className="text-primary">Допустимые модели</strong> (выбери из выпадающего списка
                    выше или впиши кастомную):
                    {' '}<code className="font-mono">gpt-4o-transcribe</code> (качество, по умолчанию),
                    {' '}<code className="font-mono">gpt-4o-mini-transcribe</code> (скорость, дешевле),
                    {' '}<code className="font-mono">whisper-1</code> (старый, для совместимости).
                    <br />
                    <span className="text-muted">
                      Список «Инструмент» сверху рассчитан на LLM-инструменты (GPT-4.1 / Claude / Lovable) —
                      его для realtime transcription можно оставить как есть.
                    </span>
                  </div>
                  <div className="text-muted">
                    Текстовый body этого шаблона — словарь терминов проекта. Он отправляется AI
                    как <code className="font-mono">prompt</code> в обоих режимах, помогает
                    правильно расслышать редкие имена и термины.
                    Изменение модели — без деплоя: сохрани шаблон → новые сессии берут новое
                    значение. Проверить можно через{' '}
                    <code className="font-mono">POST /api/admin/transcription/test</code>.
                  </div>
                </div>
              )}
            </div>

            {/* Sprint 62.P8 — inline test block for transcription templates.
                Lets admin hit POST /api/admin/transcription/test without curl.
                Uses LIVE draft.model so unsaved edits are testable. Keeps
                last 3 results in component state — not persisted. */}
            {isTemplateModelHonored(draft.key) && (
              <TranscriptionTestBlock modelValue={draft.model ?? ''} />
            )}

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

// ────────────────────────────────────────────────────────────────────────
// Sprint 62.P8 — TranscriptionTestBlock
// ────────────────────────────────────────────────────────────────────────
// Inline tester for /api/admin/transcription/test. Rendered inside the
// realtime_transcription template modal. Uses LIVE draft.model so admin
// can test new values BEFORE saving the template. Keeps last 3 results
// in component state to compare latency between models — no DB writes.

const DEMO_AUDIO_URL =
  'https://aicallscloud.ru/api/process-record-url?recordUrl=cd2e594f-de27-4358-aa33-f3026010057f.wav';

type TranscriptionMode = 'upload' | 'realtime';

interface TranscriptionTestResult {
  at: number;
  ok: boolean;
  mode: TranscriptionMode;
  effectiveModel?: string;
  source?: string;
  envVar?: string;
  // upload mode
  latencyMs?: number | { fetch?: number; transcribe?: number; total?: number };
  audioBytes?: number;
  transcriptChars?: number;
  transcriptSample?: string;
  provider?: string;
  // realtime mode
  status?: number;
  secretShape?: { hasClientSecret: boolean; expiresAt: number | null };
  // common
  error?: string;
}

function getTotalMs(r: TranscriptionTestResult): number | null {
  if (typeof r.latencyMs === 'number') return r.latencyMs;
  if (r.latencyMs && typeof r.latencyMs.total === 'number') return r.latencyMs.total;
  return null;
}

function TranscriptionTestBlock({ modelValue }: { modelValue: string }) {
  const [mode, setMode] = useState<TranscriptionMode>('upload');
  const [audioUrl, setAudioUrl] = useState<string>(DEMO_AUDIO_URL);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<TranscriptionTestResult[]>([]);

  async function runTest() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const body: { mode: TranscriptionMode; model?: string; audioUrl?: string; templateKey?: string } = {
        mode,
        templateKey: 'realtime_transcription',
      };
      const trimmed = modelValue.trim();
      if (trimmed) body.model = trimmed;
      if (mode === 'upload') body.audioUrl = audioUrl.trim();
      const res = await api.post<TranscriptionTestResult>('/api/admin/transcription/test', body);
      const result: TranscriptionTestResult = { ...res, at: Date.now() };
      setHistory((prev) => [result, ...prev].slice(0, 3));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'unknown');
    } finally {
      setLoading(false);
    }
  }

  const latest = history[0];
  const previous = history[1];
  const latestMs = latest ? getTotalMs(latest) : null;
  const previousMs = previous ? getTotalMs(previous) : null;
  const fasterThanPrevious =
    latestMs !== null && previousMs !== null && latestMs < previousMs;

  return (
    <div className="rounded-md border border-ai/25 bg-ai/4 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mic size={15} className="text-ai-glow" />
          <span className="text-sm font-semibold text-primary">Тест модели транскрипции</span>
        </div>
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold">
          POST /api/admin/transcription/test
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-[0.1em] text-muted font-semibold block mb-1">
            Режим теста
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('upload')}
              className={`flex-1 h-9 px-3 rounded-md text-xs font-medium transition-all ${
                mode === 'upload'
                  ? 'bg-grad-ai text-canvas shadow-ai-glow'
                  : 'border border-line bg-canvas text-secondary hover:border-ai/45'
              }`}
            >
              Upload (аудио)
            </button>
            <button
              type="button"
              onClick={() => setMode('realtime')}
              className={`flex-1 h-9 px-3 rounded-md text-xs font-medium transition-all ${
                mode === 'realtime'
                  ? 'bg-grad-ai text-canvas shadow-ai-glow'
                  : 'border border-line bg-canvas text-secondary hover:border-ai/45'
              }`}
            >
              Realtime probe
            </button>
          </div>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.1em] text-muted font-semibold block mb-1">
            Тестируемая модель
          </label>
          <div className="h-9 px-3 rounded-md border border-hairline bg-canvas/60 flex items-center text-xs text-primary truncate">
            {modelValue.trim() || (
              <span className="text-muted italic">
                поле пустое → backend применит fallback из env / hard default
              </span>
            )}
          </div>
        </div>
      </div>

      {mode === 'upload' && (
        <Input
          label="URL аудио для теста"
          hint="Публичный URL без auth (mp3/wav/m4a). По умолчанию — demo-запись с aicallscloud.ru."
          value={audioUrl}
          onChange={(e) => setAudioUrl(e.target.value)}
          placeholder={DEMO_AUDIO_URL}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ai"
          size="sm"
          iconLeft={<Zap size={13} />}
          onClick={runTest}
          loading={loading}
          disabled={loading || (mode === 'upload' && !audioUrl.trim())}
        >
          Тестировать модель
        </Button>
        {fasterThanPrevious && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-success">
            <Zap size={11} />
            быстрее предыдущего теста
            {previousMs && latestMs && ` (−${previousMs - latestMs} ms)`}
          </span>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger flex items-start gap-2">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>Запрос не прошёл: {errorMsg}</span>
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold">
            Последние результаты (текущая сессия)
          </div>
          {history.map((r, idx) => (
            <TestResultRow key={r.at} result={r} isLatest={idx === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

function TestResultRow({ result, isLatest }: { result: TranscriptionTestResult; isLatest: boolean }) {
  const tone = result.ok ? 'border-success/35 bg-success/8' : 'border-danger/40 bg-danger/10';
  const totalMs = getTotalMs(result);
  const fetchMs = typeof result.latencyMs === 'object' ? result.latencyMs?.fetch : null;
  const transcribeMs = typeof result.latencyMs === 'object' ? result.latencyMs?.transcribe : null;
  return (
    <div className={`rounded-md border ${tone} px-3 py-2.5 text-xs space-y-2 ${isLatest ? 'shadow-ai-glow' : ''}`}>
      <div className="flex items-center flex-wrap gap-2">
        {result.ok ? (
          <span className="inline-flex items-center gap-1 text-success font-semibold">
            <CheckCircle2 size={12} /> OK
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-danger font-semibold">
            <AlertCircle size={12} /> ERROR{result.status ? ` ${result.status}` : ''}
          </span>
        )}
        <span className="text-secondary">mode={result.mode}</span>
        {result.effectiveModel && (
          <span className="text-primary font-mono text-[11px]">{result.effectiveModel}</span>
        )}
        {result.source && (
          <span className="inline-flex items-center h-5 px-2 rounded-full bg-ai/10 border border-ai/25 text-[10px] uppercase tracking-[0.08em] text-ai-glow font-semibold">
            source: {result.source}
          </span>
        )}
        {totalMs !== null && (
          <span className="ml-auto text-secondary font-mono">{totalMs} ms</span>
        )}
      </div>

      {result.ok && result.mode === 'upload' && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
          {fetchMs !== null && fetchMs !== undefined && <span>fetch={fetchMs}ms</span>}
          {transcribeMs !== null && transcribeMs !== undefined && <span>transcribe={transcribeMs}ms</span>}
          {typeof result.audioBytes === 'number' && (
            <span>audio={(result.audioBytes / 1024).toFixed(1)}KB</span>
          )}
          {typeof result.transcriptChars === 'number' && <span>transcript={result.transcriptChars} chars</span>}
          {result.provider && <span>provider={result.provider}</span>}
          {result.envVar && <span>env={result.envVar}</span>}
        </div>
      )}

      {result.ok && result.mode === 'realtime' && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
          {typeof result.status === 'number' && <span>status={result.status}</span>}
          {result.secretShape && (
            <span>
              secret={result.secretShape.hasClientSecret ? '✓ minted' : '✗ missing'}
            </span>
          )}
          {result.envVar && <span>env={result.envVar}</span>}
        </div>
      )}

      {result.ok && result.transcriptSample && (
        <div className="rounded border border-hairline bg-canvas/40 px-2.5 py-1.5 text-[11px] text-secondary leading-relaxed">
          <span className="text-muted">sample:</span> «{result.transcriptSample}…»
        </div>
      )}

      {!result.ok && result.error && (
        <div className="text-[11px] text-danger break-words">{String(result.error).slice(0, 400)}</div>
      )}
    </div>
  );
}
