import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Sparkles, FileText, Download, ArrowLeft, ExternalLink, Trash2, Link2, Rocket, ChevronRight, Wand2, Package,
  MessageCircle,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { StepCard } from '../components/ui/StepCard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ProjectMaterialCard } from '../components/ui/ProjectMaterialCard';
import { TransformationShowcase } from '../components/ui/TransformationShowcase';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { UploadZone } from '../components/ui/UploadZone';
import { api, type ArtefactReview, type Project, type UploadedFile } from '../lib/api';
import {
  formatMoney, formatPercent, formatDate, parseObj,
  STAGE_LABELS, INVESTOR_TYPE_LABELS,
} from '../lib/format';
import { computeProgress } from '../lib/progress';
import { buildReviewIndex, getReview } from '../lib/reviews';
import { getDemoMaterials, getDemoTransformationCase } from '../lib/demoMaterials';
import { MissingDataPanel } from '../components/ui/MissingDataPanel';
import { PersonalManagerCard } from '../components/ui/PersonalManagerCard';
import { RecentMeetings } from '../components/ui/RecentMeetings';
import { ProjectJourney } from '../components/ui/ProjectJourney';
import { DEFAULT_PROJECT_JOURNEY } from '../lib/projectJourney';

export default function ProjectCockpit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [generatingKind, setGeneratingKind] = useState<string | null>(null);
  const [generatingFull, setGeneratingFull] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [reviews, setReviews] = useState<ArtefactReview[]>([]);

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

  if (!project) {
    return (
      <AppLayout title="Проект">
        <Card><div className="text-sm text-muted text-center py-8">Загрузка…</div></Card>
      </AppLayout>
    );
  }

  const { steps, percent } = computeProgress(project);
  const napkin = parseObj<Record<string, unknown>>(project.brief?.napkin, {});

  async function uploadFiles(files: File[]) {
    if (!id || files.length === 0) return;
    const form = new FormData();
    form.append('category', 'pitch');
    files.forEach((f) => form.append('files', f));
    await api.upload(`/api/files/${id}/upload`, form);
    load();
  }

  async function addLink(url: string, note: string) {
    if (!id) return;
    await api.post(`/api/files/${id}/link`, { url, note, category: 'reference' });
    load();
  }

  async function removeFile(fileId: string) {
    if (!id) return;
    await api.delete(`/api/files/${id}/${fileId}`);
    load();
  }

  async function generateBrief() {
    if (!id) return;
    setGeneratingBrief(true);
    try {
      await api.post(`/api/brief/${id}/generate`);
      await load();
    } finally {
      setGeneratingBrief(false);
    }
  }

  async function generatePrompt(kind: string) {
    if (!id) return;
    setGeneratingKind(kind);
    try {
      await api.post(`/api/prompts/${id}/generate/${kind}`);
      await load();
    } finally {
      setGeneratingKind(null);
    }
  }

  async function generateFullPackaging() {
    if (!id) return;
    setGeneratingFull(true);
    try {
      await api.post(`/api/prompts/${id}/generate-full-packaging`);
      await load();
    } finally {
      setGeneratingFull(false);
    }
  }

  async function regenerateWithFeedback(kind: string, feedback: string) {
    if (!id) return;
    setGeneratingKind(kind);
    try {
      await api.post(`/api/prompts/${id}/generate/${kind}`, { feedback });
      await load();
    } finally {
      setGeneratingKind(null);
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
  const transformation = getDemoTransformationCase(project);
  const materials = getDemoMaterials(project);

  function latestPromptFor(kind: string) {
    return project!.generatedPrompts?.find((p) => p.kind === kind);
  }

  return (
    <AppLayout
      title={project.name}
      action={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={14} />} onClick={() => navigate('/dashboard')}>
            Рабочий стол
          </Button>
          <Link to={`/projects/${id}/review`}>
            <Button variant="secondary" size="sm">Проверка материалов</Button>
          </Link>
          <Link to="/personal-manager">
            <Button variant="secondary" size="sm" iconLeft={<MessageCircle size={14} />}>Менеджер</Button>
          </Link>
          <a href={`/api/projects/${id}/export/zip`}>
            <Button variant="secondary" size="sm" iconLeft={<Package size={14} />}>
              Скачать комплект
            </Button>
          </a>
          <a href={`/api/projects/${id}/export`} target="_blank" rel="noreferrer">
            <Button variant="ghost" size="sm" iconLeft={<Download size={14} />}>
              Данные проекта
            </Button>
          </a>
        </div>
      }
    >
      {/* HERO */}
      <Card padded className="mb-6 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-zapusk/10 rounded-full blur-3xl" />
        <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge tone={percent > 0 ? 'zapusk' : 'neutral'} dot>
                {percent > 0 ? 'Материалы' : 'Черновик'}
              </StatusBadge>
              <span className="text-[11px] uppercase tracking-[0.1em] text-muted">{project.industry ?? 'Отрасль не указана'}</span>
            </div>
            <h1 className="text-3xl font-bold text-primary tracking-tight">{project.name}</h1>
            {project.website && (
              <a href={project.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-secondary hover:text-zapusk-400 mt-1.5">
                {project.website} <ExternalLink size={11} />
              </a>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <Metric label="Привлекает" value={formatMoney(project.raiseAmount, project.currency)} accent="zapusk" />
              <Metric label="Доля" value={formatPercent(project.equityOffered)} />
              <Metric label="Min чек" value={formatMoney(project.minCheck, project.currency)} />
              <Metric label="Стадия" value={STAGE_LABELS[project.stage ?? ''] ?? '—'} />
              <Metric label="Тип инвестора" value={INVESTOR_TYPE_LABELS[project.investorType ?? ''] ?? '—'} />
              <Metric label="Срок" value={formatDate(project.raiseDeadline)} />
              <Metric label="ИНН" value={project.inn ?? '—'} />
              <Metric label="Форма" value={project.legalStatus ?? '—'} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-line bg-canvas/50 p-5">
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold mb-1">Готовность материалов</div>
              <div className="text-4xl font-bold text-primary font-num">{percent}%</div>
              <div className="mt-3 h-1.5 bg-hairline rounded-full overflow-hidden">
                <div className="h-full bg-grad-zapusk transition-all duration-700" style={{ width: `${percent}%` }} />
              </div>
            </div>

            <Button
              variant="primary"
              size="md"
              className="w-full"
              iconLeft={<Wand2 size={14} />}
              loading={generatingFull}
              onClick={generateFullPackaging}
            >
              Сформировать полный комплект материалов
            </Button>
            <Button
              variant="ai"
              size="md"
              className="w-full"
              iconLeft={<Sparkles size={14} />}
              loading={generatingBrief}
              onClick={generateBrief}
            >
              {project.brief ? `Только бриф (v${project.brief.version + 1})` : 'Только бриф'}
            </Button>
          </div>
        </div>
      </Card>

      {transformation && <TransformationShowcase item={transformation} />}

      {/* PROGRESS STEPS */}
      <Card padded className="mb-6">
        <CardHeader
          title="Прогресс материалов"
          subtitle="От исходных данных до готового комплекта для инвестора"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {steps.map((s, i) => (
            <StepCard
              key={s.key}
              index={i + 1}
              label={s.label}
              done={s.done}
              current={!s.done && steps.slice(0, i).every((p) => p.done)}
            />
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 mb-6">
        <ProjectJourney stages={DEFAULT_PROJECT_JOURNEY} compact />
        <PersonalManagerCard compact />
      </div>

      {/* Память встреч: последние 3 встречи с инвесторами по этому проекту */}
      <div className="mb-6">
        <RecentMeetings projectId={id} limit={3} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* MATERIALS */}
        <Card padded className="lg:col-span-1">
          <CardHeader
            title="Материалы"
            subtitle={`${project.files?.length ?? 0} загружено`}
            action={
              <Button size="sm" variant="ghost" iconLeft={<Link2 size={12} />} onClick={() => setLinkOpen(true)}>
                Ссылка
              </Button>
            }
          />
          <UploadZone onFiles={uploadFiles} hint="Презентация, финансовая модель, описание, логотип, референсы" />
          {project.files && project.files.length > 0 && (
            <ul className="mt-4 space-y-2">
              {project.files.map((f) => <FileRow key={f.id} file={f} onRemove={() => removeFile(f.id)} />)}
            </ul>
          )}
        </Card>

        {/* NAPKIN */}
        <Card padded accent={project.brief ? 'ai' : null} className="lg:col-span-2">
          <CardHeader
            title="Бизнес на салфетке"
            subtitle={project.brief ? `Разбор v${project.brief.version}` : 'Будет собран после генерации брифа'}
            action={project.brief && (
              <Link to={`/projects/${id}/brief`}>
                <Button variant="ghost" size="sm" iconRight={<ChevronRight size={14} />}>Открыть</Button>
              </Link>
            )}
          />
          {project.brief ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <NapkinField label="Что за бизнес" value={napkin.whatIs as string} />
              <NapkinField label="Как зарабатывает" value={napkin.howMakesMoney as string} />
              <NapkinField label="Сколько нужно" value={napkin.howMuchNeeded as string} />
              <NapkinField label="На что деньги" value={napkin.whatFor as string} />
              <NapkinField label="Доход инвестора" value={napkin.investorReturn as string} />
              <NapkinField label="Почему сейчас" value={napkin.whyNow as string} />
            </div>
          ) : (
            <EmptyState
              icon={<Sparkles size={20} />}
              title="Бриф ещё не сгенерирован"
              description="Загрузите хотя бы один материал и нажмите «Сформировать бриф». Если данных мало, система соберёт аккуратный черновик."
              action={<Button variant="ai" iconLeft={<Sparkles size={14} />} loading={generatingBrief} onClick={generateBrief}>Запустить</Button>}
            />
          )}
        </Card>
      </div>

      {/* MISSING DATA — categorized */}
      {project.brief && (
        <div className="mb-6">
          <MissingDataPanel
            rawJson={project.brief.missingByCategory}
            interviewHref={`/projects/${id}/interview`}
          />
        </div>
      )}

      {/* READY MATERIALS */}
      <Card padded className="mb-6">
        <CardHeader
          title="Материалы"
          subtitle="Здесь хранятся готовые инвестиционные материалы проекта: презентации, финансовые модели, посадочные страницы и краткие материалы для инвесторов. Вы можете открыть материал, скачать его, утвердить или отправить на доработку. Задание для создания материала доступно отдельно."
          action={
            <Link to={`/projects/${id}/packaging`}>
              <Button variant="ghost" size="sm" iconRight={<ChevronRight size={14} />}>Все материалы</Button>
            </Link>
          }
        />
        {materials.length === 0 ? (
          <EmptyState
            icon={<FileText size={20} />}
            title="Готовые материалы ещё не подключены"
            description="После упаковки здесь появятся презентации, финансовые модели, посадочные страницы и краткие материалы для инвесторов."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {materials.slice(0, 6).map((material) => {
              const kind = material.promptKind;
              const latest = kind ? latestPromptFor(kind) : undefined;
              const review = kind ? getReview(reviewIndex, 'prompt', kind) : undefined;
              return (
                <ProjectMaterialCard
                  key={material.id}
                  material={material}
                  promptBody={latest?.body}
                  promptVersion={latest?.version}
                  review={review}
                  regenerating={kind ? generatingKind === kind : false}
                  onGeneratePrompt={kind ? () => generatePrompt(kind) : undefined}
                  onRegenerateWithFeedback={kind ? (feedback) => regenerateWithFeedback(kind, feedback) : undefined}
                  onSaveReview={kind ? (p) => saveReview(kind, latest?.id, p) : undefined}
                />
              );
            })}
          </div>
        )}
      </Card>

      {/* NEXT ACTIONS */}
      <Card padded className="bg-gradient-to-br from-surface to-canvas border-zapusk/20">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-grad-zapusk shadow-glow flex items-center justify-center flex-shrink-0">
            <Rocket size={18} className="text-canvas" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-primary">Следующие шаги</h3>
            <p className="text-sm text-secondary mt-1">
              {percent < 30 && 'Загрузите презентацию или описание проекта — система соберёт первый бриф.'}
              {percent >= 30 && percent < 60 && 'Откройте интервью по проекту и ответьте на 5-7 уточняющих вопросов.'}
              {percent >= 60 && percent < 100 && 'Сформируйте оставшиеся задания и скачайте одностраничник.'}
              {percent === 100 && 'Материалы готовы — скачайте комплект и передайте команде.'}
            </p>
          </div>
          <Link to={`/projects/${id}/packaging`}>
            <Button iconRight={<ChevronRight size={14} />}>К материалам проекта</Button>
          </Link>
        </div>
      </Card>

      <AddLinkModal open={linkOpen} onClose={() => setLinkOpen(false)} onAdd={addLink} />
    </AppLayout>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: 'zapusk' }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1">{label}</div>
      <div className={`text-[15px] font-semibold font-num truncate ${accent === 'zapusk' ? 'text-zapusk-400' : 'text-primary'}`}>{value}</div>
    </div>
  );
}

function NapkinField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1">{label}</div>
      <div className="text-sm text-primary leading-snug">{value || <span className="text-faint">—</span>}</div>
    </div>
  );
}

function FileRow({ file, onRemove }: { file: UploadedFile; onRemove: () => void }) {
  const isLink = Boolean(file.url);
  return (
    <li className="flex items-center gap-3 px-3 py-2 rounded-md bg-canvas/50 border border-hairline group">
      <div className="w-8 h-8 rounded-md bg-surface border border-line flex items-center justify-center flex-shrink-0">
        {isLink ? <Link2 size={13} className="text-secondary" /> : <FileText size={13} className="text-secondary" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-primary truncate">{file.originalName}</div>
        <div className="text-[10px] text-muted">
          {isLink ? file.url : `${Math.round(file.size / 1024)} КБ · ${file.category}`}
        </div>
      </div>
      <button onClick={onRemove} className="text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity">
        <Trash2 size={13} />
      </button>
    </li>
  );
}

function AddLinkModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (url: string, note: string) => void }) {
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Добавить ссылку">
      <div className="p-5 space-y-4">
        <Input label="Ссылка" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/…" />
        <Input label="Подпись" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Финансовая модель" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button onClick={() => { onAdd(url, note); setUrl(''); setNote(''); onClose(); }}>Добавить</Button>
        </div>
      </div>
    </Modal>
  );
}
