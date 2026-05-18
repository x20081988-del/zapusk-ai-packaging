import { api } from './api';
import { normalizeTranscript } from './transcriptNormalize';
import {
  newSegmentId,
  recordLifecycle,
  compareInterimVsFinal,
} from './transcriptPipeline';
import { createRealtimeTimingTrace, type RealtimeTimingTrace } from './realtimeTiming';
import { reconcileTruncatedFinal } from './transcriptReconcile';

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

/**
 * Sprint 62 P0 — Realtime connection phase. Surfaces the silent setup
 * period to the UI so user sees what's happening between «Начать
 * прослушивание» click and first transcript token. Reported issue:
 * «транскрипция стоит пустой долго, потом резко появляется текст» —
 * root cause was the silent WebRTC+ASR setup (1-3 sec) with no visual feedback.
 */
export type RealtimeConnectionPhase =
  | 'requesting_session'
  | 'requesting_mic'
  | 'mic_ready'
  | 'sdp_exchange'
  | 'data_channel_open'
  | 'awaiting_first_audio'
  | 'first_audio_received';

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
  /**
   * Sprint 62 P0 — Phase progression. Fires synchronously when the
   * pipeline advances. Caller maps to a user-facing label. Idempotent
   * per phase: never fires the same phase twice for one session.
   */
  onPhase?: (phase: RealtimeConnectionPhase) => void;
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
  /**
   * Sprint 62 P0 — Timing trace exposed so React side can mark UI-side
   * milestones (firstInterimRender / firstFinalRender) and read snapshot
   * for diagnostics.
   */
  timing: RealtimeTimingTrace;
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

  // Sprint 62 P0 — start timing trace BEFORE any network call so we capture
  // the full "press button → ready to listen" latency.
  const timing = createRealtimeTimingTrace(`local-${Math.random().toString(36).slice(2, 10)}`);
  timing.mark('sessionRequested');
  // Sprint 62 P0 — phase callback is idempotent per session via a Set.
  const seenPhases = new Set<RealtimeConnectionPhase>();
  const phase = (p: RealtimeConnectionPhase): void => {
    if (seenPhases.has(p)) return;
    seenPhases.add(p);
    try { callbacks.onPhase?.(p); } catch { /* never let UI throw break realtime */ }
  };
  phase('requesting_session');

  const session = await fetchSession();
  timing.mark('sessionIssued', { traceId: session.traceId, model: session.model });
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
    // Sprint 62 P0 — emit timing summary on session end.
    timing.finalize('stopped');
    callbacks.onClose?.('stopped');
  };

  try {
    // Sprint 59 P0.1 + P0.3 — Audio capture configuration audit.
    //
    // Default constraints (Sprint 49+):
    //   • echoCancellation: true  — speakers→mic feedback removal
    //   • noiseSuppression: true  — background noise filter
    //   • autoGainControl: true   — auto-volume normalization
    //
    // Risks (documented for Sprint 59 P0.3 audit):
    //   • AGC can flatten emphasis cues + amplify silence noise
    //   • Noise suppression can eat quiet syllables / soft investors
    //   • Echo cancellation can drop consonants when playback present
    //
    // Sprint 59 escape hatch: if user sets localStorage
    //   'zapusk.transcription.rawAudio' = '1'
    // we request a RAW stream (no AGC/NS/EC). For QA-style runs on
    // pristine input where we want to measure baseline.
    let constraints: MediaTrackConstraints;
    let rawAudioMode = false;
    try {
      if (typeof localStorage !== 'undefined'
        && localStorage.getItem('zapusk.transcription.rawAudio') === '1') {
        rawAudioMode = true;
        constraints = {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        };
      } else {
        constraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };
      }
    } catch {
      constraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    }
    timing.mark('micRequested');
    phase('requesting_mic');
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
    const audioTrack = mediaStream.getAudioTracks()[0];
    if (!audioTrack) throw new RealtimeUnavailableError('no_audio_track', 0);
    timing.mark('micReady', { deviceLabel: audioTrack.label.slice(0, 60) });
    phase('mic_ready');

    // Sprint 59 P0.1 — log EXACTLY what the browser actually negotiated.
    // Constraints we passed are the REQUEST; getSettings() is what the
    // device delivered. They can differ on Bluetooth headsets / external
    // mics. Without this we can't debug «my voice came in too quiet».
    const settings = audioTrack.getSettings();
    const capabilities = typeof audioTrack.getCapabilities === 'function'
      ? audioTrack.getCapabilities()
      : null;
    try {
      console.debug('[audio/input-config]', {
        traceId: session.traceId,
        rawAudioMode,
        requested: constraints,
        actual: {
          deviceId: settings.deviceId,
          deviceLabel: audioTrack.label,
          sampleRate: settings.sampleRate,
          sampleSize: settings.sampleSize,
          channelCount: settings.channelCount,
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl,
          // `latency` is in MediaTrackSettings on Chrome (audio output
          // delay in seconds) but not in TS lib types — index via cast.
          latency: (settings as { latency?: number }).latency,
        },
        capabilities: capabilities ? {
          sampleRate: capabilities.sampleRate,
          channelCount: capabilities.channelCount,
        } : null,
        browser: navigator.userAgent.slice(0, 120),
      });
    } catch { /* ignore */ }
    realtimeLog('microphone-ready', {
      traceId: session.traceId,
      audioTracks: mediaStream.getAudioTracks().length,
      deviceLabel: audioTrack.label.slice(0, 60),
      sampleRate: settings.sampleRate,
      channelCount: settings.channelCount,
    });

    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

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
    dc.onopen = () => {
      timing.mark('dataChannelOpen');
      phase('data_channel_open');
      // Sprint 62 P0 — once data-channel is open the only thing left is
      // OpenAI producing the first delta. Show explicit «слушаю, говорите»
      // hint so user knows the system is ready to receive audio.
      phase('awaiting_first_audio');
      realtimeLog('data-channel-open', { traceId: session.traceId });
    };
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
          // Sprint 59 P0.8 — structured session-event log. Tag everything
          // non-transcript from OpenAI so we can spot session.created /
          // session.updated / .closed / .error event timing without
          // noise from transcript deltas. Don't blow up on missing
          // session.created field; OpenAI doesn't always send it for
          // transcription-only sessions.
          try {
            console.debug('[audio/session-event]', {
              traceId: session.traceId,
              type: msg.type,
            });
          } catch { /* ignore */ }
          realtimeLog('event', { traceId: session.traceId, type: msg.type });
        }
        if (msg.type === 'conversation.item.input_audio_transcription.delta') {
          if (typeof msg.delta === 'string' && msg.delta.length) {
            // Sprint 62 P0 — first delta is the moment user-input audio first
            // got transcribed by OpenAI. Critical latency boundary.
            if (deltaCount === 0) {
              timing.mark('firstDelta', { deltaChars: msg.delta.length });
              phase('first_audio_received');
            }
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
            // Sprint 62 P0 — first final segment milestone.
            if (finalSegmentCount === 0) {
              timing.mark('firstFinal', { chars: rawTranscript.length });
            }
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
            // Sprint 62.HOTFIX P0.1 — interim/final truncation reconciliation.
            // OpenAI Realtime occasionally returns a .completed with a
            // dramatically truncated transcript relative to the interim
            // buffer we just accumulated (prod case 2026-05-18: said
            // «Здравствуйте, меня зовут Григорий, проверяю транскрипцию»,
            // got «Транскрипция»). Detect and recover by preferring
            // interim text. See reconcileTruncatedFinal for gates.
            const reconciled = reconcileTruncatedFinal(interimSnapshot, normalized);
            const toAppend = reconciled.text;
            if (reconciled.recovered) {
              recordLifecycle({
                segmentId,
                sessionId: session.traceId ?? 'unknown',
                source: 'realtime',
                stage: 'normalized',
                status: 'ok',
                text: toAppend,
                reason: `truncation_recovered: interim=${interimSnapshot.length}c final=${normalized.length}c ratio=${reconciled.ratio.toFixed(1)}`,
              });
              try {
                console.warn('[transcription/truncation-recovered]', {
                  segmentId,
                  sessionId: session.traceId,
                  interimChars: interimSnapshot.length,
                  finalChars: normalized.length,
                  ratio: reconciled.ratio.toFixed(2),
                  interimPreview: interimSnapshot.slice(0, 80),
                  finalPreview: normalized.slice(0, 80),
                });
              } catch { /* ignore */ }
            }
            // Sprint 58 P0.3 — interim-vs-final mutation diff (kept).
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
            callbacks.onFinal(toAppend, segmentId);
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

    timing.mark('sdpExchangeStart');
    phase('sdp_exchange');
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
    timing.mark('sdpExchangeDone');
    realtimeLog('sdp-exchange-complete', { traceId: session.traceId });

    return { stop, info: session, mediaStream, timing };
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
