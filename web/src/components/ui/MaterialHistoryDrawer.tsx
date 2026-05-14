import { useEffect, useState } from 'react';
import { Sparkles, UserRound, Clock, RotateCcw, ArrowLeftRight, History as HistoryIcon } from 'lucide-react';
import { Drawer } from './Drawer';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { EmptyState } from './EmptyState';
import { MaterialCompareModal } from './MaterialCompareModal';
import { api } from '../../lib/api';

// Sprint 33 — drawer истории версий любого материала (brief / prompt /
// document). Открывается по клику «История версий» на каждой material card.
// Внутри:
//   • timeline всех версий
//   • per-version source badge (AI / Human / Restore / Interview)
//   • кнопка Compare → MaterialCompareModal
//   • кнопка Restore → confirm + POST /restore/:id

export type MaterialKind = 'brief' | 'prompt' | 'document';

export interface MaterialVersionRow {
  id: string;
  version: number;
  /** для prompt/document — это body, для brief — JSON snapshot. */
  content: string;
  /** Source: ai_generate / ai_regenerate_feedback / interview / restore / manual_edit / null (для prompt/doc). */
  source: string | null;
  createdAt: string;
  isCurrent: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  kind: MaterialKind;
  projectId: string;
  /** для prompt/document — required, для brief игнорируется. */
  promptKind?: string;
  /** Заголовок drawer'а (например "История · Pitch deck"). */
  title: string;
  /** Callback после успешного restore — родитель перезагружает content. */
  onRestored?: () => void;
}

interface ApiVersion {
  id: string;
  version: number;
  source?: string | null;
  createdAt: string;
}

interface BriefVersionApi extends ApiVersion {
  businessSummary: string | null;
  monetization: string | null;
  keyMetrics: string | null;
  investmentAsk: string | null;
  strengths: string | null;
  weaknesses: string | null;
  missingData: string | null;
  missingByCategory: string | null;
  interviewAnswers: string | null;
  napkin: string | null;
}

interface PromptVersionApi extends ApiVersion {
  kind: string;
  body: string;
  feedback: string | null;
}

interface DocumentVersionApi extends ApiVersion {
  kind: string;
  title: string;
  body: string;
  format: string;
}

export function MaterialHistoryDrawer({ open, onClose, kind, projectId, promptKind, title, onRestored }: Props) {
  const [rows, setRows] = useState<MaterialVersionRow[] | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [compareWith, setCompareWith] = useState<MaterialVersionRow | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows(null);
    loadVersions().catch(() => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, projectId, promptKind]);

  async function loadVersions() {
    if (kind === 'brief') {
      const r = await api.get<{ current: BriefVersionApi; versions: BriefVersionApi[] }>(`/api/brief/${projectId}/versions`);
      const list: MaterialVersionRow[] = [];
      if (r.current) {
        list.push({
          id: r.current.id,
          version: r.current.version,
          content: stringifyBrief(r.current),
          source: 'current',
          createdAt: r.current.createdAt,
          isCurrent: true,
        });
      }
      for (const v of r.versions ?? []) {
        list.push({
          id: v.id,
          version: v.version,
          content: stringifyBrief(v),
          source: v.source ?? null,
          createdAt: v.createdAt,
          isCurrent: false,
        });
      }
      setRows(list);
    } else if (kind === 'prompt' && promptKind) {
      const r = await api.get<{ versions: PromptVersionApi[] }>(`/api/prompts/${projectId}/${promptKind}/versions`);
      const list: MaterialVersionRow[] = (r.versions ?? []).map((v, i) => ({
        id: v.id,
        version: v.version,
        content: v.body,
        source: v.feedback?.startsWith('[restored from v') ? 'restore' : 'ai_generate',
        createdAt: v.createdAt,
        isCurrent: i === 0,
      }));
      setRows(list);
    } else if (kind === 'document' && promptKind) {
      const r = await api.get<{ versions: DocumentVersionApi[] }>(`/api/prompts/${projectId}/documents/${promptKind}/versions`);
      const list: MaterialVersionRow[] = (r.versions ?? []).map((v, i) => ({
        id: v.id,
        version: v.version,
        content: v.body,
        source: v.title?.includes('restored from') ? 'restore' : 'ai_generate',
        createdAt: v.createdAt,
        isCurrent: i === 0,
      }));
      setRows(list);
    }
  }

  async function restore(row: MaterialVersionRow) {
    const current = rows?.find((r) => r.isCurrent);
    const msg = current
      ? `Восстановить версию v${row.version}? Текущая v${current.version} сохранится в истории и не потеряется.`
      : `Восстановить версию v${row.version}?`;
    if (!window.confirm(msg)) return;
    setRestoring(row.id);
    try {
      if (kind === 'brief') {
        await api.post(`/api/brief/${projectId}/restore/${row.id}`);
      } else if (kind === 'prompt' && promptKind) {
        await api.post(`/api/prompts/${projectId}/${promptKind}/restore/${row.id}`);
      } else if (kind === 'document' && promptKind) {
        await api.post(`/api/prompts/${projectId}/documents/${promptKind}/restore/${row.id}`);
      }
      await loadVersions();
      onRestored?.();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Не удалось восстановить версию');
    } finally {
      setRestoring(null);
    }
  }

  const current = rows?.find((r) => r.isCurrent);

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={title}
        subtitle="История версий · никакие данные не теряются, можно вернуть любую"
      >
        {rows === null ? (
          <div className="py-10 text-center text-sm text-muted">Загрузка истории…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<HistoryIcon size={20} />}
            title="История пока пуста"
            description="Когда AI или вы создадите следующую версию — она появится здесь, а текущая сохранится снапшотом."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li
                key={row.id}
                className={`rounded-lg border px-4 py-3 ${
                  row.isCurrent
                    ? 'border-success/30 bg-success/4'
                    : 'border-hairline bg-canvas/40'
                }`}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-primary font-num">v{row.version}</span>
                    <SourceBadge source={row.source} isCurrent={row.isCurrent} />
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-muted">
                    <Clock size={11} />
                    {formatRelative(row.createdAt)}
                  </div>
                </div>
                {!row.isCurrent && (
                  <div className="flex gap-2 flex-wrap">
                    {current && (
                      <Button
                        size="sm"
                        variant="ghost"
                        iconLeft={<ArrowLeftRight size={12} />}
                        onClick={() => setCompareWith(row)}
                      >
                        Сравнить с текущей
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      iconLeft={<RotateCcw size={12} />}
                      loading={restoring === row.id}
                      onClick={() => restore(row)}
                    >
                      Сделать основной
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      {compareWith && current && (
        <MaterialCompareModal
          open={!!compareWith}
          onClose={() => setCompareWith(null)}
          title={`${title} · v${compareWith.version} ↔ v${current.version}`}
          leftLabel={`v${compareWith.version} · ${sourceLabel(compareWith.source)}`}
          rightLabel={`v${current.version} · текущая`}
          leftContent={compareWith.content}
          rightContent={current.content}
        />
      )}
    </>
  );
}

// Sprint 33 — компактный badge показывающий "AI собрал / Человек правил /
// Восстановлено из старой / Текущая".
function SourceBadge({ source, isCurrent }: { source: string | null; isCurrent: boolean }) {
  if (isCurrent) {
    return <StatusBadge tone="success" dot>Основная</StatusBadge>;
  }
  switch (source) {
    case 'ai_generate':
    case 'ai_regenerate_feedback':
      return (
        <StatusBadge tone="ai">
          <Sparkles size={10} className="mr-1" />
          AI-сгенерировано
        </StatusBadge>
      );
    case 'interview':
      return (
        <StatusBadge tone="zapusk">
          <UserRound size={10} className="mr-1" />
          AI-интервью
        </StatusBadge>
      );
    case 'restore':
      return (
        <StatusBadge tone="zapusk">
          <RotateCcw size={10} className="mr-1" />
          Восстановлено
        </StatusBadge>
      );
    case 'manual_edit':
      return (
        <StatusBadge tone="warning">
          <UserRound size={10} className="mr-1" />
          Ручная правка
        </StatusBadge>
      );
    default:
      return <StatusBadge tone="neutral">Архив</StatusBadge>;
  }
}

function sourceLabel(source: string | null): string {
  switch (source) {
    case 'ai_generate':
    case 'ai_regenerate_feedback': return 'AI-сгенерировано';
    case 'interview': return 'AI-интервью';
    case 'restore': return 'восстановлено';
    case 'manual_edit': return 'ручная правка';
    default: return 'архив';
  }
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
    if (diffMin < 1) return 'только что';
    if (diffMin < 60) return `${diffMin} мин назад`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} ч назад`;
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch {
    return iso;
  }
}

// Brief — сложный объект, не плоский text. Сериализуем во читаемый markdown
// чтобы compare diff показывал осмысленные изменения по секциям.
function stringifyBrief(b: BriefVersionApi): string {
  const lines: string[] = [];
  lines.push(`# Brief v${b.version}`, '');
  if (b.businessSummary) lines.push('## Бизнес', b.businessSummary, '');
  if (b.monetization) lines.push('## Монетизация', b.monetization, '');
  if (b.investmentAsk) lines.push('## Инвестиционный запрос', b.investmentAsk, '');
  const tryParse = (raw: string | null) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };
  const km = tryParse(b.keyMetrics);
  if (km) lines.push('## Ключевые метрики', JSON.stringify(km, null, 2), '');
  const strengths = tryParse(b.strengths);
  if (Array.isArray(strengths) && strengths.length) {
    lines.push('## Сильные стороны');
    for (const s of strengths) lines.push(`- ${s}`);
    lines.push('');
  }
  const weaknesses = tryParse(b.weaknesses);
  if (Array.isArray(weaknesses) && weaknesses.length) {
    lines.push('## Риски');
    for (const w of weaknesses) lines.push(`- ${w}`);
    lines.push('');
  }
  const missing = tryParse(b.missingData);
  if (Array.isArray(missing) && missing.length) {
    lines.push('## Не хватает данных');
    for (const m of missing) lines.push(`- ${m}`);
    lines.push('');
  }
  const napkin = tryParse(b.napkin);
  if (napkin) lines.push('## Бизнес на салфетке', JSON.stringify(napkin, null, 2));
  return lines.join('\n');
}
