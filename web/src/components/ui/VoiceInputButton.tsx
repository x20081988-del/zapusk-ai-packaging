import { useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { Button } from './Button';

// Sprint 14 UX-polish: голосовая кнопка раньше выглядела ghost-button с
// микрофоном — пользователи путали её с подсказкой, а не действием. Делаем
// явный ai-стилизованный button с тремя состояниями: idle / listening / disabled.

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface Props {
  onTranscript: (text: string) => void;
  /** Idle label, shown until user clicks the button. */
  label?: string;
  /** Label shown while actively listening. */
  listeningLabel?: string;
  /** "Stop dictation" label shown in the listening state next to the square icon. */
  stopLabel?: string;
  className?: string;
  /** Tighter button for inline-with-textarea placement. Default = md. */
  size?: 'sm' | 'md';
  disabled?: boolean;
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
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
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function start() {
    if (disabled) return;

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setMessage('Голосовой ввод не поддерживается в этом браузере. Введите текст вручную.');
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .flatMap((result) => Array.from(result))
        .map((result) => result.transcript)
        .join(' ')
        .trim();
      if (transcript) onTranscript(transcript);
      setMessage(null);
    };
    recognition.onerror = () => {
      setMessage('Не удалось распознать речь. Введите текст вручную.');
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setMessage(null);
    setListening(true);
    recognition.start();
  }

  // While listening — secondary danger-ish look (square stop), with a soft
  // pulsing dot on the left so it visually reads as «recording».
  // Idle — ai variant so the button feels distinct from regular form controls.
  const icon = listening ? <Square size={14} /> : <Mic size={14} />;
  const text = listening ? stopLabel : label;

  return (
    <div className={className}>
      <Button
        type="button"
        size={size}
        variant={listening ? 'danger' : 'ai'}
        iconLeft={icon}
        onClick={start}
        disabled={disabled}
        aria-pressed={listening}
        aria-label={text}
        className="relative"
      >
        {listening && (
          <span
            aria-hidden
            className="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-canvas animate-pulse"
          />
        )}
        {listening ? listeningLabel : text}
      </Button>
      {message && <p className="mt-1.5 text-[11px] text-warning">{message}</p>}
    </div>
  );
}
