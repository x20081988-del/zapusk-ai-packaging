import { FileCode2, Cpu, Wand2 } from 'lucide-react';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import type { PromptTemplate } from '../../lib/api';
import {
  providerLabel, toolLabel, outputTypeLabel, providerTone, outputTypeTone,
  resolveTemplateOrchestration,
} from '../../lib/aiProviders';

const CATEGORY_TONE: Record<string, 'zapusk' | 'ai' | 'info' | 'neutral'> = {
  landing: 'ai',
  pitch: 'ai',
  financial: 'ai',
  sales: 'ai',
  faq: 'zapusk',
  summary: 'zapusk',
  spec: 'info',
};

// Sprint 15: TemplateCard теперь показывает AI orchestration: какой провайдер
// + инструмент + outputType. Если template без metadata, мы добираем default
// из registry (fallback), но с пометкой «по умолчанию» — чтобы админ видел,
// что строку стоит явно настроить.
export function TemplateCard({ template, onOpen }: { template: PromptTemplate; onOpen: () => void }) {
  const fallback = resolveTemplateOrchestration(template.key);
  const provider = template.provider ?? fallback?.provider ?? null;
  const tool = template.tool ?? fallback?.tool ?? null;
  const outputType = template.outputType ?? fallback?.outputType ?? null;
  const usesFallback = !template.provider && fallback !== null;

  return (
    <Card hoverable onClick={onOpen}>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-md bg-elevated border border-line flex items-center justify-center flex-shrink-0">
          <FileCode2 size={16} className="text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <StatusBadge tone={CATEGORY_TONE[template.category] ?? 'neutral'}>{template.category}</StatusBadge>
            {!template.active && <StatusBadge tone="neutral">disabled</StatusBadge>}
          </div>
          <h3 className="text-sm font-semibold text-primary truncate">{template.name}</h3>
          <p className="text-xs text-muted mt-1 line-clamp-2">{template.description ?? '—'}</p>
        </div>
      </div>

      {/* Sprint 15: orchestration row — главное, что отличает «библиотеку
          промптов» от orchestration center. Видно: кто исполняет, чем, и
          что получаем на выходе. */}
      <div className="rounded-md border border-hairline bg-canvas/45 px-3 py-2 mb-2">
        <div className="flex items-center gap-1.5 mb-1.5 text-[9px] uppercase tracking-[0.12em] text-muted font-semibold">
          <Cpu size={10} />
          AI orchestration
          {usesFallback && (
            <span className="text-faint normal-case tracking-normal">· по умолчанию</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={providerTone(provider)} dot>{providerLabel(provider)}</StatusBadge>
          {tool && <StatusBadge tone="neutral">{toolLabel(tool)}</StatusBadge>}
          {outputType && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted">
              <Wand2 size={10} className="text-ai-glow" />
              {outputTypeLabel(outputType)}
            </span>
          )}
        </div>
      </div>

      <div className="text-[10px] uppercase tracking-[0.1em] text-faint font-mono">{template.key}</div>
    </Card>
  );
}
