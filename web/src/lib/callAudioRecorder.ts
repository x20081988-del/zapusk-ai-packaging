// Sprint 54 P0 — Local mic recorder for hybrid transcription.
//
// Параллельно с realtime WebRTC мы записываем тот же audio track в blob
// через MediaRecorder. По окончанию звонка blob отправляется на backend,
// где gpt-4o-transcribe делает чистую транскрипцию — она заменит draft
// в SalesSession.transcript.
//
// Зачем не одну только realtime: realtime галлюцинирует на слабом аудио,
// а offline gpt-4o-transcribe — точнее. Live realtime даёт быстрые
// подсказки, offline даёт чистый final.
//
// Безопасность:
//   • Никакое аудио НЕ покидает браузер до явного финализирующего вызова.
//   • Если MediaRecorder не поддерживается (старый Safari, embedded браузер)
//     — recorder ничего не пишет, isRecording=false, getBlob()→null. Звонок
//     продолжает работать как раньше (только draft).

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

export interface CallAudioRecorder {
  isActive: () => boolean;
  /** Останавливает запись и возвращает финальный Blob. null = ничего не записалось. */
  stopAndGetBlob: () => Promise<Blob | null>;
  /** Принудительно очищает chunks (для случая, когда blob не нужен). */
  discard: () => void;
  /** Какой mimeType фактически использовал MediaRecorder (для расширения файла). */
  mimeType: string;
}

function pickMimeType(): string {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return '';
  for (const mime of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return ''; // browser default
}

export function startCallAudioRecorder(stream: MediaStream): CallAudioRecorder | null {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return null;
  let recorder: MediaRecorder;
  const mimeType = pickMimeType();
  try {
    recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
  } catch (err) {
    console.warn('[call-recorder] MediaRecorder construct failed:', err);
    return null;
  }
  const chunks: Blob[] = [];
  let active = true;

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.onerror = (e) => {
    console.warn('[call-recorder] error:', e);
  };

  try {
    // Запрашиваем чанк раз в 5 сек, чтобы при разрыве звонка хоть что-то
    // осталось в памяти.
    recorder.start(5_000);
  } catch (err) {
    console.warn('[call-recorder] start failed:', err);
    return null;
  }

  return {
    isActive: () => active && recorder.state === 'recording',
    mimeType: recorder.mimeType || mimeType || 'audio/webm',
    stopAndGetBlob: () => new Promise<Blob | null>((resolve) => {
      if (!active) return resolve(null);
      active = false;
      const finalize = () => {
        if (chunks.length === 0) return resolve(null);
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        // Clear chunks to free memory; blob keeps its own reference.
        chunks.length = 0;
        resolve(blob);
      };
      // recorder.stop() fires onstop AFTER the final dataavailable event.
      recorder.onstop = finalize;
      try {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        } else {
          // Already stopped (unusual); resolve with what we have.
          finalize();
        }
      } catch (err) {
        console.warn('[call-recorder] stop failed:', err);
        finalize();
      }
    }),
    discard: () => {
      active = false;
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* ignore */ }
      chunks.length = 0;
    },
  };
}
