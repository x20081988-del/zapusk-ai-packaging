import { useMemo, useState } from 'react';
import {
  CheckCircle2, Copy, Download, ExternalLink, FileText, Globe2, Image as ImageIcon,
  MessageSquarePlus, RefreshCw, Table2,
} from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { Modal } from './Modal';
import { Textarea } from './Input';
import { VoiceInputButton } from './VoiceInputButton';
import { formatDate } from '../../lib/format';
import { sanitizePublicText } from '../../lib/publicText';
import type { ArtefactReview } from '../../lib/api';
import type { DemoMaterial, DemoMaterialStatus } from '../../lib/demoMaterials';
import {
  providerLabel, toolLabel, providerTone, resolveTemplateOrchestration,
} from '../../lib/aiProviders';

interface Props {
  material: DemoMaterial;
  promptBody?: string;
  promptVersion?: number;
  review?: ArtefactReview;
  regenerating?: boolean;
  onGeneratePrompt?: () => void;
  onRegenerateWithFeedback?: (feedback: string) => Promise<void> | void;
  onSaveReview?: (payload: { score: number; comment: string; approved: boolean; needsRework: boolean }) => Promise<void>;
}

const STATUS_LABELS: Record<DemoMaterialStatus, string> = {
  source: 'Исходный',
  platform: 'Создан платформой',
  rework: 'На доработке',
  approved: 'Утверждено',
};

const STATUS_TONES: Record<DemoMaterialStatus, 'neutral' | 'ai' | 'warning' | 'success'> = {
  source: 'neutral',
  platform: 'ai',
  rework: 'warning',
  approved: 'success',
};

export function ProjectMaterialCard({
  material,
  promptBody,
  promptVersion,
  review,
  regenerating,
  onGeneratePrompt,
  onRegenerateWithFeedback,
  onSaveReview,
}: Props) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [comment, setComment] = useState(review?.comment ?? '');
  const [modalAction, setModalAction] = useState<'approve' | 'rework' | null>(null);
  const publicPrompt = sanitizePublicText(promptBody);
  const canRework = Boolean(material.promptKind && onRegenerateWithFeedback);
  const status = review?.approved ? 'approved' : review?.needsRework ? 'rework' : material.status;

  const icon = useMemo(() => {
    if (material.kind === 'landing') return <Globe2 size={16} className="text-ai-glow" />;
    if (material.kind === 'financial' || material.kind === 'calculator') return <Table2 size={16} className="text-success" />;
    if (material.kind === 'teaser') return <ImageIcon size={16} className="text-zapusk-400" />;
    return <FileText size={16} className="text-secondary" />;
  }, [material.kind]);

  async function copyPrompt() {
    if (!publicPrompt) return;
    await navigator.clipboard.writeText(publicPrompt);
  }

  async function approve() {
    if (!onSaveReview) return;
    setModalAction('approve');
    try {
      await onSaveReview({
        score: review?.score ?? 5,
        comment: comment.trim(),
        approved: true,
        needsRework: false,
      });
      setPromptOpen(false);
    } finally {
      setModalAction(null);
    }
  }

  async function sendForRework() {
    if (!canRework || !comment.trim()) return;
    setModalAction('rework');
    try {
      if (onSaveReview) {
        await onSaveReview({
          score: review?.score ?? 3,
          comment: comment.trim(),
          approved: false,
          needsRework: true,
        });
      }
      await onRegenerateWithFeedback?.(comment.trim());
      setPromptOpen(false);
      setComment('');
    } finally {
      setModalAction(null);
    }
  }

  return (
    <>
      <Card accent={material.phase === 'after' ? 'ai' : null} padded className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-md bg-elevated border border-line flex items-center justify-center shrink-0">
              {icon}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <StatusBadge tone={STATUS_TONES[status]} dot>{STATUS_LABELS[status]}</StatusBadge>
                <StatusBadge tone={material.phase === 'after' ? 'ai' : 'neutral'}>v{material.version}</StatusBadge>
                {/* Sprint 15: orchestration badges на каждом материале. Берём
                    provider/tool из default registry по promptKind — это и
                    есть «какой AI собрал этот материал». */}
                {(() => {
                  const orch = resolveTemplateOrchestration(material.promptKind);
                  if (!orch) return null;
                  return (
                    <>
                      <StatusBadge tone={providerTone(orch.provider)} dot>
                        {providerLabel(orch.provider)}
                      </StatusBadge>
                      <StatusBadge tone="neutral">{toolLabel(orch.tool)}</StatusBadge>
                    </>
                  );
                })()}
              </div>
              <h3 className="text-[15px] font-semibold text-primary leading-tight">{material.title}</h3>
              <p className="text-xs text-muted mt-1 leading-relaxed">{material.description}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
          <Meta label="Формат" value={material.format} />
          <Meta label="Дата" value={formatDate(material.date)} />
          <Meta label="Версия" value={material.phase === 'before' ? 'Было' : 'Стало'} />
          <Meta label="Задание" value={promptVersion ? `v${promptVersion}` : material.promptKind ? 'нужно сформировать' : 'не требуется'} />
        </div>

        <div className="mt-4 pt-4 border-t border-hairline grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" iconLeft={<ExternalLink size={12} />} onClick={() => window.open(material.url, '_blank', 'noreferrer')}>
            Открыть
          </Button>
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<Download size={12} />}
            disabled={!material.downloadUrl}
            onClick={() => material.downloadUrl && window.open(material.downloadUrl, '_blank', 'noreferrer')}
          >
            Скачать
          </Button>
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<MessageSquarePlus size={12} />}
            disabled={!canRework}
            onClick={() => setPromptOpen(true)}
          >
            Доработать
          </Button>
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<FileText size={12} />}
            disabled={!material.promptKind}
            onClick={() => setPromptOpen(true)}
          >
            Посмотреть задание
          </Button>
        </div>
      </Card>

      <Modal
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        title={`Задание · ${material.title}`}
        width="max-w-4xl"
        bodyClassName="min-h-0 overflow-hidden"
      >
        <div className="flex max-h-[calc(85vh-4.25rem)] flex-col">
          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5 space-y-4">
            {publicPrompt ? (
              <div>
                <p className="text-xs text-muted mb-2">Полный текст задания для создания материала</p>
                <pre className="bg-canvas border border-hairline rounded-md p-4 text-[12.5px] text-secondary leading-relaxed whitespace-pre-wrap font-num">
                  {publicPrompt}
                </pre>
              </div>
            ) : (
              <div className="bg-canvas/50 border border-dashed border-line rounded-md p-5 text-center">
                <p className="text-sm font-medium text-primary">Задание ещё не сформировано</p>
                <p className="text-xs text-muted mt-1">
                  Сформируйте задание, чтобы команда могла доработать этот материал по замечаниям.
                </p>
                {onGeneratePrompt && (
                  <Button className="mt-4" variant="ai" iconLeft={<RefreshCw size={14} />} loading={regenerating} onClick={onGeneratePrompt}>
                    Сформировать задание
                  </Button>
                )}
              </div>
            )}

            <div>
              <Textarea
                label="Что нужно изменить?"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Опишите замечания к материалу: что усилить, убрать или уточнить"
              />
              <VoiceInputButton
                className="mt-2"
                onTranscript={(text) => setComment((current) => current.trim() ? `${current.trim()} ${text}` : text)}
              />
            </div>
          </div>

          <div className="shrink-0 border-t border-hairline bg-elevated px-4 py-3 sm:px-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="secondary"
                  iconLeft={<CheckCircle2 size={14} />}
                  onClick={approve}
                  loading={modalAction === 'approve'}
                  disabled={!onSaveReview}
                >
                  Утвердить
                </Button>
                <Button
                  variant="ai"
                  iconLeft={<MessageSquarePlus size={14} />}
                  onClick={sendForRework}
                  loading={modalAction === 'rework' || regenerating}
                  disabled={!comment.trim() || !canRework}
                >
                  Отправить на доработку
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" iconLeft={<Copy size={14} />} onClick={copyPrompt} disabled={!publicPrompt}>
                  Скопировать текст
                </Button>
                <Button variant="ghost" onClick={() => setPromptOpen(false)}>
                  Закрыть
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-canvas/45 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-0.5">{label}</div>
      <div className="text-xs text-primary truncate">{value}</div>
    </div>
  );
}
