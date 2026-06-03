import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, FileText, Lock, MessageCircle, ShieldCheck,
  Sparkles, TrendingUp, Wallet, CheckCircle2, AlertTriangle, ChevronRight,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { InvestorApplicationForm } from '../components/ui/InvestorApplicationForm';
import { OpportunityCoverArt } from '../components/ui/OpportunityCoverArt';
import { api, type Project, type PackagingJob, type InvestorInterest } from '../lib/api';
import { buildOpportunityView, type OpportunityView, type OpportunityDocument } from '../lib/opportunities';
import { formatMoney } from '../lib/format';

// Sprint 62.P11 — инвестор-facing страница проекта (НЕ ProjectCockpit).
// Только то, что видит инвестор на краудинвестинговой витрине: оффер, тезис,
// метрики, открытые материалы, запертый data room, шаги сделки, юр-блок.
export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [jobs, setJobs] = useState<PackagingJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formInterest, setFormInterest] = useState<InvestorInterest>('materials');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api.get<{ project: Project }>(`/api/projects/${id}`)
      .then((r) => setProject(r.project))
      .catch((e) => setError(e instanceof Error ? e.message : 'Не удалось загрузить проект'))
      .finally(() => setLoading(false));
    api.get<{ jobs: PackagingJob[] }>(`/api/packaging-jobs/project/${id}`)
      .then((r) => setJobs(r.jobs))
      .catch(() => setJobs([]));
  }, [id]);

  const view: OpportunityView | null = useMemo(
    () => (project ? buildOpportunityView(project) : null),
    [project],
  );

  // previewUrl по outputType (последний succeeded job этого типа).
  const previewByType = useMemo(() => {
    const map: Record<string, string> = {};
    for (const j of jobs) {
      if (j.status === 'succeeded' && j.previewUrl && !map[j.outputType]) map[j.outputType] = j.previewUrl;
    }
    return map;
  }, [jobs]);

  function openForm(interest: InvestorInterest) {
    setFormInterest(interest);
    setFormOpen(true);
  }

  if (loading) {
    return (
      <AppLayout title="Инвест-возможность · ZAPUSK AI">
        <Card><div className="text-sm text-muted text-center py-10">Загрузка…</div></Card>
      </AppLayout>
    );
  }

  if (error || !project || !view) {
    return (
      <AppLayout title="Инвест-возможность · ZAPUSK AI">
        <BackLink />
        <Card padded>
          <EmptyState
            icon={<TrendingUp size={20} />}
            title="Возможность недоступна"
            description={error ?? 'Этот проект не найден или ещё не открыт для инвесторов.'}
          />
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`${project.name} · ZAPUSK AI`}>
      <BackLink />

      {/* ── Hero ── */}
      <div className="rounded-2xl border border-hairline bg-surface shadow-card overflow-hidden mb-4">
        <OpportunityCoverArt cover={view.cover} className="h-44 sm:h-56" iconSize={200}>
          <div className="absolute top-4 left-4 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/40 backdrop-blur-sm px-2.5 py-1 text-[11px] font-semibold text-white">
              <span className={`w-1.5 h-1.5 rounded-full ${view.statusTone === 'success' ? 'bg-emerald-300' : 'bg-white'}`} />
              {view.statusLabel}
            </span>
            {view.badges.map((b) => (
              <span key={b.label} className="inline-flex items-center rounded-full bg-white/15 backdrop-blur-sm px-2.5 py-1 text-[11px] font-semibold text-white">
                {b.label}
              </span>
            ))}
          </div>
          <div className="absolute bottom-4 left-5 right-5">
            <p className="text-[11px] uppercase tracking-[0.1em] font-semibold text-white/85">{view.tagline}</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight drop-shadow-sm">{project.name}</h1>
          </div>
        </OpportunityCoverArt>

        <div className="p-5">
          <p className="text-sm text-secondary max-w-2xl leading-relaxed">{view.subtitle}</p>

          {view.highlights.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {view.highlights.map((h) => (
                <span key={h} className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-canvas/60 px-2.5 py-1 text-xs font-medium text-secondary">
                  <CheckCircle2 size={12} className="text-success shrink-0" /> {h}
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5">
            <HeroStat label="Раунд" value={formatMoney(project.raiseAmount, project.currency)} />
            <HeroStat label="Мин. чек" value={formatMoney(project.minCheck, project.currency)} />
            <HeroStat label="Доля инвестору" value={project.equityOffered != null ? `${project.equityOffered}%` : '—'} />
            <HeroStat label="Сектор" value={view.sector} small />
          </div>

          <div className="rounded-lg border border-zapusk/25 bg-zapusk/8 p-3 mt-4 flex items-start gap-2">
            <Sparkles size={15} className="text-zapusk-400 mt-0.5 shrink-0" />
            <div className="text-xs text-primary leading-relaxed">
              <span className="font-semibold">Потенциал:</span> {view.upside}
              {view.payback && <> · <span className="font-semibold">Окупаемость:</span> {view.payback}</>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <Button variant="ai" iconRight={<ChevronRight size={15} />} onClick={() => openForm('invest')}>
              Оставить заявку
            </Button>
            <Button variant="secondary" iconLeft={<Lock size={14} />} onClick={() => openForm('materials')}>
              Получить полный data room
            </Button>
            <Button variant="ghost" iconLeft={<MessageCircle size={14} />} onClick={() => openForm('discuss')}>
              Обсудить с менеджером
            </Button>
          </div>
        </div>
      </div>

      {/* ── Investment thesis ── */}
      <Card padded className="mb-4">
        <CardHeader title="Инвестиционный тезис" subtitle="Почему это интересно и как зарабатывает инвестор" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ThesisBlock title="Почему интересно" body={view.thesis.whyInteresting} tone="zapusk" />
          <ThesisBlock title="Как зарабатывает инвестор" body={view.thesis.howEarn} tone="ai" />
          <ThesisBlock title="Почему сейчас" body={view.thesis.whyNow} tone="zapusk" />
          <ThesisBlock title="Основные риски" body={view.thesis.risks} tone="warning" />
        </div>
      </Card>

      {/* ── Key metrics ── */}
      <Card padded className="mb-4">
        <CardHeader title="Ключевые метрики" subtitle="Цифры сделки и проекта" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {view.metrics.map((m) => (
            <div key={m.label} className="rounded-md border border-hairline bg-canvas/45 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold">{m.label}</div>
              <div className="text-sm font-semibold text-primary mt-1 leading-snug">{m.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Public / teaser materials ── */}
      <Card padded className="mb-4">
        <CardHeader
          title="Открытые материалы"
          subtitle="Можно изучить прямо сейчас — без заявки"
          action={<StatusBadge tone="success" dot>{view.publicMaterials.length}</StatusBadge>}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {view.publicMaterials.map((m) => (
            <DocumentCard key={m.title} doc={m} previewByType={previewByType} onLockedClick={() => openForm('materials')} />
          ))}
        </div>
      </Card>

      {/* ── Full data room ── */}
      <Card padded accent="ai" className="mb-4">
        <div className="flex items-start gap-2 mb-3">
          <div className="w-9 h-9 rounded-lg bg-zapusk/10 border border-zapusk/25 text-zapusk-400 flex items-center justify-center shrink-0">
            <ShieldCheck size={15} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-primary">Полный Data Room</h3>
            <p className="text-xs text-secondary mt-0.5 leading-snug">
              Полный пакет для due diligence. Часть документов открыта, остальные — после короткой
              квалификации у менеджера.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-4">
          {view.dataRoom.map((d) => (
            <DocumentCard key={d.title} doc={d} previewByType={previewByType} onLockedClick={() => openForm('materials')} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ai" iconRight={<ChevronRight size={15} />} onClick={() => openForm('materials')}>
            Запросить доступ к data room
          </Button>
          <Button variant="secondary" onClick={() => openForm('invest')}>
            Оставить заявку на инвестицию
          </Button>
        </div>
      </Card>

      {/* ── How the deal works ── */}
      <Card padded className="mb-4">
        <CardHeader title="Как проходит сделка" subtitle="Четыре шага от заявки до сделки через платформу" />
        <ol className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {view.dealSteps.map((s, i) => (
            <li key={s.title} className="rounded-md border border-hairline bg-canvas/45 p-3 flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-grad-zapusk text-canvas text-sm font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </div>
              <div>
                <div className="text-sm font-semibold text-primary">{s.title}</div>
                <p className="text-xs text-secondary mt-0.5 leading-snug">{s.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {/* ── Legal ── */}
      <Card padded className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={16} className="text-success" />
          <h3 className="text-sm font-semibold text-primary">Правовая информация</h3>
        </div>
        <ul className="space-y-1.5">
          {view.legal.map((l) => (
            <li key={l} className="flex items-start gap-2 text-xs text-muted leading-snug">
              {l.includes('не гарантирован') || l.includes('риск')
                ? <AlertTriangle size={12} className="text-warning mt-0.5 shrink-0" />
                : <CheckCircle2 size={12} className="text-success mt-0.5 shrink-0" />}
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </Card>

      <InvestorApplicationForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        projectId={project.id}
        projectName={project.name}
        defaultInterest={formInterest}
      />
    </AppLayout>
  );
}

function BackLink() {
  return (
    <Link to="/opportunities" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary mb-3">
      <ArrowLeft size={14} /> Все инвест-возможности
    </Link>
  );
}

function HeroStat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-md border border-hairline bg-canvas/55 px-3 py-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-muted font-semibold">
        <Wallet size={11} /> {label}
      </div>
      <div className={`font-semibold text-primary mt-1 leading-snug ${small ? 'text-xs' : 'text-base'}`}>{value}</div>
    </div>
  );
}

function ThesisBlock({ title, body, tone }: { title: string; body: string; tone: 'zapusk' | 'ai' | 'warning' }) {
  const accent = tone === 'warning' ? 'border-warning/30' : tone === 'ai' ? 'border-ai/25' : 'border-zapusk/25';
  return (
    <div className={`rounded-md border ${accent} bg-canvas/45 p-3`}>
      <div className="text-xs font-semibold text-primary mb-1">{title}</div>
      <p className="text-xs text-secondary leading-relaxed">{body}</p>
    </div>
  );
}

// Rich file-preview card: тип, размер, описание, кнопка открытия (реальная
// ссылка или previewUrl из PackagingJob). Locked → CTA «после заявки».
function DocumentCard({
  doc, previewByType, onLockedClick,
}: {
  doc: OpportunityDocument;
  previewByType: Record<string, string>;
  onLockedClick: () => void;
}) {
  const url = doc.url ?? (doc.outputType ? previewByType[doc.outputType] : undefined);
  const open = !doc.locked && !!url;

  return (
    <div className="group rounded-lg border border-hairline bg-canvas/45 p-3 flex items-start gap-3 transition-colors hover:border-line hover:bg-canvas/70">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
        doc.locked ? 'bg-elevated border-line text-muted' : 'bg-ai/10 border-ai/25 text-ai-glow'
      }`}>
        {doc.locked ? <Lock size={16} /> : <FileText size={16} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-primary leading-snug">{doc.title}</span>
          <StatusBadge tone={doc.locked ? 'neutral' : 'success'} dot={!doc.locked}>
            {doc.locked ? 'после заявки' : 'доступно'}
          </StatusBadge>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted font-medium">
          <span>{doc.type}</span>
          {doc.size && <><span className="opacity-50">·</span><span>{doc.size}</span></>}
        </div>
        <p className="text-xs text-secondary mt-1 leading-snug">{doc.description}</p>
      </div>
      <div className="shrink-0">
        {open ? (
          <a href={url} target="_blank" rel="noreferrer">
            <Button size="sm" variant="secondary" iconRight={<ExternalLink size={12} />}>Открыть</Button>
          </a>
        ) : (
          <Button size="sm" variant="ghost" iconLeft={<Lock size={12} />} onClick={onLockedClick}>Открыть</Button>
        )}
      </div>
    </div>
  );
}
