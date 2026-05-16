import { Mic, Square } from 'lucide-react';
import { Button } from './Button';
import { useVoiceDictation } from '../../lib/useVoiceDictation';

interface Props {
  onTranscript: (text: string) => void;
  /** Idle label, shown until user clicks the button. */
  label?: string;
  /** Label shown in status text while actively listening. */
  listeningLabel?: string;
  /** "Stop dictation" label shown in the listening state next to the square icon. */
  stopLabel?: string;
  className?: string;
  /** Tighter button for inline-with-textarea placement. Default = md. */
  size?: 'sm' | 'md';
  disabled?: boolean;
}

export function VoiceInputButton({
  onTranscript,
  label = 'Надиктовать текст',
  listeningLabel = 'Слушаю…',
  stopLabel = 'Остановить диктовку',
  className,
  size = 'md',
  disabled,
}: Props) {
  const dictation = useVoiceDictation(onTranscript);
  const active = dictation.active;
  const icon = active ? <Square size={14} /> : <Mic size={14} />;
  const text = active ? stopLabel : label;
  const statusText = buildStatusText(dictation.status, dictation.provider, listeningLabel, dictation.message);

  return (
    <div className={className}>
      <Button
        type="button"
        size={size}
        variant={active ? 'danger' : 'ai'}
        iconLeft={icon}
        onClick={dictation.start}
        disabled={disabled}
        aria-pressed={active}
        aria-label={text}
        className="relative"
      >
        {active && (
          <span
            aria-hidden
            className="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-canvas animate-pulse"
          />
        )}
        {text}
      </Button>
      {(statusText || dictation.interim) && (
        <p className="mt-1.5 max-w-xs text-[11px] leading-snug text-muted">
          {statusText}
          {dictation.interim && (
            <span className="block truncate text-secondary">«{dictation.interim}»</span>
          )}
        </p>
      )}
    </div>
  );
}

function buildStatusText(
  status: ReturnType<typeof useVoiceDictation>['status'],
  provider: ReturnType<typeof useVoiceDictation>['provider'],
  listeningLabel: string,
  message: string | null,
): string | null {
  if (status === 'idle') return null;
  if (status === 'connecting') return message ?? 'Подключаю распознавание речи…';
  if (status === 'recognizing') return 'Распознаю речь…';
  if (status === 'fallback') return message ?? 'Слушаю через браузерное распознавание.';
  if (status === 'error') return message ?? 'Не удалось включить голосовой ввод.';
  if (provider === 'openai') return `${listeningLabel} OpenAI Realtime.`;
  return listeningLabel;
}
