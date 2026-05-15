import { useEffect, useState } from 'react';
import { Check, ChevronDown, Copy, ExternalLink, FileText, X } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { Input, Textarea } from '../ui/Input';
import { EmptyState } from '../ui/EmptyState';
import { api, type PackagingJob } from '../../lib/api';
import { providerLabel, toolLabel, outputTypeLabel, providerTone, outputTypeTone } from '../../lib/aiProviders';

// Sprint 18: Manager-only компонент. Виден на /manager в блоке «Задачи на
// упаковку». Менеджер открывает задачу → копирует internal prompt → делает
// работу во внешнем инструменте (Lovable, Claude Design, ...) → вставляет
// результат и комментарий → нажимает «Отметить готово». Клиент сразу видит
// «Материал готов».

interface PackagingTaskWithProject extends PackagingJob {
  project: {
    id: string;
    name: string;
    industry: string | null;
    user: { email: string; name: string | null };
  };
}

export function PackagingTasks() {
  const [tasks, setTasks] = useState<PackagingTaskWithProject[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    const r = await api.get<{ jobs: PackagingTaskWithProject[] }>('/api/manager/packaging-tasks');
    setTasks(r.jobs);
  }

  useEffect(() => {
    load();
  }, []);

  if (tasks === null) {
    return (
      <Card padded>
        <CardHeader title="Задачи на упаковку" subtitle="Загрузка..." />
      </Card>
    );
  }

  return (
    <Card padded>
      <CardHeader
        title="Задачи на упаковку"
        subtitle={`${tasks.length} задач${pluralEnding(tasks.length)} в очереди на ручную сборку`}
      />
      {tasks.length === 0 ? (
        <EmptyState
          icon={<Check size={20} />}
          title="Очередь пуста"
          description="Все артефакты собраны. Когда клиент запустит создание landing / финмодели / pitch deck — задача появится здесь."
        />
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <PackagingTaskRow
              key={task.id}
              task={task}
              isOpen={openId === task.id}
              onToggle={() => setOpenId(openId === task.id ? null : task.id)}
              onDone={() => { setOpenId(null); load(); }}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function PackagingTaskRow({
  task, isOpen, onToggle, onDone,
}: {
  task: PackagingTaskWithProject;
  isOpen: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(task.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Не удалось скопировать prompt');
    }
  }

  async function markDone() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/manager/packaging-tasks/${task.id}/complete`, {
        previewUrl: previewUrl.trim() || null,
        resultUrl: resultUrl.trim() || null,
        managerComment: comment.trim() || null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save_failed');
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    if (!window.confirm('Отменить задачу? Клиент увидит «Свяжитесь с командой ZAPUSK AI».')) return;
    setSaving(true);
    try {
      await api.post(`/api/manager/packaging-tasks/${task.id}/cancel`, {
        reason: comment.trim() || 'Менеджер отменил задачу',
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'cancel_failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-hairline bg-canvas/45">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left flex flex-col sm:flex-row sm:items-center gap-3 p-3 hover:bg-surface/40 transition-colors"
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge tone={providerTone(task.provider)} dot>{providerLabel(task.provider)}</StatusBadge>
          <StatusBadge tone="neutral">{toolLabel(task.tool)}</StatusBadge>
          <StatusBadge tone={outputTypeTone(task.outputType)} dot>{outputTypeLabel(task.outputType)}</StatusBadge>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-primary truncate">
            {task.project.name}
          </div>
          <div className="text-[11px] text-muted truncate">
            {task.project.user.name ?? task.project.user.email}
            {task.errorCode && <span className="font-mono ml-2 text-warning">· {task.errorCode}</span>}
          </div>
        </div>
        <ChevronDown size={14} className={`text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="border-t border-hairline p-4 space-y-4">
          {task.errorMessage && (
            <div className="rounded-md border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-warning leading-snug">
              <span className="font-semibold">AI отчёт:</span> {task.errorMessage}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold flex items-center gap-1.5">
                <FileText size={11} />
                Внутренний prompt
              </span>
              <Button size="sm" variant="ghost" iconLeft={<Copy size={12} />} onClick={copyPrompt}>
                {copied ? 'Скопировано' : 'Скопировать'}
              </Button>
            </div>
            <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-hairline bg-canvas/60 p-3 text-[11px] text-secondary font-mono leading-relaxed">
              {task.prompt}
            </pre>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Ссылка для просмотра"
              hint="Что увидит клиент в кнопке «Открыть результат»"
              value={previewUrl}
              onChange={(e) => setPreviewUrl(e.target.value)}
              placeholder="https://glavsnab.zapusk.tech"
            />
            <Input
              label="Ссылка на проект (опционально)"
              hint="Внутренняя ссылка — Lovable IDE, Notion, и т.п."
              value={resultUrl}
              onChange={(e) => setResultUrl(e.target.value)}
              placeholder="https://lovable.dev/projects/..."
            />
          </div>
          <Textarea
            label="Комментарий для клиента"
            hint="Будет показан в карточке материалов вместо системной ссылки. Можно оставить пустым."
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Готово. Посмотрите главный экран — мы вынесли инвестиционные показатели вверх."
          />

          {error && <div className="text-xs text-danger">{error}</div>}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-hairline">
            <Button
              size="sm"
              variant="ghost"
              iconLeft={<X size={13} />}
              onClick={cancel}
              loading={saving}
            >
              Отменить задачу
            </Button>
            <div className="flex items-center gap-2">
              {task.previewUrl && (
                <a href={task.previewUrl} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="ghost" iconLeft={<ExternalLink size={13} />}>
                    Текущий preview
                  </Button>
                </a>
              )}
              <Button
                size="sm"
                variant="primary"
                iconLeft={<Check size={13} />}
                onClick={markDone}
                loading={saving}
              >
                Отметить готово
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function pluralEnding(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'а';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'и';
  return '';
}
