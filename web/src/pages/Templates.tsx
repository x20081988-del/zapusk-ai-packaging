import { useEffect, useState } from 'react';
import { FileCode2, Plus, Trash2 } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TemplateCard } from '../components/ui/TemplateCard';
import { Modal } from '../components/ui/Modal';
import { Textarea, Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { api, type PromptTemplate } from '../lib/api';

type TemplateDraft = Pick<PromptTemplate, 'key' | 'name' | 'category' | 'description' | 'body' | 'active'> & { id?: string };

const EMPTY_TEMPLATE: TemplateDraft = {
  key: '',
  name: '',
  category: 'custom',
  description: '',
  body: '',
  active: true,
};

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
    if (!current && !/^[a-z0-9_-]+$/.test(d.key.trim())) return 'Ключ: только lowercase, цифры, _ или -.';
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
    <AppLayout title="Шаблоны заданий">
      <Card padded>
        <CardHeader
          title="Библиотека шаблонов заданий"
          subtitle="Базовые шаблоны для материалов инвестора · переменные в фигурных скобках заполняются данными проекта"
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
              hint={current ? 'Ключ нельзя менять после создания.' : 'Например: investor_update или partner_email'}
              value={draft.key}
              disabled={Boolean(current)}
              onChange={(e) => setDraft({ ...draft, key: e.target.value })}
            />
            <Input
              label="Описание"
              value={draft.description ?? ''}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
            <Textarea
              label="Текст задания"
              hint="Используйте {{project_name}}, {{raise_amount}}, {{equity}}, {{business_summary}}, {{strengths}}, {{weaknesses}}, {{missing_data}}, {{napkin}} и т.п."
              rows={18}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              className="font-mono text-xs"
            />
            {error && <p className="text-xs text-danger">{error}</p>}
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
