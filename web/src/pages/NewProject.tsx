import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Rocket, Trash2, Upload } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Input, Select, Textarea } from '../components/ui/Input';
import { UploadZone } from '../components/ui/UploadZone';
import { VoiceInputButton } from '../components/ui/VoiceInputButton';
import { api, type Project } from '../lib/api';

const STAGE_OPTIONS = [
  { value: '', label: '— выберите —' },
  { value: 'idea', label: 'Идея' },
  { value: 'mvp', label: 'MVP' },
  { value: 'early_revenue', label: 'Ранняя выручка' },
  { value: 'scaling', label: 'Масштабирование' },
  { value: 'growth', label: 'Рост' },
];

const INVESTOR_OPTIONS = [
  { value: '', label: '— выберите —' },
  { value: 'private', label: 'Частный инвестор' },
  { value: 'fund', label: 'Фонд' },
  { value: 'strategic', label: 'Стратег' },
  { value: 'grant', label: 'Грант' },
];

const LEGAL_OPTIONS = [
  { value: '', label: '— выберите —' },
  { value: 'OOO', label: 'ООО' },
  { value: 'IP', label: 'ИП' },
  { value: 'AO', label: 'АО / ПАО' },
  { value: 'individual', label: 'Физлицо' },
  { value: 'other', label: 'Иное' },
];

export default function NewProject() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    inn: '',
    website: '',
    industry: '',
    legalStatus: '',
    stage: '',
    raiseAmount: '',
    minCheck: '',
    equityOffered: '',
    raiseDeadline: '',
    investorType: '',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Sprint 14: материалы можно прикрепить уже на «Новом проекте». Они
  // лежат в state до создания проекта, затем upload идёт одним multipart-
  // запросом после получения projectId.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingMaterials, setUploadingMaterials] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function appendDescription(text: string) {
    setForm((f) => ({
      ...f,
      description: [f.description.trim(), text.trim()].filter(Boolean).join('\n'),
    }));
  }

  function addFiles(files: File[]) {
    if (files.length === 0) return;
    setPendingFiles((prev) => [...prev, ...files]);
  }

  function removeFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    if (!form.name.trim()) return setErr('Название обязательно');
    setSubmitting(true);
    setErr(null);
    try {
      const res = await api.post<{ project: Project }>('/api/projects', {
        name: form.name.trim(),
        inn: form.inn || null,
        website: form.website || null,
        industry: form.industry || null,
        legalStatus: form.legalStatus || null,
        stage: form.stage || null,
        raiseAmount: form.raiseAmount ? Number(form.raiseAmount) : null,
        minCheck: form.minCheck ? Number(form.minCheck) : null,
        equityOffered: form.equityOffered ? Number(form.equityOffered) : null,
        raiseDeadline: form.raiseDeadline || null,
        investorType: form.investorType || null,
        description: form.description.trim() || null,
      });

      // Если фаундер прикрепил файлы при создании — поднимаем их в проект.
      // Категория 'pitch' матчит существующий UploadZone в ProjectCockpit, чтобы
      // материалы появились в общем списке без дополнительных миграций.
      if (pendingFiles.length > 0) {
        setUploadingMaterials(true);
        try {
          const fd = new FormData();
          fd.append('category', 'pitch');
          pendingFiles.forEach((f) => fd.append('files', f));
          await api.upload(`/api/files/${res.project.id}/upload`, fd);
        } catch (uploadErr) {
          // Не блокируем переход — проект уже создан, файлы можно дозалить
          // на странице проекта. Сообщаем мягко.
          console.warn('[new-project] materials upload failed', uploadErr);
        } finally {
          setUploadingMaterials(false);
        }
      }

      navigate(`/projects/${res.project.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'create failed');
      setSubmitting(false);
    }
  }

  function preventImplicitSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA') return;
    e.preventDefault();
  }

  return (
    <AppLayout
      title="Новый проект"
      action={
        <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={14} />} onClick={() => navigate(-1)}>
          Назад
        </Button>
      }
    >
      <div className="max-w-readable mx-auto">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-zapusk-400 font-semibold mb-2">
            <Rocket size={12} /> Шаг 1 из 3
          </div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">Старт подготовки материалов</h1>
          <p className="text-sm text-secondary mt-1.5">
            Эти данные сформируют контекст проекта. Чем точнее заполните — тем глубже будет первичный разбор.
          </p>
        </div>

        <form onSubmit={(e) => e.preventDefault()} onKeyDown={preventImplicitSubmit} className="space-y-4">
          <Card>
            <CardHeader title="Идентификация" subtitle="Что и кто" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Название проекта"
                required
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Например: Tinkoff Investments AI"
              />
              <Input
                label="ИНН"
                hint="Можно оставить пустым, если юрлицо еще не создано"
                value={form.inn}
                onChange={(e) => set('inn', e.target.value)}
                placeholder="10 или 12 цифр"
              />
              <Input
                label="Сайт"
                type="url"
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
                placeholder="https://"
              />
              <Input
                label="Отрасль"
                value={form.industry}
                onChange={(e) => set('industry', e.target.value)}
                placeholder="Финтех / сервис для бизнеса / маркетплейс / …"
              />
              <Select
                label="Юридический статус"
                value={form.legalStatus}
                onChange={(e) => set('legalStatus', e.target.value)}
                options={LEGAL_OPTIONS}
              />
              <Select label="Стадия" value={form.stage} onChange={(e) => set('stage', e.target.value)} options={STAGE_OPTIONS} />
            </div>
          </Card>

          <Card accent="zapusk">
            <CardHeader title="Сделка" subtitle="Условия для инвестора" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Сколько хотите привлечь, ₽"
                type="number"
                inputMode="numeric"
                min={0}
                value={form.raiseAmount}
                onChange={(e) => set('raiseAmount', sanitizeNumber(e.target.value, { min: 0 }))}
                placeholder="20 000 000"
              />
              <Input
                label="Минимальный чек инвестора, ₽"
                type="number"
                inputMode="numeric"
                min={0}
                value={form.minCheck}
                onChange={(e) => set('minCheck', sanitizeNumber(e.target.value, { min: 0 }))}
                placeholder="1 000 000"
              />
              <Input
                label="Доля для инвестора, %"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                value={form.equityOffered}
                onChange={(e) => set('equityOffered', sanitizeNumber(e.target.value, { min: 0, max: 100 }))}
                placeholder="10"
              />
              <Input
                label="Срок привлечения"
                type="date"
                value={form.raiseDeadline}
                onChange={(e) => set('raiseDeadline', e.target.value)}
              />
              <Select
                label="Тип инвестора"
                value={form.investorType}
                onChange={(e) => set('investorType', e.target.value)}
                options={INVESTOR_OPTIONS}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Контекст проекта" subtitle="Опционально — поможет первому разбору" />
            <div className="mb-3 flex justify-end">
              <VoiceInputButton
                size="sm"
                label="Надиктовать контекст"
                onTranscript={appendDescription}
              />
            </div>
            <Textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={4}
              placeholder="В двух предложениях: что делаете, кому продаёте, как зарабатываете."
            />

            {/* Sprint 14: фаундер может приложить материалы сразу. Файлы держатся
                в state до отправки формы, потом одним multipart-вызовом уезжают
                в /api/files/{projectId}/upload — категория «pitch», чтобы они
                попали в общий список материалов проекта. */}
            <div className="mt-5 pt-5 border-t border-hairline">
              <div className="flex items-center gap-2 mb-2">
                <Upload size={14} className="text-zapusk-400" />
                <span className="text-sm font-semibold text-primary">Материалы проекта</span>
                <span className="text-[11px] text-muted">опционально</span>
              </div>
              <p className="text-xs text-secondary leading-relaxed mb-3">
                Если у вас уже есть презентация, финмодель или описание проекта — загрузите их. AI
                использует материалы для первого разбора и соберёт более точный «бизнес на салфетке».
              </p>
              <UploadZone
                onFiles={addFiles}
                hint="Презентация, финансовая модель, описание, логотип, референсы — любой формат"
              />
              {pendingFiles.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {pendingFiles.map((file, i) => (
                    <li
                      key={`${file.name}-${i}`}
                      className="flex items-center gap-3 px-3 py-2 rounded-md bg-canvas/50 border border-hairline"
                    >
                      <div className="w-8 h-8 rounded-md bg-surface border border-line flex items-center justify-center shrink-0">
                        <FileText size={13} className="text-secondary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-primary truncate">{file.name}</div>
                        <div className="text-[10px] text-muted">{Math.round(file.size / 1024)} КБ</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-muted hover:text-danger transition-colors"
                        aria-label="Убрать файл"
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                  <li className="text-[11px] text-muted">
                    {pendingFiles.length} файл{pluralizeFiles(pendingFiles.length)} будет загружен{pluralizeFiles(pendingFiles.length) === '' ? '' : 'о'} после создания проекта.
                  </li>
                </ul>
              )}
            </div>
          </Card>

          {err && <div className="text-sm text-danger">{err}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => navigate('/dashboard')}>
              Отмена
            </Button>
            <Button
              type="button"
              loading={submitting || uploadingMaterials}
              size="lg"
              iconLeft={<Rocket size={14} />}
              onClick={submit}
            >
              {pendingFiles.length > 0
                ? `Создать проект и загрузить ${pendingFiles.length} файл${pluralizeFiles(pendingFiles.length)}`
                : 'Создать и перейти к загрузке материалов'}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}

function pluralizeFiles(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return '';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'а';
  return 'ов';
}

function sanitizeNumber(value: string, limits: { min?: number; max?: number }): string {
  if (value === '') return '';
  if (value.trim().startsWith('-')) return String(limits.min ?? 0);
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  if (limits.min != null && num < limits.min) return String(limits.min);
  if (limits.max != null && num > limits.max) return String(limits.max);
  return value;
}
