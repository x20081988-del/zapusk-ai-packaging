import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Wand2 } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProjectMaterialCard } from '../components/ui/ProjectMaterialCard';
import { EmptyState } from '../components/ui/EmptyState';
import { api, type ArtefactReview, type Project } from '../lib/api';
import { getDemoMaterials } from '../lib/demoMaterials';
import { buildReviewIndex, getReview } from '../lib/reviews';

export default function ProjectPackaging() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [reviews, setReviews] = useState<ArtefactReview[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [singleLoading, setSingleLoading] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    const [p, rs] = await Promise.all([
      api.get<{ project: Project }>(`/api/projects/${id}`),
      api.get<{ reviews: ArtefactReview[] }>(`/api/reviews/project/${id}`),
    ]);
    setProject(p.project);
    setReviews(rs.reviews);
  }
  useEffect(() => { load(); }, [id]);

  function latest(kind: string) {
    return project?.generatedPrompts?.find((p) => p.kind === kind);
  }

  async function regenerate(kind: string) {
    if (!id) return;
    setSingleLoading(kind);
    try {
      await api.post(`/api/prompts/${id}/generate/${kind}`);
      await load();
    } finally {
      setSingleLoading(null);
    }
  }

  async function generateAll() {
    if (!id) return;
    setBulkLoading(true);
    try {
      await api.post(`/api/prompts/${id}/generate-all`);
      await load();
    } finally {
      setBulkLoading(false);
    }
  }

  async function regenerateWithFeedback(kind: string, feedback: string) {
    if (!id) return;
    setSingleLoading(kind);
    try {
      await api.post(`/api/prompts/${id}/generate/${kind}`, { feedback });
      await load();
    } finally {
      setSingleLoading(null);
    }
  }

  async function saveReview(kind: string, latestId: string | undefined, payload: { score: number; comment: string; approved: boolean; needsRework: boolean }) {
    if (!id) return;
    await api.post('/api/reviews', {
      projectId: id,
      artefactKind: 'prompt',
      artefactKey: kind,
      artefactId: latestId,
      ...payload,
    });
    await load();
  }

  const reviewIndex = buildReviewIndex(reviews);
  const materials = getDemoMaterials(project);

  return (
    <AppLayout
      title={project ? `${project.name} · Материалы проекта` : 'Материалы проекта'}
      action={
        <div className="flex items-center gap-2">
          <Link to={`/projects/${id}`}>
            <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={14} />}>К проекту</Button>
          </Link>
          <Link to={`/projects/${id}/prompts`}>
            <Button variant="ghost" size="sm">Все задания</Button>
          </Link>
          <Button variant="ai" size="sm" iconLeft={<Wand2 size={14} />} loading={bulkLoading} onClick={generateAll}>
            Сформировать все материалы
          </Button>
        </div>
      }
    >
      <Card padded className="mb-6">
        <CardHeader
          title="Материалы проекта"
          subtitle="Здесь хранятся готовые инвестиционные материалы проекта: презентации, финансовые модели, посадочные страницы и краткие материалы для инвесторов. Вы можете открыть материал, скачать его, утвердить или отправить на доработку. Задание для создания материала доступно отдельно."
        />
        {materials.length === 0 ? (
          <EmptyState
            icon={<FileText size={20} />}
            title="Готовые материалы ещё не подключены"
            description="Для новых проектов сначала сформируйте задания, затем загрузите готовые презентации, финансовые модели и посадочные страницы."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {materials.map((material) => {
              const kind = material.promptKind;
              const cur = kind ? latest(kind) : undefined;
              const review = kind ? getReview(reviewIndex, 'prompt', kind) : undefined;
              return (
                <ProjectMaterialCard
                  key={material.id}
                  material={material}
                  promptBody={cur?.body}
                  promptVersion={cur?.version}
                  review={review}
                  regenerating={kind ? singleLoading === kind : false}
                  onGeneratePrompt={kind ? () => regenerate(kind) : undefined}
                  onRegenerateWithFeedback={kind ? (feedback) => regenerateWithFeedback(kind, feedback) : undefined}
                  onSaveReview={kind ? (payload) => saveReview(kind, cur?.id, payload) : undefined}
                />
              );
            })}
          </div>
        )}
      </Card>
    </AppLayout>
  );
}
