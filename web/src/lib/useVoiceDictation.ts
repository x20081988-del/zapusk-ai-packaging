import { useEffect, useRef, useState } from 'react';
import { startRealtimeTranscription, type RealtimeSession } from './realtimeTranscription';

type DictationStatus = 'idle' | 'connecting' | 'listening' | 'recognizing' | 'fallback' | 'error';
type DictationProvider = 'openai' | 'browser' | null;

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

interface SpeechRecognitionResultLike extends ArrayLike<{ transcript: string }> {
  isFinal?: boolean;
}

interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function realtimeFallbackMessage(codeOrMessage?: string): string {
  const raw = String(codeOrMessage ?? '').toLowerCase();
  if (raw.includes('webrtc') || raw.includes('getusermedia') || raw.includes('media')) {
    return 'Не удалось подключить OpenAI Realtime, включено браузерное распознавание.';
  }
  if (raw.includes('not_configured') || raw.includes('session_unavailable') || raw.includes('503')) {
    return 'OpenAI Realtime временно недоступен, включено браузерное распознавание.';
  }
  return 'Не удалось подключить OpenAI Realtime, включено браузерное распознавание.';
}

export function useVoiceDictation(onTranscript: (text: string) => void) {
  const onTranscriptRef = useRef(onTranscript);
  const realtimeRef = useRef<RealtimeSession | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const shouldListenRef = useRef(false);
  const recognitionActiveRef = useRef(false);
  const providerRef = useRef<DictationProvider>(null);

  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<DictationStatus>('idle');
  const [provider, setProvider] = useState<DictationProvider>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [interim, setInterim] = useState('');

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  function clearRestartTimer() {
    if (restartTimerRef.current != null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }

  function setProviderState(next: DictationProvider) {
    providerRef.current = next;
    setProvider(next);
  }

  function cleanupConnections() {
    activeRef.current = false;
    shouldListenRef.current = false;
    recognitionActiveRef.current = false;
    clearRestartTimer();
    try { realtimeRef.current?.stop(); } catch { /* ignore */ }
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    realtimeRef.current = null;
    recognitionRef.current = null;
    providerRef.current = null;
  }

  function stop() {
    cleanupConnections();
    setProviderState(null);
    setActive(false);
    setInterim('');
    setStatus('idle');
    setMessage(null);
  }

  function startBrowserFallback(reason?: string) {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      activeRef.current = false;
      shouldListenRef.current = false;
      setActive(false);
      setProviderState(null);
      setStatus('error');
      setMessage('Голосовой ввод не поддерживается в этом браузере. Введите текст вручную.');
      return;
    }

    clearRestartTimer();
    const recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      const startIndex = event.resultIndex ?? 0;
      for (let i = startIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = Array.from(result).map((item) => item.transcript).join(' ').trim();
        if (!text) continue;
        if (result.isFinal) finalText = [finalText, text].filter(Boolean).join(' ');
        else interimText = [interimText, text].filter(Boolean).join(' ');
      }
      if (finalText) {
        onTranscriptRef.current(finalText);
        setInterim('');
        setStatus('fallback');
      } else if (interimText) {
        setInterim(interimText);
        setStatus('recognizing');
      }
    };
    recognition.onerror = (event) => {
      if (!shouldListenRef.current) return;
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
        activeRef.current = false;
        shouldListenRef.current = false;
        setActive(false);
        setProviderState(null);
        setStatus('error');
        setMessage('Микрофон недоступен. Разрешите доступ в браузере или введите текст вручную.');
        return;
      }
      setStatus('error');
      setMessage('Не удалось распознать речь. Продолжаю пробовать, можно ввести текст вручную.');
    };
    recognition.onend = () => {
      recognitionActiveRef.current = false;
      if (!shouldListenRef.current) return;
      setStatus('fallback');
      restartTimerRef.current = window.setTimeout(() => startBrowserFallback(reason), 350);
    };

    recognitionRef.current = recognition;
    setProviderState('browser');
    setActive(true);
    setStatus('fallback');
    setMessage(reason ?? 'OpenAI Realtime недоступен, включено браузерное распознавание.');
    try {
      recognitionActiveRef.current = true;
      recognition.start();
    } catch {
      recognitionActiveRef.current = false;
      setStatus('error');
      setMessage('Не удалось включить микрофон. Разрешите доступ или введите текст вручную.');
    }
  }

  async function start() {
    if (activeRef.current) {
      stop();
      return;
    }

    activeRef.current = true;
    shouldListenRef.current = true;
    setActive(true);
    setInterim('');
    setStatus('connecting');
    setMessage('Подключаю распознавание речи…');

    try {
      const session = await startRealtimeTranscription({
        onInterim: (text) => {
          if (!activeRef.current) return;
          setInterim(text);
          setStatus(text ? 'recognizing' : 'listening');
        },
        onFinal: (text) => {
          if (!activeRef.current) return;
          if (text.trim()) onTranscriptRef.current(text.trim());
          setInterim('');
          setStatus('listening');
        },
        onError: (err) => {
          if (!activeRef.current) return;
          setProviderState('browser');
          try { realtimeRef.current?.stop(); } catch { /* ignore */ }
          realtimeRef.current = null;
          startBrowserFallback(realtimeFallbackMessage(err.message));
        },
        onClose: () => {
          if (!activeRef.current || providerRef.current !== 'openai') return;
          startBrowserFallback('Realtime-сессия завершилась. Включено браузерное распознавание.');
        },
      });
      if (!activeRef.current) {
        session.stop();
        return;
      }
      realtimeRef.current = session;
      setProviderState('openai');
      setStatus('listening');
      setMessage('Слушаю через OpenAI Realtime.');
    } catch (err) {
      if (!activeRef.current) return;
      const reason = err instanceof Error ? err.message : 'realtime_unavailable';
      startBrowserFallback(realtimeFallbackMessage(reason));
    }
  }

  useEffect(() => cleanupConnections, []);

  return {
    active,
    status,
    provider,
    message,
    interim,
    start,
    stop,
  };
}
