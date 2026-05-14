import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2, Link2, FileText } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { UploadZone } from '../components/ui/UploadZone';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { api, type Project, type UploadedFile } from '../lib/api';

const CATEGORIES = [
  { value: 'pitch', label: 'Презентация' },
  { value: 'financial', label: 'Финансовая модель' },
  { value: 'description', label: 'Описание проекта' },
  { value: 'image', label: 'Изображение' },
  { value: 'logo', label: 'Логотип' },
  { value: 'reference', label: 'Референс' },
  { value: 'other', label: 'Прочее' },
];

export default function ProjectUpload() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [category, setCategory] = useState('pitch');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkNote, setLinkNote] = useState('');

  async function load() {
    if (!id) return;
    const r = await api.get<{ project: Project }>(`/api/projects/${id}`);
    setProject(r.project);
  }
  useEffect(() => { load(); }, [id]);

  async function uploadFiles(files: File[]) {
    if (!id) return;
    const form = new FormData();
    form.append('category', category);
    files.forEach((f) => form.append('files', f));
    await api.upload(`/api/files/${id}/upload`, form);
    load();
  }

  async function addLink() {
    if (!id || !linkUrl) return;
    await api.post(`/api/files/${id}/link`, { url: linkUrl, note: linkNote, category: 'reference' });
    setLinkUrl(''); setLinkNote('');
    load();
  }

  async function remove(fid: string) {
    if (!id) return;
    // Sprint 30: confirm перед archive. Файл уходит в корзину на 30 дней,
    // admin может восстановить через /admin/audit.
    if (!window.confirm('Убрать файл из материалов проекта? Его можно восстановить через админа в течение 30 дней.')) return;
    await api.delete(`/api/files/${id}/${fid}`);
    load();
  }

  return (
    <AppLayout
      title={project ? `${project.name} · Материалы` : 'Материалы'}
      action={
        <Link to={`/projects/${id}`}>
          <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={14} />}>К проекту</Button>
        </Link>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padded>
          <CardHeader title="Загрузить файлы" subtitle="Презентации, финансовые модели, описания, изображения" />
          <Select label="Категория" value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES} />
          <div className="mt-4">
            <UploadZone onFiles={uploadFiles} hint="PDF · DOCX · XLSX · PPTX · PNG · JPG" />
          </div>
        </Card>

        <Card padded>
          <CardHeader title="Добавить ссылки" subtitle="Документы, таблицы, сайт компании и другие источники" />
          <Input label="URL" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://" />
          <div className="mt-3">
            <Input label="Подпись" value={linkNote} onChange={(e) => setLinkNote(e.target.value)} placeholder="Финансовая модель" />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={addLink} disabled={!linkUrl} iconLeft={<Link2 size={14} />}>Добавить</Button>
          </div>
        </Card>
      </div>

      <Card padded className="mt-6">
        <CardHeader title="Все материалы" subtitle={`${project?.files?.length ?? 0} элементов`} />
        {!project?.files || project.files.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">Пока пусто</p>
        ) : (
          <ul className="space-y-2">
            {project.files.map((f) => <Row key={f.id} file={f} onRemove={() => remove(f.id)} />)}
          </ul>
        )}
      </Card>
    </AppLayout>
  );
}

function Row({ file, onRemove }: { file: UploadedFile; onRemove: () => void }) {
  const isLink = Boolean(file.url);
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-canvas/50 border border-hairline group">
      <div className="w-8 h-8 rounded-md bg-surface border border-line flex items-center justify-center flex-shrink-0">
        {isLink ? <Link2 size={13} className="text-secondary" /> : <FileText size={13} className="text-secondary" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-primary truncate">{file.originalName}</div>
        <div className="text-xs text-muted">
          {isLink ? file.url : `${Math.round(file.size / 1024)} КБ · ${file.category}`}
        </div>
      </div>
      <button onClick={onRemove} className="text-muted hover:text-danger transition-colors">
        <Trash2 size={14} />
      </button>
    </li>
  );
}
