import { api } from './api';
import { normalizeTranscript } from './transcriptNormalize';
import {
  newSegmentId,
  recordLifecycle,
  compareInterimVsFinal,
} from './transcriptPipeline';

// Sprint 49 — OpenAI Realtime live transcription через WebRTC.
//
// Контракт:
//   1. Сервер /api/realtime/transcription-session выдаёт ephemeral client secret
//      (короткоживущий, 60 секунд) — основной OPENAI_API_KEY никогда не уходит
//      в браузер.
//   2. Браузер открывает RTCPeerConnection к https://api.openai.com/v1/realtime/calls
//      с этим секретом, шлёт SDP offer, получает answer.
//   3. Один audio track (mic) + один data channel "oai-events".
//   4. Из data channel приходят события transcription:
//        conversation.item.input_audio_transcription.delta  — partial
//        conversation.item.input_audio_transcription.completed — final
//   5. На любую ошибку — promise reject; вызывающий код переключается на
//      Web Speech API fallback.

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const SESSION_ENDPOINT = '/api/realtime/transcription-session';

export interface RealtimeSessionInfo {
  clientSecret: string;
  model: string;
  expiresAt: number | null;
  templateVersion: number;
  traceId?: string;
  promptSupported?: boolean;
  promptLength?: number;
  promptTrimmed?: boolean;
  turnDetectionSupported?: boolean;
}

export interface RealtimeCallbacks {
  /** Partial / delta transcript для текущего сегмента. */
  onInterim: (text: string) => void;
  /** Финальный сегмент (закончившаяся реплика). */
  /**
   * Sprint 58 P0.2 — каждый final сегмент несёт lifecycle id, чтобы
   * UI-приёмник мог пометить его «appended» под тем же ID, что был
   * присвоен при `raw_received`.
   */
  onFinal: (text: string, segmentId: string) => void;
  /** Ошибка после успешного подключения — UI должен переключиться на fallback. */
  onError: (err: Error) => void;
  /** Закрытие соединения (по stop() или со стороны OpenAI). */
  onClose?: (reason?: string) => void;
}

export interface RealtimeSession {
  /** Корректно завершает соединение (release mic + закрывает PC). */
  stop: () => void;
  /** Технические данные текущей сессии — для UI badge. */
  info: RealtimeSessionInfo;
  /**
   * Sprint 54 P0 — снимок mediaStream'а для параллельной локальной записи
   * (MediaRecorder) с тем же самым audio track, что слушает Realtime API.
   * Снимок может быть null если в этой сессии mic не открылся (защита
   * от race / fallback path).
   */
  mediaStream: MediaStream | null;
}

export class RealtimeUnavailableError extends Error {
  status: number;
  code: string;
  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.name = 'RealtimeUnavailableError';
    this.code = code;
    this.status = status;
  }
}

async function fetchSession(): Promise<RealtimeSessionInfo> {
  try {
    return await api.post<RealtimeSessionInfo>(SESSION_ENDPOINT, {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    const match = /^(\d{3})\s/.exec(msg);
    const status = match ? Number(match[1]) : 0;
    throw new RealtimeUnavailableError('session_unavailable', status, msg);
  }
}

function realtimeLog(event: string, details: Record<string, unknown> = {}) {
  // Sprint 57 P0.3 — structured diagnostic tags. Replaced free-form
  // '[realtime-transcription]' prefix with `[transcription/realtime]` so
  // grep-by-tag across logs is reliable.
  //
  // Categories used (filter via grep -E in production logs):
  //   transcription/realtime          — transport + session lifecycle
  //   transcription/segment-finalized — successful final segment emitted
  //   transcription/segment-dropped   — empty / invalid completed event
  //   transcription/server-error      — OpenAI-side error event
  //
  // Sister categories live in SalesAssistant.tsx (UI side):
  //   transcription/segment-appended  — final segment landed in UI state
  //   transcription/segment-dedup     — duplicate detected, dropped
  //   transcription/hallucination-guard — guard-pattern match, dropped
  //   transcription/stale-drop        — wrong-session event dropped
  //
  // Never log clientSecret, SDP, prompt, transcript or audio. 60-char
  // text previews max.
  try {
    console.debug('[transcription/realtime]', event, details);
  } catch {
    // ignore console failures in unusual embedded browsers
  }
}

export async function startRealtimeTranscription(
  callbacks: RealtimeCallbacks,
): Promise<RealtimeSession> {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new RealtimeUnavailableError('webrtc_unsupported', 0);
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new RealtimeUnavailableError('getusermedia_unsupported', 0);
  }

  const session = await fetchSession();
  realtimeLog('session-issued', {
    traceId: session.traceId,
    model: session.model,
    expiresAt: session.expiresAt,
    templateVersion: session.templateVersion,
    promptSupported: session.promptSupported,
    promptLength: session.promptLength,
    promptTrimmed: session.promptTrimmed,
    turnDetectionSupported: session.turnDetectionSupported,
  });

  let mediaStream: MediaStream | null = null;
  let pc: RTCPeerConnection | null = null;
  let dc: RTCDataChannel | null = null;
  let closed = false;
  const stop = () => {
    if (closed) return;
    closed = true;
    try { dc?.close(); } catch { /* ignore */ }
    try { pc?.close(); } catch { /* ignore */ }
    if (mediaStream) {
      for (const track of mediaStream.getTracks()) {
        try { track.stop(); } catch { /* ignore */ }
      }
    }
    callbacks.onClose?.('stopped');
  };

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    realtimeLog('microphone-ready', {
      traceId: session.traceId,
      audioTracks: mediaStream.getAudioTracks().length,
    });

    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

    const audioTrack = mediaStream.getAudioTracks()[0];
    if (!audioTrack) throw new RealtimeUnavailableError('no_audio_track', 0);
    pc.addTrack(audioTrack, mediaStream);

    // Аккумулируем delta'ы текущего сегмента, чтобы UI получал растущий
    // interim, а не голые чанки. На .completed — сбрасываем буфер.
    let interimBuffer = '';
    // P0 hotfix — instrumentation. После реального звонка 2026-04-08
    // обнаружили, что UI содержал лишь 2 сегмента вместо ~15. Без диагностики
    // невозможно понять: модель прислала мало completed-событий или они
    // дропнулись где-то в pipeline. Считаем все события сегмента, чтобы
    // ops видели в console.debug точный картину «event types per session».
    let finalSegmentCount = 0;
    let deltaCount = 0;
    dc = pc.createDataChannel('oai-events');
    dc.onopen = () => realtimeLog('data-channel-open', { traceId: session.traceId });
    dc.onclose = () => realtimeLog('data-channel-close', {
      traceId: session.traceId,
      readyState: dc?.readyState,
      // P0 hotfix — log session summary on close. Ops can diff
      // finalSegmentCount with what's actually saved to verify pipeline.
      finalSegmentCount,
      deltaCount,
    });
    dc.onerror = () => realtimeLog('data-channel-error', {
      traceId: session.traceId,
      readyState: dc?.readyState,
    });
    dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as RealtimeEvent;
        if (msg.type && !TRANSCRIPT_EVENT_TYPES.has(msg.type)) {
          realtimeLog('event', { traceId: session.traceId, type: msg.type });
        }
        if (msg.type === 'conversation.item.input_audio_transcription.delta') {
          if (typeof msg.delta === 'string' && msg.delta.length) {
            interimBuffer += msg.delta;
            deltaCount++;
            callbacks.onInterim(interimBuffer);
          }
          return;
        }
        if (msg.type === 'conversation.item.input_audio_transcription.completed') {
          const rawTranscript = typeof msg.transcript === 'string' ? msg.transcript.trim() : '';
          // Snapshot interim BEFORE we reset it — needed for the
          // interim-vs-final mutation diff (P0.3).
          const interimSnapshot = interimBuffer;
          interimBuffer = '';
          if (rawTranscript.length) {
            finalSegmentCount++;
            // Sprint 58 P0.1/P0.2 — assign segmentId at the FIRST stage
            // (raw_received). All downstream stages reuse this same ID
            // so we can trace one phrase end-to-end via getSegmentLifecycle.
            const segmentId = newSegmentId();
            recordLifecycle({
              segmentId,
              sessionId: session.traceId ?? 'unknown',
              source: 'realtime',
              stage: 'raw_received',
              status: 'ok',
              text: rawTranscript,
            });
            // Sprint 53 Voice QA — нормализуем известные мис-распознавания
            // брендов («ГласНаб» → «Главснаб» и т.п.) до того как сегмент
            // попадает в UI / в analyze-payload.
            const normalized = normalizeTranscript(rawTranscript);
            recordLifecycle({
              segmentId,
              sessionId: session.traceId ?? 'unknown',
              source: 'realtime',
              stage: 'normalized',
              status: 'ok',
              text: normalized,
              ...(normalized !== rawTranscript ? { reason: 'brand_normalize_applied' } : {}),
            });
            // Sprint 58 P0.3 — interim-vs-final mutation diff.
            // High mutation = OpenAI rewrote what it heard. Surfaces silent
            // paraphrasing. Threshold + suspicious flag inside helper.
            if (interimSnapshot) {
              const diff = compareInterimVsFinal(interimSnapshot, normalized);
              if (diff.suspiciousMutation) {
                console.warn('[transcription/interim-final-mutation]', {
                  segmentId,
                  sessionId: session.traceId,
                  similarity: diff.similarity.toFixed(3),
                  mutationRatio: diff.mutationRatio.toFixed(3),
                  interimChars: diff.interimChars,
                  finalChars: diff.finalChars,
                  interimPreview: interimSnapshot.slice(0, 60),
                  finalPreview: normalized.slice(0, 60),
                });
              }
            }
            callbacks.onFinal(normalized, segmentId);
          } else {
            try {
              console.debug('[transcription/segment-dropped]', {
                traceId: session.traceId,
                idx: finalSegmentCount,
                reason: 'empty_completed_event',
              });
            } catch { /* ignore */ }
          }
          // После завершения сегмента очищаем interim в UI.
          callbacks.onInterim('');
          return;
        }
        if (msg.type === 'error') {
          realtimeLog('server-error-event', {
            traceId: session.traceId,
            code: msg.error?.code,
            type: msg.error?.type,
            message: msg.error?.message?.slice(0, 160),
          });
          callbacks.onError(new Error(msg.error?.message ?? 'openai_realtime_error'));
        }
      } catch {
        // Не-JSON события игнорируем (keepalive и т.п.).
      }
    };

    pc.onconnectionstatechange = () => {
      if (!pc) return;
      realtimeLog('connection-state', {
        traceId: session.traceId,
        connectionState: pc.connectionState,
      });
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        if (!closed) callbacks.onError(new Error(`webrtc_${pc.connectionState}`));
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (!pc) return;
      realtimeLog('ice-state', {
        traceId: session.traceId,
        iceConnectionState: pc.iceConnectionState,
      });
    };
    pc.onsignalingstatechange = () => {
      if (!pc) return;
      realtimeLog('signaling-state', {
        traceId: session.traceId,
        signalingState: pc.signalingState,
      });
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    realtimeLog('sdp-exchange-start', {
      traceId: session.traceId,
      endpoint: '/v1/realtime/calls',
      model: session.model,
    });
    const sdpResponse = await fetch(REALTIME_CALLS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.clientSecret}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    });
    if (!sdpResponse.ok) {
      const text = await sdpResponse.text().catch(() => '');
      realtimeLog('sdp-exchange-failed', {
        traceId: session.traceId,
        status: sdpResponse.status,
        bodyPreview: text.slice(0, 180),
      });
      throw new RealtimeUnavailableError('sdp_exchange_failed', sdpResponse.status, text.slice(0, 240));
    }
    const answer = { type: 'answer' as const, sdp: await sdpResponse.text() };
    await pc.setRemoteDescription(answer);
    realtimeLog('sdp-exchange-complete', { traceId: session.traceId });

    return { stop, info: session, mediaStream };
  } catch (err) {
    stop();
    if (err instanceof RealtimeUnavailableError) throw err;
    const msg = err instanceof Error ? err.message : 'unknown';
    throw new RealtimeUnavailableError('connection_failed', 0, msg);
  }
}

interface RealtimeEvent {
  type?: string;
  delta?: string;
  transcript?: string;
  error?: { code?: string; message?: string; type?: string };
}

const TRANSCRIPT_EVENT_TYPES = new Set([
  'conversation.item.input_audio_transcription.delta',
  'conversation.item.input_audio_transcription.completed',
]);
