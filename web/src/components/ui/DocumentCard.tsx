import { FileText, Download } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import type { GeneratedDocument } from '../../lib/api';
import { formatDate } from '../../lib/format';

export function DocumentCard({ doc, onDownload }: { doc: GeneratedDocument; onDownload: () => void }) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-md bg-elevated border border-line flex items-center justify-center flex-shrink-0">
          <FileText size={16} className="text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge tone="zapusk" dot>v{doc.version}</StatusBadge>
            <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
              {doc.format === 'markdown' ? 'текстовый файл' : 'данные проекта'}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-primary truncate">{doc.title}</h3>
          <p className="text-xs text-muted mt-1">{formatDate(doc.createdAt)}</p>
        </div>
        <Button size="sm" variant="ghost" iconLeft={<Download size={12} />} onClick={onDownload}>
          Скачать текстовый файл
        </Button>
      </div>
    </Card>
  );
}
