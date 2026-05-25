import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Sparkles, TrendingUp, TrendingDown, RefreshCw, AlertTriangle, Download,
  Activity, BookOpen, Target, Gauge,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { api, downloadBlob, type Project } from '../lib/api';

// Sprint 44 — Learning Dashboard.
//
// Цель страницы: одно место, где admin/manager видят как материалы базы знаний
// влияют на сделки. Без ML, без авто-ранкинга — только прозрачная аналитика
// на основе AssistantAdviceEvent + AssistantOutcomeEvent (Sprint 43) и
// KnowledgeRetrievalEvent (Sprint 42).
//
// Доступ: SUPER_ADMIN / ADMIN / MANAGER. FOUNDER / INVESTOR — нет (см.
// App.tsx RequireRole + backend route requireRole).

type OutcomeType =
  | 'follow_up_sent' | 'next_meeting_booked' | 'investor_requested_docs'
  | 'investor_interested' | 'investment_received'
  | 'lost' | 'ghosted' | 'no_decision' | 'bad_fit';

const OUTCOME_LABELS: Record<OutcomeType, string> = {
  follow_up_sent: 'Повторное касание',
  next_meeting_booked: 'Встреча',
  investor_requested_docs: 'Запросил доки',
  investor_interested: 'Интерес',
  investment_received: 'Инвестиция',
  lost: 'Потерян',
  ghosted: 'Не отвечает',
  no_decision: 'Без решения',
  bad_fit: 'Не подходит',
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  successful_sale: 'Успешная продажа',
  failed_sale: 'Неуспешная',
  objection: 'Возражение',
  qualification: 'Квалификация',
  follow_up: 'Повторное касание',
  legal_question: 'Юр. вопрос',
  financial_question: 'Финансовый вопрос',
  project_presentation: 'Презентация',
  deal_case: 'Кейс сделки',
  manager_script: 'Скрипт менеджера',
  messenger_thread: 'Переписка',
  meeting_recording: 'Запись встречи',
  other: 'Другое',
};

interface SourceMetric {
  sourceId: string;
  title: string;
  sourceType: string;
  scope: string;
  retrievalCount: number;
  outcomes: Partial<Record<OutcomeType, number>>;
  outcomesTotal: number;
  positive: number;
  negative: number;
  successRate: number;
  lossRate: number;
  classification: 'high_performing' | 'risky' | 'dead' | 'normal';
}

interface SpinFunnelStage {
  stage: 'S' | 'P' | 'I' | 'N' | 'unknown';
  adviceCount: number;
  outcomesByType: Partial<Record<OutcomeType, number>>;
  positiveRate: number;
}

interface MaterialTypeRow {
  sourceType: string;
  sourceCount: number;
  outcomes: Partial<Record<OutcomeType, number>>;
  outcomesTotal: number;
  positiveRate: number;
}

interface DashboardPayload {
  topPerforming: SourceMetric[];
  weak: SourceMetric[];
  materialTypes: MaterialTypeRow[];
  spinFunnel: SpinFunnelStage[];
  outcomes: { byType: Partial<Record<OutcomeType, number>>; total: number };
  outcomes30d: { byType: Partial<Record<OutcomeType, number>>; total: number };
  retrievalHealth: {
    totalRetrievals: number;
    emptyRetrievals: number;
    emptyRate: number;
    avgSourcesPerAdvice: number;
    avgOutcomesPerAdvice: number;
  };
}

type PeriodFilter = '7' | '30' | '90' | 'all';

interface LearningFilters {
  period: PeriodFilter;
  projectId: string;
  outcomeType: '' | OutcomeType;
  actorId: string;
}

interface LearningActor {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

const SPIN_LABELS: Record<SpinFunnelStage['stage'], string> = {
  S: 'С — Ситуация',
  P: 'П — Проблема',
  I: 'У — Усиление',
  N: 'Р — Решение',
  unknown: 'Не определён',
};

export default function AdminLearning() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [actors, setActors] = useState<LearningActor[]>([]);
  const [filters, setFilters] = useState<LearningFilters>({ period: '30', projectId: '', outcomeType: '', actorId: '' });
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function queryString() {
    const params = new URLSearchParams();
    params.set('period', filters.period);
    if (filters.projectId) params.set('projectId', filters.projectId);
    if (filters.outcomeType) params.set('outcomeType', filters.outcomeType);
    if (filters.actorId) params.set('actorId', filters.actorId);
    return params.toString();
  }

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.get<DashboardPayload>(`/api/assistant-learning/dashboard?${queryString()}`);
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load_failed');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    api.get<{ projects: Project[] }>('/api/projects')
      .then((r) => setProjects(r.projects))
      .catch(() => setProjects([]));
    api.get<{ users: LearningActor[] }>('/api/assistant-learning/actors')
      .then((r) => setActors(r.users))
      .catch(() => setActors([]));
  }, []);
  useEffect(() => { load(); }, [filters.period, filters.projectId, filters.outcomeType, filters.actorId]);

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      await downloadBlob(`/api/assistant-learning/export.csv?${queryString()}`, 'assistant-learning.csv');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'export_failed');
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppLayout
      title="Панель обучения AI"
      action={
        <div className="flex items-center gap-2">
          <Link to="/admin">
            <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={14} />}>Админ-панель</Button>
          </Link>
          <Button variant="ghost" size="sm" iconLeft={<RefreshCw size={14} />} loading={busy} onClick={load}>
            Обновить
          </Button>
          <Button variant="secondary" size="sm" iconLeft={<Download size={14} />} loading={exporting} onClick={exportCsv}>
            Экспорт CSV
          </Button>
        </div>
      }
    >
      <Card padded className="mb-6">
        <CardHeader
          title="Как AI-ассистент влияет на сделки"
          subtitle="Связь KB-источников и реальных результатов встреч. Только observability — никакого auto-ranking'а или ML."
        />
        <div className="text-xs text-secondary leading-snug max-w-3xl">
          Метрики собираются из цепочки: <code>KnowledgeSource</code> → <code>KnowledgeRetrievalEvent</code> →{' '}
          <code>AssistantAdviceEvent</code> → <code>AssistantOutcomeEvent</code>. Outcome'ы фиксирует команда
          вручную в Sales Assistant. Чем больше outcomes тем точнее цифры — пока KB маленькая, статистика будет шумной.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-5">
          <Select
            label="Период"
            value={filters.period}
            onChange={(e) => setFilters((f) => ({ ...f, period: e.target.value as PeriodFilter }))}
            options={[
              { value: '7', label: '7 дней' },
              { value: '30', label: '30 дней' },
              { value: '90', label: '90 дней' },
              { value: 'all', label: 'Всё время' },
            ]}
          />
          <Select
            label="Проект"
            value={filters.projectId}
            onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}
            options={[{ value: '', label: 'Все проекты' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
          />
          <Select
            label="Результат"
            value={filters.outcomeType}
            onChange={(e) => setFilters((f) => ({ ...f, outcomeType: e.target.value as LearningFilters['outcomeType'] }))}
            options={[
              { value: '', label: 'Все результаты' },
              ...Object.entries(OUTCOME_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />
          <Select
            label="Пользователь / менеджер"
            value={filters.actorId}
            onChange={(e) => setFilters((f) => ({ ...f, actorId: e.target.value }))}
            options={[
              { value: '', label: 'Все пользователи' },
              ...actors.map((u) => ({
                value: u.id,
                label: `${u.name || u.email} · ${u.role}`,
              })),
            ]}
          />
        </div>
      </Card>

      {error && (
        <Card padded className="mb-6">
          <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 flex items-start gap-2 text-xs text-warning">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {error}
          </div>
        </Card>
      )}

      {!data && !error && <Card padded><div className="text-sm text-muted py-8 text-center">Загрузка…</div></Card>}

      {data && (
        <div className="space-y-6">
          {/* Retrieval health row */}
          <Card padded>
            <CardHeader title="Здоровье retrieval" subtitle="За последние 30 дней" />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <HealthTile label="retrievals" value={data.retrievalHealth.totalRetrievals} />
              <HealthTile
                label="empty retrievals"
                value={data.retrievalHealth.emptyRetrievals}
                hint={`${Math.round(data.retrievalHealth.emptyRate * 100)}%`}
                tone={data.retrievalHealth.emptyRate > 0.3 ? 'warning' : 'neutral'}
              />
              <HealthTile label="ср. sources / совет" value={data.retrievalHealth.avgSourcesPerAdvice} />
              <HealthTile label="ср. outcomes / совет" value={data.retrievalHealth.avgOutcomesPerAdvice} />
              <HealthTile
                label="outcomes всего"
                value={data.outcomes.total}
                hint={`${data.outcomes30d.total} за 30 дн.`}
              />
            </div>
          </Card>

          {/* Outcome distribution */}
          <Card padded>
            <CardHeader
              title="Распределение outcome'ов"
              subtitle="Все зафиксированные результаты AI-подсказок"
              action={<StatusBadge tone="info" dot>{data.outcomes.total}</StatusBadge>}
            />
            {data.outcomes.total === 0 ? (
              <EmptyState
                title="Outcomes ещё не фиксировались"
                description="Менеджеры могут зафиксировать результат прямо в AI-ассистенте после встречи (кнопки «Зафиксировать результат»)."
              />
            ) : (
              <OutcomeBars data={data.outcomes.byType} total={data.outcomes.total} />
            )}
          </Card>

          {/* Top + Weak side-by-side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SourcesTable
              title="Топ-источники по успехам"
              subtitle="Подсказки на этих кейсах чаще ведут к meeting / interest / investment"
              icon={<TrendingUp size={14} className="text-success" />}
              sources={data.topPerforming}
              accent="success"
              emptyMessage="Пока нет outcomes — KB не успела показать себя."
            />
            <SourcesTable
              title="Источники-риски"
              subtitle="Подсказки на этих кейсах чаще ведут к lost / ghosted / no_decision"
              icon={<TrendingDown size={14} className="text-danger" />}
              sources={data.weak}
              accent="danger"
              emptyMessage="Хороший знак — пока нет повторяющихся неудач."
            />
          </div>

          {/* Material type performance */}
          <Card padded>
            <CardHeader
              title="Эффективность по типу материала"
              subtitle="Какие типы knowledge-материалов сильнее коррелируют с позитивным outcome'ом"
            />
            {data.materialTypes.length === 0 ? (
              <EmptyState title="Ещё нет данных" description="Появится после первых outcome'ов." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-hairline text-[10px] uppercase tracking-[0.08em] text-muted">
                      <th className="text-left py-2 px-2">Тип</th>
                      <th className="text-right py-2 px-2">Sources</th>
                      <th className="text-right py-2 px-2">Outcomes</th>
                      <th className="text-right py-2 px-2">Позитивный %</th>
                      <th className="text-left py-2 px-2">Распределение</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.materialTypes.map((m) => (
                      <tr key={m.sourceType} className="border-b border-hairline/50">
                        <td className="py-2 px-2">{SOURCE_TYPE_LABELS[m.sourceType] ?? m.sourceType}</td>
                        <td className="py-2 px-2 text-right font-num text-secondary">{m.sourceCount}</td>
                        <td className="py-2 px-2 text-right font-num text-secondary">{m.outcomesTotal}</td>
                        <td className={`py-2 px-2 text-right font-num font-semibold ${m.positiveRate >= 0.5 ? 'text-success' : m.positiveRate >= 0.25 ? 'text-zapusk-400' : 'text-warning'}`}>
                          {Math.round(m.positiveRate * 100)}%
                        </td>
                        <td className="py-2 px-2">
                          <MiniOutcomeBars data={m.outcomes} total={m.outcomesTotal} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* SPIN funnel */}
          <Card padded>
            <CardHeader
              title="Воронка по этапам СПИН"
              subtitle="На каком этапе чаще AI помогает и какой % переводит во позитивный outcome"
            />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {data.spinFunnel.map((s) => (
                <div key={s.stage} className="rounded-md border border-hairline bg-canvas/40 px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold">{SPIN_LABELS[s.stage]}</div>
                  <div className="text-xl font-num font-semibold text-primary mt-1">{s.adviceCount}</div>
                  <div className="text-[10px] text-muted">советов</div>
                  <div className={`text-xs font-semibold mt-1.5 ${s.positiveRate >= 0.5 ? 'text-success' : s.positiveRate >= 0.25 ? 'text-zapusk-400' : 'text-warning'}`}>
                    позитив: {Math.round(s.positiveRate * 100)}%
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </AppLayout>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function HealthTile({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: 'warning' | 'neutral' }) {
  const toneCls = tone === 'warning' ? 'border-warning/30 bg-warning/8' : 'border-hairline bg-canvas/40';
  return (
    <div className={`rounded-md border px-3 py-2 ${toneCls}`}>
      <div className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold">{label}</div>
      <div className="text-xl font-num font-semibold text-primary">{value}</div>
      {hint && <div className="text-[10px] text-muted">{hint}</div>}
    </div>
  );
}

function OutcomeBars({ data, total }: { data: Partial<Record<OutcomeType, number>>; total: number }) {
  if (total === 0) return null;
  const positiveOrder: OutcomeType[] = ['investment_received', 'next_meeting_booked', 'investor_interested', 'investor_requested_docs', 'follow_up_sent'];
  const negativeOrder: OutcomeType[] = ['no_decision', 'ghosted', 'lost', 'bad_fit'];
  const rows = [...positiveOrder, ...negativeOrder]
    .map((type) => ({ type, count: data[type] ?? 0 }))
    .filter((r) => r.count > 0);
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const pct = (r.count / total) * 100;
        const isPositive = positiveOrder.includes(r.type);
        return (
          <li key={r.type} className="flex items-center gap-2">
            <span className="text-[11px] text-secondary w-32 shrink-0">{OUTCOME_LABELS[r.type]}</span>
            <div className="flex-1 h-3 rounded bg-surface overflow-hidden">
              <div
                className={`h-full ${isPositive ? 'bg-success/40' : 'bg-warning/40'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[11px] font-num text-primary w-16 text-right">{r.count} · {Math.round(pct)}%</span>
          </li>
        );
      })}
    </ul>
  );
}

function MiniOutcomeBars({ data, total }: { data: Partial<Record<OutcomeType, number>>; total: number }) {
  if (total === 0) return <span className="text-[10px] text-muted">—</span>;
  const cells: Array<{ tone: string; count: number; label: string }> = [];
  for (const t of ['investment_received', 'next_meeting_booked', 'investor_interested', 'investor_requested_docs', 'follow_up_sent'] as OutcomeType[]) {
    const n = data[t] ?? 0;
    if (n > 0) cells.push({ tone: 'bg-success/40', count: n, label: OUTCOME_LABELS[t] });
  }
  for (const t of ['no_decision', 'ghosted', 'lost', 'bad_fit'] as OutcomeType[]) {
    const n = data[t] ?? 0;
    if (n > 0) cells.push({ tone: 'bg-warning/40', count: n, label: OUTCOME_LABELS[t] });
  }
  return (
    <div className="flex items-center gap-0.5 h-3 w-full max-w-xs rounded overflow-hidden bg-surface">
      {cells.map((c, i) => (
        <div
          key={i}
          className={c.tone}
          title={`${c.label}: ${c.count}`}
          style={{ width: `${(c.count / total) * 100}%`, height: '100%' }}
        />
      ))}
    </div>
  );
}

function SourcesTable({
  title, subtitle, icon, sources, accent, emptyMessage,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  sources: SourceMetric[];
  accent: 'success' | 'danger';
  emptyMessage: string;
}) {
  return (
    <Card padded accent={accent === 'success' ? 'zapusk' : 'ai'}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={<StatusBadge tone={accent === 'success' ? 'success' : 'warning'} dot>{sources.length}</StatusBadge>}
      />
      {sources.length === 0 ? (
        <EmptyState title="Пока пусто" description={emptyMessage} />
      ) : (
        <ul className="space-y-2">
          {sources.map((s) => (
            <li key={s.sourceId} className="rounded-md border border-hairline bg-canvas/40 px-3 py-2">
              <div className="flex items-start gap-2 mb-1">
                <div className="text-[12px] text-primary font-medium flex-1 leading-snug">{s.title}</div>
                <ClassificationBadge classification={s.classification} />
              </div>
              <div className="text-[10px] text-muted flex flex-wrap gap-x-3 gap-y-0.5 mb-1.5">
                <span>{SOURCE_TYPE_LABELS[s.sourceType] ?? s.sourceType}</span>
                <span>· {s.scope === 'global' ? 'global' : 'project'}</span>
                <span>· retrievals: {s.retrievalCount}</span>
                <span>· outcomes: {s.outcomesTotal}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-num font-semibold ${accent === 'success' ? 'text-success' : 'text-warning'}`}>
                  {accent === 'success' ? `${Math.round(s.successRate * 100)}% позитив` : `${Math.round(s.lossRate * 100)}% потерь`}
                </span>
                <div className="flex-1">
                  <MiniOutcomeBars data={s.outcomes} total={s.outcomesTotal} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ClassificationBadge({ classification }: { classification: SourceMetric['classification'] }) {
  if (classification === 'high_performing') return <StatusBadge tone="success" dot>top</StatusBadge>;
  if (classification === 'risky') return <StatusBadge tone="warning" dot>risky</StatusBadge>;
  if (classification === 'dead') return <StatusBadge tone="neutral" dot>dead</StatusBadge>;
  return null;
}

// Used to silence unused-import lint when icons aren't all referenced. Real
// dashboard could use these for additional sections in Sprint 45.
void Sparkles; void Activity; void BookOpen; void Target; void Gauge;
