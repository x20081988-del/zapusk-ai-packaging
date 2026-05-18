import { Link } from 'react-router-dom';
import { DollarSign, BarChart3, Users, Handshake, Activity, AlertTriangle, MessageCircleQuestion } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardHeader } from './Card';
import { Button } from './Button';
import { parseObj } from '../../lib/format';

export interface MissingByCategory {
  financial?: string[];
  market?: string[];
  team?: string[];
  deal?: string[];
  unit_econ?: string[];
  risks?: string[];
}

const CATEGORIES: Array<{ key: keyof MissingByCategory; label: string; icon: ReactNode; tone: string }> = [
  { key: 'financial', label: 'Финансы',          icon: <DollarSign size={14} />,    tone: 'text-zapusk-400' },
  { key: 'market',    label: 'Рынок',            icon: <BarChart3 size={14} />,     tone: 'text-info' },
  { key: 'team',      label: 'Команда',          icon: <Users size={14} />,         tone: 'text-ai-glow' },
  { key: 'deal',      label: 'Условия сделки',   icon: <Handshake size={14} />,     tone: 'text-zapusk-400' },
  { key: 'unit_econ', label: 'Юнит-экономика',   icon: <Activity size={14} />,      tone: 'text-success' },
  { key: 'risks',     label: 'Риски',            icon: <AlertTriangle size={14} />, tone: 'text-warning' },
];

export function MissingDataPanel({
  rawJson,
  title = 'Что нужно уточнить для сильной упаковки',
  subtitle = 'Система нашла вопросы, без которых инвестиционные материалы могут быть неполными. Ответьте на них в интервью по проекту — после этого бриф и материалы можно будет доработать точнее.',
  interviewHref,
}: {
  rawJson: string | null | undefined;
  title?: string;
  subtitle?: string;
  interviewHref?: string;
}) {
  const data = parseObj<MissingByCategory>(rawJson, {});
  const totalCount = CATEGORIES.reduce((acc, c) => acc + (data[c.key]?.length ?? 0), 0);

  return (
    <Card padded accent="ai">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <MessageCircleQuestion size={16} className="text-ai-glow" />
            {title}
          </span>
        }
        subtitle={subtitle}
        action={interviewHref && (
          <Link to={interviewHref}>
            <Button size="sm" variant="ai">Ответить на вопросы</Button>
          </Link>
        )}
      />
      <div className="mb-4 rounded-md border border-ai/20 bg-ai/8 px-3 py-2 text-xs text-secondary leading-relaxed">
        Это не ошибка в проекте, а список точек, которые помогут сделать презентацию, финансовую модель и оффер убедительнее.
        {totalCount > 0 && <span className="font-medium text-primary"> Сейчас открыто вопросов: {totalCount}.</span>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {CATEGORIES.map(({ key, label, icon, tone }) => {
          const items = data[key] ?? [];
          return (
            <div key={key} className="bg-canvas/50 border border-hairline rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <div className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${tone}`}>
                  {icon}
                  {label}
                </div>
                <span className="text-[10px] text-muted font-num">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <p className="text-[11px] text-faint">— вопросы закрыты</p>
              ) : (
                <ul className="space-y-1.5">
                  {items.map((q, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 text-[12px] text-secondary leading-snug pl-2 border-l border-line">
                      <span>{q}</span>
                      {interviewHref && (
                        <Link to={interviewHref} className="shrink-0 text-[11px] font-medium text-ai-glow hover:text-primary transition-colors">
                          Ответить
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
