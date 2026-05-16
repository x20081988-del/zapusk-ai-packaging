import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles, AlertTriangle, CheckCircle2, HelpCircle, Activity } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { Select, Textarea } from '../components/ui/Input';
import { api, type Project } from '../lib/api';
import { parseList, parseObj } from '../lib/format';
import { MissingDataPanel } from '../components/ui/MissingDataPanel';
import { VoiceInputButton } from '../components/ui/VoiceInputButton';

const FOCUS_OPTIONS = [
  { value: 'narrative', label: 'История проекта' },
  { value: 'finance', label: 'Финансы' },
  { value: 'risks', label: 'Риски' },
  { value: 'investor_offer', label: 'Предложение инвестору' },
  { value: 'missing_data', label: 'Недостающие данные' },
];

export default function ProjectBrief() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [focus, setFocus] = useState(FOCUS_OPTIONS[0].value);
  const [improving, setImproving] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);

  async function load() {
    if (!id || id === 'undefined' || id === 'null') {
      setProject(null);
      setLoadState('missing');
      return;
    }
    setLoadState('loading');
    try {
      const r = await api.get<{ project: Project }>(`/api/projects/${id}`);
      setProject(r.project);
      setLoadState('ready');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setProject(null);
      setLoadState(msg.includes('404') || msg.includes('403') ? 'missing' : 'error');
    }
  }

  useEffect(() => { load(); }, [id]);

  async function regenerate() {
    if (!id) return;
    setGenerating(true);
    try {
      await api.post(`/api/brief/${id}/generate`);
      await load();
    } finally {
      setGenerating(false);
    }
  }

  async function improveBrief() {
    if (!id || !feedback.trim()) return;
    setImproving(true);
    setFeedbackStatus(null);
    try {
      const result = await api.post<{ brief: Project['brief'] }>(`/api/brief/${id}/regenerate-with-feedback`, {
        feedback: feedback.trim(),
        focus,
      });
      if (result.brief) {
        setProject((current) => (current ? { ...current, brief: result.brief } : current));
        setFeedbackStatus(`Бриф обновлён до v${result.brief.version}.`);
      }
      setFeedback('');
      await load();
    } finally {
      setImproving(false);
    }
  }

  if (!project && loadState === 'loading') {
    return <AppLayout title="Бриф"><Card><div className="text-sm text-muted text-center py-8">Загрузка…</div></Card></AppLayout>;
  }

  if (!project) {
    const isMissing = loadState === 'missing';
    return (
      <AppLayout title="Бриф проекта">
        <Card padded>
          <EmptyState
            icon={<Sparkles size={20} />}
            title={isMissing ? 'Пока нет проектов' : 'Не удалось открыть бриф'}
            description={
              isMissing
                ? 'Создайте первый проект — это займет меньше минуты.'
                : 'Бриф временно недоступен. Обновите страницу или создайте новый проект.'
            }
            action={(
              <Link to="/projects/new">
                <Button iconLeft={<Sparkles size={14} />}>Создать проект</Button>
              </Link>
            )}
          />
        </Card>
      </AppLayout>
    );
  }

  const brief = project.brief;
  const napkin = parseObj<Record<string, unknown>>(brief?.napkin, {});
  const strengths = parseList(brief?.strengths);
  const weaknesses = parseList(brief?.weaknesses);
  const missing = parseList(brief?.missingData);
  const metrics = parseObj<Record<string, string>>(brief?.keyMetrics, {});

  return (
    <AppLayout
      title={`${project.name} · Бриф`}
      action={
        <div className="flex items-center gap-2">
          <Link to={`/projects/${id}`}>
            <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={14} />}>К проекту</Button>
          </Link>
          <Button
            variant="ai"
            size="sm"
            iconLeft={<Sparkles size={14} />}
            loading={generating}
            onClick={regenerate}
          >
            {brief ? `v${brief.version + 1}` : 'Сгенерировать'}
          </Button>
        </div>
      }
    >
      {!brief ? (
        <Card padded>
          <EmptyState
            icon={<Sparkles size={20} />}
            title="Бриф ещё не сгенерирован"
            description="После генерации здесь появятся: бизнес-резюме, монетизация, ключевые метрики, инвест-запрос, сильные стороны, слабые места, недостающие данные и «бизнес на салфетке»."
            action={<Button variant="ai" loading={generating} onClick={regenerate} iconLeft={<Sparkles size={14} />}>Сформировать бриф</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Version badge */}
          <div className="flex items-center gap-2">
            <StatusBadge tone="ai" dot>v{brief.version}</StatusBadge>
            <span className="text-xs text-muted">обновлён {new Date(brief.updatedAt).toLocaleString('ru-RU')}</span>
          </div>

          <Card padded accent="ai">
            <CardHeader
              title="Доработать бриф по замечаниям"
              subtitle="Обновит бриф проекта и «бизнес на салфетке». Следующая генерация материалов возьмёт уже эту версию."
            />
            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
              <Select
                label="Фокус"
                options={FOCUS_OPTIONS}
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
              />
              <div>
                <Textarea
                  label="Что улучшить в брифе?"
                  rows={4}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Например: в предложении инвестору слишком мало про доход, добавь сценарий окупаемости и уточни риски сезонности."
                />
                <VoiceInputButton
                  className="mt-2"
                  onTranscript={(text) => setFeedback((current) => current.trim() ? `${current.trim()} ${text}` : text)}
                />
              </div>
            </div>
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-muted">
                Ответы интервью сохраняются, а список недостающих данных не сбрасывается.
              </p>
              <Button
                variant="ai"
                iconLeft={<Sparkles size={14} />}
                loading={improving}
                disabled={!feedback.trim()}
                onClick={improveBrief}
              >
                Доработать бриф
              </Button>
            </div>
            {feedbackStatus && <p className="mt-3 text-xs text-success">{feedbackStatus}</p>}
          </Card>

          {/* Napkin — feature */}
          <Card padded accent="ai">
            <CardHeader title="Бизнес на салфетке" subtitle="Структурированное резюме для инвестора" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
              <Field label="Что за бизнес" value={napkin.whatIs as string} />
              <Field label="Как зарабатывает" value={napkin.howMakesMoney as string} />
              <Field label="Сколько нужно денег" value={napkin.howMuchNeeded as string} />
              <Field label="На что деньги" value={napkin.whatFor as string} />
              <Field label="Сколько заработает инвестор" value={napkin.investorReturn as string} />
              <Field label="Почему сейчас" value={napkin.whyNow as string} />
            </div>

            {Array.isArray(napkin.mainRisks) && (napkin.mainRisks as string[]).length > 0 && (
              <div className="mt-6 pt-5 border-t border-hairline">
                <div className="text-[11px] uppercase tracking-[0.1em] text-muted font-semibold mb-2">Главные риски</div>
                <ul className="space-y-1.5">
                  {(napkin.mainRisks as string[]).map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-secondary">
                      <AlertTriangle size={13} className="text-warning mt-0.5 shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* Summary + ask */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card padded>
              <CardHeader title="Бизнес-резюме" />
              <p className="text-sm text-secondary leading-relaxed">{brief.businessSummary ?? '—'}</p>
              <div className="mt-4 pt-4 border-t border-hairline">
                <div className="text-[11px] uppercase tracking-[0.1em] text-muted font-semibold mb-1.5">Монетизация</div>
                <p className="text-sm text-secondary leading-relaxed">{brief.monetization ?? '—'}</p>
              </div>
            </Card>
            <Card padded accent="zapusk">
              <CardHeader title="Инвестиционный запрос" subtitle="Условия для сделки" />
              <p className="text-sm text-primary leading-relaxed">{brief.investmentAsk ?? '—'}</p>

              {Object.keys(metrics).length > 0 && (
                <div className="mt-4 pt-4 border-t border-hairline">
                  <div className="text-[11px] uppercase tracking-[0.1em] text-muted font-semibold mb-2">Ключевые метрики</div>
                  <dl className="space-y-1.5">
                    {Object.entries(metrics).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <dt className="text-muted uppercase tracking-wide">{k}</dt>
                        <dd className="text-primary font-num text-right">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </Card>
          </div>

          {/* Strengths / weaknesses */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card padded>
              <CardHeader title="Сильные стороны" />
              <ul className="space-y-2">
                {strengths.length ? strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-secondary">
                    <CheckCircle2 size={14} className="text-success mt-0.5 shrink-0" />
                    {s}
                  </li>
                )) : <li className="text-sm text-muted">—</li>}
              </ul>
            </Card>
            <Card padded>
              <CardHeader title="Слабые места" />
              <ul className="space-y-2">
                {weaknesses.length ? weaknesses.map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-secondary">
                    <Activity size={14} className="text-warning mt-0.5 shrink-0" />
                    {s}
                  </li>
                )) : <li className="text-sm text-muted">—</li>}
              </ul>
            </Card>
          </div>

          {/* Missing data — categorized by 6 packaging blocks */}
        <MissingDataPanel
          rawJson={brief.missingByCategory}
          interviewHref={`/projects/${id}/interview`}
        />
          {brief.missingByCategory == null && missing.length > 0 && (
            <Card padded accent="ai">
              <CardHeader title="Список уточнений" subtitle="Категоризация появится при следующем обновлении брифа" />
              <ul className="space-y-2">
                {missing.map((q, i) => (
                  <li key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-md bg-canvas/50 border border-hairline">
                    <HelpCircle size={14} className="text-ai-glow mt-0.5 shrink-0" />
                    <span className="text-sm text-secondary">{q}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </AppLayout>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1">{label}</div>
      <div className="text-sm text-primary leading-relaxed">{value || <span className="text-faint">—</span>}</div>
    </div>
  );
}
