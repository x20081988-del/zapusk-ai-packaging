import { useState } from 'react';
import { BookOpen, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';
import { Input, Textarea, Select } from './Input';
import { api } from '../../lib/api';
import { getAuth } from '../../lib/auth';

// Sprint 42 P0.3 — CTA «Добавить в базу знаний» из карточки ConversationAnalysis
// или SalesSession. Backend endpoint `/api/knowledge/capture` ВСЕГДА создаёт
// candidate (isCandidate=true), так что AI не начнёт использовать source,
// пока admin/manager не нажмёт «Подтвердить» в /admin/knowledge.
//
// Idempotency: backend dedupes по contentHash. Если этот разговор/сессия уже
// был ingest'нут — получим `duplicate: true` и тот же sourceId. UI показывает
// «Уже добавлено в базу знаний».

const SOURCE_TYPES = [
  { value: 'successful_sale', label: 'Успешная продажа' },
  { value: 'failed_sale', label: 'Неуспешная продажа' },
  { value: 'objection', label: 'Возражение' },
  { value: 'qualification', label: 'Квалификация' },
  { value: 'follow_up', label: 'Повторное касание' },
  { value: 'deal_case', label: 'Кейс сделки' },
  { value: 'manager_script', label: 'Скрипт менеджера' },
  { value: 'meeting_recording', label: 'Запись встречи' },
  { value: 'other', label: 'Другое' },
] as const;

interface Props {
  conversationAnalysisId?: string;
  salesSessionId?: string;
  defaultSourceType?: string;
  /** Если true — компонент уже знает что source создан (из props), показывает badge без CTA. */
  alreadyInKb?: boolean;
  size?: 'sm' | 'md';
}

export function AddToKnowledgeBaseButton({
  conversationAnalysisId, salesSessionId, defaultSourceType, alreadyInKb, size = 'sm',
}: Props) {
  const role = getAuth()?.role ?? 'FOUNDER';
  const canAdd = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MANAGER';
  const [showForm, setShowForm] = useState(false);
  const [added, setAdded] = useState<{ sourceId: string; duplicate: boolean } | null>(null);

  if (!canAdd) return null;

  if (alreadyInKb || added) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-success" title="Уже в базе знаний AI-продаж">
        <CheckCircle2 size={11} /> в базе знаний{added?.duplicate ? ' (дубль)' : ''}
      </span>
    );
  }

  return (
    <>
      <Button
        size={size}
        variant="ghost"
        iconLeft={<BookOpen size={12} />}
        onClick={() => setShowForm(true)}
        title="Добавить в базу знаний AI-продаж как кандидат"
      >
        В базу знаний
      </Button>
      {showForm && (
        <AddForm
          conversationAnalysisId={conversationAnalysisId}
          salesSessionId={salesSessionId}
          defaultSourceType={defaultSourceType ?? 'meeting_recording'}
          onCancel={() => setShowForm(false)}
          onAdded={(r) => { setShowForm(false); setAdded(r); }}
        />
      )}
    </>
  );
}

function AddForm({
  conversationAnalysisId, salesSessionId, defaultSourceType,
  onCancel, onAdded,
}: {
  conversationAnalysisId?: string;
  salesSessionId?: string;
  defaultSourceType: string;
  onCancel: () => void;
  onAdded: (r: { sourceId: string; duplicate: boolean }) => void;
}) {
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState(defaultSourceType);
  const [scope, setScope] = useState<'global' | 'project'>('global');
  const [visibility, setVisibility] = useState<'internal' | 'client_safe'>('internal');
  const [tagsInput, setTagsInput] = useState('');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        sourceType, scope, visibility,
        tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
        summary: summary.trim() || null,
      };
      if (title.trim()) body.title = title.trim();
      if (conversationAnalysisId) body.conversationAnalysisId = conversationAnalysisId;
      if (salesSessionId) body.salesSessionId = salesSessionId;
      const r = await api.post<{ sourceId: string; duplicate?: boolean }>('/api/knowledge/capture', body);
      onAdded({ sourceId: r.sourceId, duplicate: Boolean(r.duplicate) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'capture_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onCancel} title="Добавить в базу знаний AI-продаж" width="max-w-2xl">
      <div className="p-5 space-y-3">
        <div className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-xs text-secondary leading-snug">
          Запись будет добавлена как <b>кандидат</b> — AI-ассистент не начнёт использовать её, пока кто-то из команды
          не нажмёт «Подтвердить» в админ-разделе «База знаний AI-продаж». Так мы не засоряем базу шумом.
        </div>
        <Input
          label="Название (опционально)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Останется auto-сгенерированное, если оставить пустым"
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
              { value: 'project', label: 'Только этот проект' },
            ]}
          />
          <Select
            label="Видимость"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as typeof visibility)}
            options={[
              { value: 'internal', label: 'Внутренняя (только команда)' },
              { value: 'client_safe', label: 'Безопасная для клиента' },
            ]}
          />
          <Input
            label="Теги (через запятую)"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="objections, hot_lead"
          />
        </div>
        <Textarea
          label="Краткое описание (опц.)"
          rows={2}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          hint="Покажется в карточке источника и в AI-подсказке."
        />
        {error && (
          <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 flex items-start gap-2 text-xs text-warning">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Отмена</Button>
          <Button variant="primary" loading={busy} onClick={submit} iconLeft={<Sparkles size={14} />}>
            Добавить как кандидат
          </Button>
        </div>
      </div>
    </Modal>
  );
}
