import { MoonStar } from 'lucide-react';
import { snapshotLabel } from '../../lib/decide';

// Sprint 64 - плашка «показан снимок». Один вид на все экраны, которые умеют
// жить со спящим маком (/decide и CRM): владелец должен узнавать состояние с
// одного взгляда, а не читать разные формулировки на каждом экране.

export function SnapshotBanner({
  subject,
  fetchedAt,
  onRetry,
}: {
  /** Родительный падеж: «снимок ОЧЕРЕДИ/ДОСКИ/ВОРОНКИ на ...». */
  subject: string;
  fetchedAt: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="mb-4 rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-secondary flex items-start gap-2.5">
      <MoonStar className="w-4 h-4 mt-0.5 shrink-0 text-muted" />
      <span>
        <span className="font-medium text-primary">Мак сейчас недоступен.</span>{' '}
        Это снимок {subject} на {snapshotLabel(fetchedAt) || 'последний удачный момент'}.
        Кнопки и правки заработают, когда мак проснется.{' '}
        <button
          type="button"
          onClick={onRetry}
          className="underline underline-offset-2 hover:text-primary"
        >
          Проверить снова
        </button>
      </span>
    </div>
  );
}
