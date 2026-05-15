import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Download } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { api, downloadBlob, type GeneratedPrompt } from '../lib/api';
import { PROMPT_KIND_LABELS, formatDate } from '../lib/format';
import { sanitizePublicText } from '../lib/publicText';

export default function ProjectPrompts() {
  const { id } = useParams<{ id: string }>();
  const [prompts, setPrompts] = useState<GeneratedPrompt[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<{ prompts: GeneratedPrompt[] }>(`/api/prompts/${id}`).then((r) => {
      setPrompts(r.prompts);
      if (r.prompts[0]) setActive(r.prompts[0].id);
    });
  }, [id]);

  const grouped = useMemo(() => {
    const m = new Map<string, GeneratedPrompt[]>();
    for (const p of prompts) {
      if (!m.has(p.kind)) m.set(p.kind, []);
      m.get(p.kind)!.push(p);
    }
    return m;
  }, [prompts]);

  const current = prompts.find((p) => p.id === active);
  const currentBody = sanitizePublicText(current?.body);

  return (
    <AppLayout
      title="Задания для материалов"
      action={
        <Link to={`/projects/${id}`}>
          <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={14} />}>К проекту</Button>
        </Link>
      }
    >
      {prompts.length === 0 ? (
        <Card padded>
          <EmptyState
            title="Задания ещё не сформированы"
            description="Перейдите в раздел «Материалы проекта» и сформируйте задания для инвестиционной презентации, посадочной страницы, финансовой модели и других материалов для инвесторов."
            action={
              <Link to={`/projects/${id}/packaging`}>
                <Button>К материалам проекта</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          <Card padded={false}>
            <div className="p-3 space-y-1 max-h-[70vh] overflow-y-auto">
              {Array.from(grouped.entries()).map(([kind, items]) => {
                const meta = PROMPT_KIND_LABELS[kind];
                return (
                  <div key={kind} className="mb-2">
                    <div className="px-2 pb-1.5 pt-2 text-[10px] uppercase tracking-[0.12em] text-faint font-semibold">
                      {meta?.title ?? kind}
                    </div>
                    {items.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setActive(p.id)}
                        className={`w-full text-left flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md transition-colors ${
                          active === p.id ? 'bg-zapusk/10 text-primary' : 'text-secondary hover:bg-surface hover:text-primary'
                        }`}
                      >
                        <span className="text-xs">v{p.version}</span>
                        <span className="text-[10px] text-muted">{formatDate(p.createdAt)}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </Card>

          {current ? (
            <Card padded>
              <CardHeader
                title={PROMPT_KIND_LABELS[current.kind]?.title ?? current.kind}
                subtitle={`Версия ${current.version} · ${formatDate(current.createdAt)}`}
                action={
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={PROMPT_KIND_LABELS[current.kind]?.accent ?? 'neutral'} dot>
                      v{current.version}
                    </StatusBadge>
                    <Button size="sm" variant="secondary" iconLeft={<Copy size={12} />} onClick={() => navigator.clipboard.writeText(currentBody)}>
                      Копировать
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft={<Download size={12} />}
                      onClick={() => downloadBlob(
                        `/api/projects/${id}/prompts/${current.id}.md`,
                        `prompt-${current.kind}-v${current.version}.md`,
                      )}
                    >
                      Текстовый файл для команды
                    </Button>
                  </div>
                }
              />
              <pre className="bg-canvas border border-hairline rounded-md p-4 text-[12.5px] text-secondary leading-relaxed whitespace-pre-wrap font-num">
                {currentBody}
              </pre>
            </Card>
          ) : (
            <Card padded><p className="text-sm text-muted">Выберите задание</p></Card>
          )}
        </div>
      )}
    </AppLayout>
  );
}
