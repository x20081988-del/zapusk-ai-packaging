import { useState } from 'react';
import clsx from 'clsx';
import { Star, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Textarea } from './Input';
import { VoiceInputButton } from './VoiceInputButton';
import type { ArtefactReview } from '../../lib/api';

interface Props {
  current?: ArtefactReview;
  onSave: (payload: { score: number; comment: string; approved: boolean; needsRework: boolean }) => Promise<void>;
  compact?: boolean;
}

// Inline review widget — 5-star score, comment, two checkboxes.
// Lives inside artefact cards. Save is async; we show a tiny "сохранено" state on success.
export function ReviewBlock({ current, onSave, compact }: Props) {
  const [score, setScore] = useState<number>(current?.score ?? 0);
  const [comment, setComment] = useState<string>(current?.comment ?? '');
  const [approved, setApproved] = useState<boolean>(current?.approved ?? false);
  const [needsRework, setNeedsRework] = useState<boolean>(current?.needsRework ?? false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!score) return;
    setSaving(true);
    try {
      await onSave({ score, comment: comment.trim(), approved, needsRework });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={clsx('rounded-md border border-hairline bg-canvas/50 p-3 space-y-2.5', compact && 'p-2.5')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setScore(n)}
              className={clsx(
                'w-6 h-6 flex items-center justify-center transition-colors',
                score >= n ? 'text-zapusk-400' : 'text-faint hover:text-zapusk-400',
              )}
            >
              <Star size={14} fill={score >= n ? 'currentColor' : 'none'} strokeWidth={2} />
            </button>
          ))}
          <span className="ml-2 text-[11px] text-muted font-num">
            {score ? `${score}/5` : 'без оценки'}
          </span>
        </div>
        {saved && <span className="text-[10px] text-success uppercase tracking-wide">сохранено</span>}
      </div>

      {!compact && (
        <div>
          <Textarea
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий: что нужно изменить, усилить или проверить"
            className="text-xs"
          />
          <VoiceInputButton
            className="mt-2"
            onTranscript={(text) => setComment((current) => current.trim() ? `${current.trim()} ${text}` : text)}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => { setApproved(e.target.checked); if (e.target.checked) setNeedsRework(false); }}
              className="accent-success w-3.5 h-3.5"
            />
            <CheckCircle2 size={11} className="text-success" />
            Годится
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={needsRework}
              onChange={(e) => { setNeedsRework(e.target.checked); if (e.target.checked) setApproved(false); }}
              className="accent-warning w-3.5 h-3.5"
            />
            <AlertTriangle size={11} className="text-warning" />
            Доработать
          </label>
        </div>
        <Button size="sm" variant="secondary" onClick={save} loading={saving} disabled={!score}>
          {current ? 'Обновить' : 'Оценить'}
        </Button>
      </div>
    </div>
  );
}
