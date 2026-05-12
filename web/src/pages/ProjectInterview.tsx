import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles, Save, Wand2, CheckCircle2 } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { AIQuestionCard } from '../components/ui/AIQuestionCard';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/ui/StatusBadge';
import { api, type Project } from '../lib/api';
import { parseList, parseObj } from '../lib/format';

interface Question { text: string; category?: string }
interface StoredAnswer { question: string; answer: string; category?: string; savedAt?: string }

const CATEGORY_LABELS: Record<string, string> = {
  financial: 'Финансы',
  market: 'Рынок',
  team: 'Команда',
  deal: 'Условия сделки',
  unit_econ: 'Юнит-экономика',
  risks: 'Риски',
};

// Build a stable question list. Prefer the categorized shape (Sprint 3) and
// fall back to the flat array for older briefs. Questions are keyed by their
// text so answers survive minor wording tweaks across brief regenerations.
function collectQuestions(brief: Project['brief']): Question[] {
  if (!brief) return [];
  const byCat = parseObj<Record<string, string[]>>(brief.missingByCategory, {});
  const out: Question[] = [];
  const seen = new Set<string>();
  for (const [cat, items] of Object.entries(byCat)) {
    if (!Array.isArray(items)) continue;
    for (const q of items) {
      if (!q || seen.has(q)) continue;
      seen.add(q);
      out.push({ text: q, category: cat });
    }
  }
  const hasCategorizedQuestions = out.length > 0;
  if (!hasCategorizedQuestions) {
    for (const q of parseList(brief.missingData)) {
      if (!seen.has(q)) {
        seen.add(q);
        out.push({ text: q });
      }
    }
  }
  for (const a of parseObj<StoredAnswer[]>(brief.interviewAnswers ?? null, [])) {
    if (!a.question || seen.has(a.question)) continue;
    seen.add(a.question);
    out.push({ text: a.question, category: a.category });
  }
  return out;
}

function latestSavedAt(stored: StoredAnswer[]): Date | null {
  const latest = stored
    .map((a) => (a.savedAt ? new Date(a.savedAt).getTime() : 0))
    .filter((time) => Number.isFinite(time) && time > 0)
    .sort((a, b) => b - a)[0];
  return latest ? new Date(latest) : null;
}

export default function ProjectInterview() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  async function load() {
    if (!id) return;
    const r = await api.get<{ project: Project }>(`/api/projects/${id}`);
    setProject(r.project);
    const stored = parseObj<StoredAnswer[]>(r.project.brief?.interviewAnswers ?? null, []);
    const map: Record<string, string> = {};
    for (const a of stored) map[a.question] = a.answer;
    setAnswers(map);
    setSavedAt(latestSavedAt(stored));
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const questions = useMemo(() => collectQuestions(project?.brief ?? null), [project]);
  const answeredCount = useMemo(
    () => questions.filter((q) => (answers[q.text] ?? '').trim().length > 0).length,
    [questions, answers],
  );

  async function save(opts: { thenRegenerate?: boolean } = {}) {
    if (!id) return;
    setSaving(true);
    try {
      const payload = questions
        .map((q) => ({ question: q.text, answer: answers[q.text] ?? '', category: q.category }))
        .filter((a) => a.answer.trim().length > 0);
      const result = await api.patch<{ brief: Project['brief'] }>(`/api/brief/${id}/interview`, { answers: payload });
      if (result.brief) setProject((current) => (current ? { ...current, brief: result.brief } : current));
      setSavedAt(new Date());
      if (opts.thenRegenerate) {
        setRegenerating(true);
        await api.post(`/api/brief/${id}/generate`);
        await load();
      }
    } finally {
      setSaving(false);
      setRegenerating(false);
    }
  }

  return (
    <AppLayout
      title={project ? `${project.name} · Интервью по проекту` : 'Интервью по проекту'}
      action={
        <Link to={`/projects/${id}`}>
          <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={14} />}>К проекту</Button>
        </Link>
      }
    >
      <div className="max-w-readable mx-auto">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-ai-glow font-semibold mb-2">
              <Sparkles size={12} /> Интервью по проекту
            </div>
            <h1 className="text-2xl font-bold text-primary tracking-tight">Заполните недостающее</h1>
            <p className="text-sm text-secondary mt-1.5 max-w-readable">
              Система задаёт только то, чего не хватает для финансовой модели и инвестиционной презентации. Не длинная анкета — конкретные вопросы.
            </p>
          </div>
          {questions.length > 0 && (
            <div className="flex flex-col items-end gap-1.5">
              <StatusBadge tone={answeredCount === questions.length ? 'success' : 'ai'} dot>
                {answeredCount} / {questions.length} ответов
              </StatusBadge>
              {savedAt && (
                <span className="text-[10px] uppercase tracking-[0.08em] text-muted">
                  Сохранено {savedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          )}
        </div>

        {questions.length === 0 ? (
          <Card padded>
            <EmptyState
              title={project?.brief ? 'Базовые блоки покрыты' : 'Сначала сгенерируйте бриф'}
              description={project?.brief
                ? 'Существенных пробелов не найдено. Можно переходить к материалам проекта.'
                : 'Сформируйте бриф на странице проекта — после этого здесь появятся уточняющие вопросы.'}
              action={<Link to={`/projects/${id}`}><Button variant="secondary">К проекту</Button></Link>}
            />
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <AIQuestionCard
                  key={q.text}
                  index={i + 1}
                  question={q.text}
                  category={q.category ? CATEGORY_LABELS[q.category] ?? q.category : undefined}
                  value={answers[q.text] ?? ''}
                  onChange={(v) => setAnswers((a) => ({ ...a, [q.text]: v }))}
                />
              ))}
            </div>
            <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-5 py-4 rounded-lg bg-surface border border-line">
              <div className="text-xs text-secondary flex items-start gap-2">
                <CheckCircle2 size={13} className="text-success mt-0.5 shrink-0" />
                <span>
                  Ответы сохраняются в бриф. Полный комплект материалов будет использовать их в финансовой модели и материалах для встречи с инвестором.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="secondary" iconLeft={<Save size={14} />} loading={saving && !regenerating} onClick={() => save()}>
                  Сохранить
                </Button>
                <Button variant="ai" iconLeft={<Wand2 size={14} />} loading={regenerating} onClick={() => save({ thenRegenerate: true })} disabled={answeredCount === 0}>
                  Сохранить и обновить бриф
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
