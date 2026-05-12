import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { DocumentCard } from '../components/ui/DocumentCard';
import { EmptyState } from '../components/ui/EmptyState';
import { api, type Project } from '../lib/api';

export default function ProjectDocuments() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<{ project: Project }>(`/api/projects/${id}`).then((r) => setProject(r.project));
  }, [id]);

  return (
    <AppLayout
      title={project ? `${project.name} · Документы` : 'Документы'}
      action={
        <Link to={`/projects/${id}`}>
          <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={14} />}>К проекту</Button>
        </Link>
      }
    >
      <Card padded>
        <CardHeader title="Текстовые материалы" subtitle="Текстовые файлы для команды · история версий" />
        {!project?.generatedDocs || project.generatedDocs.length === 0 ? (
          <EmptyState
            icon={<FileText size={20} />}
            title="Документов пока нет"
            description="Бизнес на салфетке сохранится как документ после первой генерации брифа. Одностраничник, ответы на вопросы инвестора и краткое резюме появятся после формирования соответствующих заданий."
          />
        ) : (
          <ul className="space-y-3">
            {project.generatedDocs.map((d) => (
              <DocumentCard
                key={d.id}
                doc={d}
                onDownload={() => window.open(`/api/projects/${id}/documents/${d.id}.md`)}
              />
            ))}
          </ul>
        )}
      </Card>
    </AppLayout>
  );
}
