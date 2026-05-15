import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, ChevronRight, Headphones } from 'lucide-react';
import { Card, CardHeader } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { listMeetings, type SalesSession, TONE_LABEL, TONE_BADGE } from '../../lib/salesSessions';
import { formatDate } from '../../lib/format';

// Компактный блок «Последние встречи» — встраивается в Project Cockpit и Lead
// Card. Показывает до 3 последних встреч + CTA. Если встреч нет — empty state
// со ссылкой на /sales-assistant.
export function RecentMeetings({ projectId, leadId, limit = 3 }: { projectId?: string; leadId?: string; limit?: number }) {
  const [sessions, setSessions] = useState<SalesSession[] | null>(null);

  useEffect(() => {
    if (!projectId && !leadId) { setSessions([]); return; }
    listMeetings({ projectId, leadId })
      .then((r) => setSessions(r.sessions.slice(0, limit)))
      .catch(() => setSessions([]));
  }, [projectId, leadId, limit]);

  if (sessions === null) {
    return (
      <Card padded>
        <div className="text-sm text-muted text-center py-6">Загружаем встречи…</div>
      </Card>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card padded accent="ai">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-md bg-ai/12 border border-ai/30 text-ai-glow flex items-center justify-center shrink-0">
            <ClipboardCheck size={18} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-primary">Встреч пока нет</h3>
            <p className="text-xs text-secondary mt-1 leading-relaxed">
              Проведите первую встречу с AI-ассистентом — он сохранит контекст инвестора, возражения и подготовит продолжение общения.
            </p>
          </div>
          <Link to="/sales-assistant">
            <Button size="sm" iconLeft={<Headphones size={13} />}>Провести встречу с AI-ассистентом</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card padded>
      <CardHeader
        title="Последние встречи с инвесторами"
        subtitle="Память встреч: что важно помнить и какой следующий шаг"
        action={
          <Link to="/meetings">
            <Button size="sm" variant="ghost" iconRight={<ChevronRight size={13} />}>Все встречи</Button>
          </Link>
        }
      />
      <ul className="space-y-2">
        {sessions.map((s) => (
          <li key={s.id} className="rounded-md border border-hairline bg-canvas/40 px-3 py-3 hover:border-ai/35 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {s.tone && <StatusBadge tone={TONE_BADGE[s.tone]} dot>{TONE_LABEL[s.tone]}</StatusBadge>}
                  <span className="text-[11px] text-muted">{formatDate(s.createdAt)}</span>
                  {s.probabilityScore != null && (
                    <span className={`text-[11px] font-num font-semibold ${s.probabilityScore >= 60 ? 'text-success' : s.probabilityScore >= 35 ? 'text-zapusk-400' : 'text-warning'}`}>
                      {s.probabilityScore}%
                    </span>
                  )}
                </div>
                <div className="text-sm font-medium text-primary truncate">{s.investorName ?? 'Инвестор без имени'}</div>
                {s.nextStep && (
                  <div className="text-xs text-secondary mt-1 line-clamp-2">
                    <span className="text-muted">Следующий шаг · </span>{s.nextStep}
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
