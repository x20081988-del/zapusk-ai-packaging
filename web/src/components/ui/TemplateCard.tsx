import { FileCode2 } from 'lucide-react';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import type { PromptTemplate } from '../../lib/api';

const CATEGORY_TONE: Record<string, 'zapusk' | 'ai' | 'info' | 'neutral'> = {
  landing: 'ai',
  pitch: 'ai',
  financial: 'ai',
  sales: 'ai',
  faq: 'zapusk',
  summary: 'zapusk',
  spec: 'info',
};

export function TemplateCard({ template, onOpen }: { template: PromptTemplate; onOpen: () => void }) {
  return (
    <Card hoverable onClick={onOpen}>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-md bg-elevated border border-line flex items-center justify-center flex-shrink-0">
          <FileCode2 size={16} className="text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge tone={CATEGORY_TONE[template.category] ?? 'neutral'}>{template.category}</StatusBadge>
            {!template.active && <StatusBadge tone="neutral">disabled</StatusBadge>}
          </div>
          <h3 className="text-sm font-semibold text-primary truncate">{template.name}</h3>
          <p className="text-xs text-muted mt-1 line-clamp-2">{template.description ?? '—'}</p>
        </div>
      </div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-faint font-mono">{template.key}</div>
    </Card>
  );
}
