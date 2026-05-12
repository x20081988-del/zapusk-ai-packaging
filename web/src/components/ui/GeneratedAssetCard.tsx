import { useState } from 'react';
import { CheckCircle2, Copy, Download, FileText, MessageSquarePlus, RefreshCw, Sparkles, Star } from 'lucide-react';
import clsx from 'clsx';
import { Card } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { ReviewBlock } from './ReviewBlock';
import { Modal } from './Modal';
import { Textarea } from './Input';
import { VoiceInputButton } from './VoiceInputButton';
import type { ArtefactReview } from '../../lib/api';
import { sanitizePublicText } from '../../lib/publicText';

interface Props {
  title: string;
  subtitle: string;
  accent: 'zapusk' | 'ai';
  version?: number;
  body?: string;
  review?: ArtefactReview;
  onDownload?: () => void;
  onRegenerate?: () => void;
  onRegenerateWithFeedback?: (feedback?: string) => void | Promise<void>;
  onSaveReview?: (payload: { score: number; comment: string; approved: boolean; needsRework: boolean }) => Promise<void>;
  regenerating?: boolean;
}

export function GeneratedAssetCard({
  title,
  subtitle,
  accent,
  version,
  body,
  review,
  onDownload,
  onRegenerate,
  onRegenerateWithFeedback,
  onSaveReview,
  regenerating,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [comment, setComment] = useState(review?.comment ?? '');
  const [modalAction, setModalAction] = useState<'approve' | 'rework' | null>(null);
  const hasContent = Boolean(body);
  const publicBody = sanitizePublicText(body);
  async function copyFullText() {
    if (!publicBody) return;
    await navigator.clipboard.writeText(publicBody);
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
      setDetailsOpen(false);
    } finally {
      setModalAction(null);
    }
  }

  async function sendForRework() {
    if (!onRegenerateWithFeedback || !comment.trim()) return;
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
      await onRegenerateWithFeedback(comment.trim());
      setDetailsOpen(false);
      setComment('');
    } finally {
      setModalAction(null);
    }
  }

  return (
    <>
      <Card accent={accent} padded>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={12} className={accent === 'ai' ? 'text-ai-glow' : 'text-zapusk-400'} />
              <span className={clsx(
                'text-[10px] uppercase tracking-[0.12em] font-semibold',
                accent === 'ai' ? 'text-ai-glow' : 'text-zapusk-400',
              )}>
                {accent === 'ai' ? 'Задание' : 'Материал'}
              </span>
            </div>
            <h3 className="text-[15px] font-semibold text-primary leading-tight">{title}</h3>
            <p className="text-xs text-muted mt-1">{subtitle}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {review?.approved && <StatusBadge tone="success" dot>Годится</StatusBadge>}
            {review?.needsRework && <StatusBadge tone="warning" dot>Доработать</StatusBadge>}
            {review?.score ? (
              <span className="inline-flex items-center gap-1 px-2 h-6 rounded-full bg-zapusk/12 border border-zapusk/30 text-zapusk-400 text-[11px] font-semibold">
                <Star size={10} fill="currentColor" /> {review.score}/5
              </span>
            ) : null}
            {hasContent && version != null && (
              <StatusBadge tone={accent} dot>v{version}</StatusBadge>
            )}
          </div>
        </div>

        {hasContent ? (
          <div className="bg-canvas border border-hairline rounded-md p-3 max-h-32 overflow-hidden mb-3 relative">
            <pre className="text-[11px] text-secondary font-num whitespace-pre-wrap leading-relaxed">
              {publicBody.slice(0, 320)}
              {publicBody.length > 320 && '…'}
            </pre>
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent pointer-events-none" />
          </div>
        ) : (
          <div className="bg-canvas/50 border border-dashed border-line rounded-md p-4 mb-3 text-center">
            <p className="text-xs text-muted">Не сформировано</p>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {hasContent ? (
            <>
              <Button size="sm" variant="secondary" iconLeft={<FileText size={12} />} onClick={() => setDetailsOpen(true)}>
                Открыть задание
              </Button>
              <Button size="sm" variant="ghost" iconLeft={<Copy size={12} />} onClick={copyFullText}>
                Копировать
              </Button>
              <Button size="sm" variant="ghost" iconLeft={<Download size={12} />} onClick={onDownload}>
                Текстовый файл для команды
              </Button>
              <div className="flex-1" />
              {onRegenerateWithFeedback && (
                <Button size="sm" variant="ghost" iconLeft={<MessageSquarePlus size={12} />} onClick={() => setDetailsOpen(true)}>
                  Доработать
                </Button>
              )}
              <Button size="sm" variant="ghost" iconLeft={<RefreshCw size={12} />} onClick={onRegenerate} loading={regenerating}>
                Создать заново
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant={accent === 'ai' ? 'ai' : 'primary'}
              iconLeft={<Sparkles size={12} />}
              onClick={onRegenerate}
              loading={regenerating}
            >
              Сформировать
            </Button>
          )}
        </div>

        {hasContent && onSaveReview && (
          <div className="mt-3">
            <ReviewBlock current={review} onSave={onSaveReview} />
          </div>
        )}
      </Card>

      {hasContent && (
        <Modal
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          title={`Задание · ${title}`}
          width="max-w-4xl"
          bodyClassName="min-h-0 overflow-hidden"
        >
          <div className="flex max-h-[calc(85vh-4.25rem)] flex-col">
            <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5 space-y-4">
              <div>
                <p className="text-xs text-muted mb-2">Полный текст задания для команды</p>
                <pre className="bg-canvas border border-hairline rounded-md p-4 text-[12.5px] text-secondary leading-relaxed whitespace-pre-wrap font-num">
                  {publicBody}
                </pre>
              </div>

              <div>
                <Textarea
                  label="Что нужно изменить?"
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Опишите замечания: что усилить, убрать или уточнить"
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
                    disabled={!comment.trim() || !onRegenerateWithFeedback}
                  >
                    Отправить на доработку
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" iconLeft={<Copy size={14} />} onClick={copyFullText}>
                    Скопировать текст
                  </Button>
                  <Button variant="ghost" onClick={() => setDetailsOpen(false)}>
                    Закрыть
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
