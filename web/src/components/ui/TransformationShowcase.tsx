import { ArrowRight, ExternalLink, FileText, Globe2, Image as ImageIcon, Table2 } from 'lucide-react';
import { Card, CardHeader } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import type { DemoMaterial, DemoTransformationCase } from '../../lib/demoMaterials';

export function TransformationShowcase({ item }: { item: DemoTransformationCase }) {
  return (
    <Card padded className="mb-6 overflow-hidden">
      <div className="absolute -top-20 -left-20 w-72 h-72 bg-ai/10 rounded-full blur-3xl" />
      <div className="relative">
        <CardHeader
          title="Трансформация упаковки"
          subtitle={item.summary}
        />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1.4fr] gap-4 items-stretch">
          <MaterialColumn title={item.beforeLabel} tone="neutral" items={item.before} />
          <div className="hidden lg:flex items-center justify-center px-1 text-zapusk-400">
            <div className="w-10 h-10 rounded-full border border-zapusk/30 bg-zapusk/10 flex items-center justify-center shadow-glow">
              <ArrowRight size={18} />
            </div>
          </div>
          <MaterialColumn title={item.afterLabel} tone="ai" items={item.after} />
        </div>
      </div>
    </Card>
  );
}

function MaterialColumn({ title, tone, items }: { title: string; tone: 'neutral' | 'ai'; items: DemoMaterial[] }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas/45 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-primary">{title}</h3>
        <StatusBadge tone={tone} dot>{tone === 'ai' ? 'Стало' : 'Было'}</StatusBadge>
      </div>
      <div className="space-y-2.5">
        {items.map((m) => (
          <MiniMaterial key={m.id} material={m} />
        ))}
      </div>
    </div>
  );
}

function MiniMaterial({ material }: { material: DemoMaterial }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-line bg-surface p-3">
      <div className="w-9 h-9 rounded-md bg-elevated border border-line flex items-center justify-center shrink-0">
        {iconFor(material)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-primary leading-snug">{material.title}</div>
        <div className="text-xs text-muted mt-1 line-clamp-2">{material.description}</div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={material.phase === 'after' ? 'ai' : 'neutral'}>v{material.version}</StatusBadge>
          <span className="text-[11px] text-muted">{material.format}</span>
        </div>
      </div>
      <Button size="sm" variant="ghost" iconLeft={<ExternalLink size={12} />} onClick={() => window.open(material.url, '_blank', 'noreferrer')}>
        Открыть
      </Button>
    </div>
  );
}

function iconFor(material: DemoMaterial) {
  if (material.kind === 'landing') return <Globe2 size={15} className="text-ai-glow" />;
  if (material.kind === 'financial' || material.kind === 'calculator') return <Table2 size={15} className="text-success" />;
  if (material.kind === 'teaser') return <ImageIcon size={15} className="text-zapusk-400" />;
  return <FileText size={15} className="text-secondary" />;
}
