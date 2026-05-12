import { useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { Button } from './Button';

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
  label?: string;
  className?: string;
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function VoiceInputButton({ onTranscript, label = 'Надиктовать комментарий', className }: Props) {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function start() {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setMessage('Голосовой ввод не поддерживается в этом браузере. Введите текст вручную');
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
      setMessage('Не удалось распознать речь. Введите текст вручную');
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setMessage(null);
    setListening(true);
    recognition.start();
  }

  return (
    <div className={className}>
      <Button
        type="button"
        size="sm"
        variant={listening ? 'secondary' : 'ghost'}
        iconLeft={listening ? <Square size={12} /> : <Mic size={12} />}
        onClick={start}
      >
        {listening ? 'Остановить запись' : label}
      </Button>
      {message && <p className="mt-1.5 text-[11px] text-warning">{message}</p>}
    </div>
  );
}
