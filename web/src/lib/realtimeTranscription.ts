import { api } from './api';
import { normalizeTranscript } from './transcriptNormalize';
import {
  newSegmentId,
  recordLifecycle,
  compareInterimVsFinal,
} from './transcriptPipeline';
import { createRealtimeTimingTrace, type RealtimeTimingTrace } from './realtimeTiming';
import { reconcileTruncatedFinal } from './transcriptReconcile';
import { detectPromptLeakage } from './promptLeakageFilter';

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
  // Sprint 67 - gpt-live-transcribe streams continuously without server VAD;
  // the server tells the browser to close turns itself (input_audio_buffer.commit).
  clientCommitRequired?: boolean;
  clientSilenceMs?: number;
  clientIdleMs?: number;
  clientMaxTurnMs?: number;
  delay?: string | null;
  keywordsCount?: number;
}

function clampNumber(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
  return Math.min(max, Math.max(min, n));
}

export interface RealtimeStartOptions {
  /**
   * Sprint 67 - AudioContext created synchronously inside the user's click
   * (iOS keeps a context created outside a gesture suspended, and then the
   * mic-level endpointer would never see audio). The session owns it from
   * here on and closes it on stop().
   */
  audioContext?: AudioContext | null;
}

/** Create an AudioContext right now (call from a click handler). Null when unsupported. */
export function createGestureAudioContext(): AudioContext | null {
  try {
    const w = window as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

// Microphone level meter for client-side endpointing. Reads RMS from an
// AnalyserNode; level() returns 0 while the graph is not running (suspended
// context), which the caller treats as «no mic signal, use the delta-idle fallback».
interface MicLevelMeter {
  level(): number;
  stop(): void;
}

function startMicLevelMeter(stream: MediaStream, external: AudioContext | null | undefined): MicLevelMeter | null {
  const ctx = external ?? createGestureAudioContext();
  if (!ctx) return null;
  let source: MediaStreamAudioSourceNode;
  let analyser: AnalyserNode;
  try {
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
  } catch {
    if (!external) void ctx.close().catch(() => undefined);
    return null;
  }
  const buf = new Float32Array(analyser.fftSize);
  return {
    level() {
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i];
      return Math.sqrt(sum / buf.length);
    },
    stop() {
      try { source.disconnect(); } catch { /* ignore */ }
      void ctx.close().catch(() => undefined);
    },
  };
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
  options: RealtimeStartOptions = {},
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
    clientCommitRequired: session.clientCommitRequired,
    delay: session.delay,
    keywordsCount: session.keywordsCount,
  });

  let mediaStream: MediaStream | null = null;
  let pc: RTCPeerConnection | null = null;
  let dc: RTCDataChannel | null = null;
  let closed = false;
  let endpointTimer: number | null = null;
  let micMeter: MicLevelMeter | null = null;
  const stop = () => {
    if (closed) return;
    closed = true;
    if (endpointTimer !== null) { clearInterval(endpointTimer); endpointTimer = null; }
    if (micMeter) { try { micMeter.stop(); } catch { /* ignore */ } micMeter = null; }
    else if (options.audioContext) { void options.audioContext.close().catch(() => undefined); }
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
    // Interim text per OpenAI item. Deltas carry item_id even before the
    // commit and the next turn arrives under a new id, so a .completed clears
    // only its own item and never the text of a turn that already started
    // (Codex review F2). interimBuffer stays the joined view for the UI.
    const itemText = new Map<string, string>();
    const itemFirstDeltaAt = new Map<string, number>();
    const committedItems = new Set<string>();
    const FALLBACK_ITEM_ID = '__item__';
    const joinedInterim = (): string => Array.from(itemText.values()).join('');
    const oldestItemId = (): string | null => {
      const first = itemText.keys().next();
      return first.done ? null : first.value;
    };
    // Text of items not yet committed: what the next commit would cover.
    const pendingText = (): string => {
      let out = '';
      for (const [id, text] of itemText) if (!committedItems.has(id)) out += text;
      return out;
    };
    const pendingTurnStartedAt = (): number => {
      for (const [id, at] of itemFirstDeltaAt) if (!committedItems.has(id)) return at;
      return 0;
    };
    let interimBuffer = '';
    // Sprint 67 - client-side endpointing for gpt-live-transcribe. The model
    // streams deltas while the person talks and never closes a turn by
    // itself: without a commit the text would stay one growing interim line.
    // Primary signal: microphone level. After clientSilenceMs of quiet with
    // pending text we send input_audio_buffer.commit; the .completed event
    // (~0.7 s later) lands through the regular final path. The commit must
    // be quick: audio captured after it belongs to the next turn, so a late
    // commit cuts the next phrase mid-word (seen with a delta-idle scheme
    // that fired ~1.9 s after speech ended). Fallback when the audio graph
    // reports no level at all: commit after clientIdleMs without deltas.
    // A monologue longer than clientMaxTurnMs is committed at a sentence end.
    const clientCommit = session.clientCommitRequired === true;
    const clientSilenceMs = clampNumber(session.clientSilenceMs, 300, 3000, 700);
    const clientIdleMs = clampNumber(session.clientIdleMs, 600, 5000, 1400);
    const clientMaxTurnMs = clampNumber(session.clientMaxTurnMs, 5000, 120_000, 20_000);
    // Mic level: speech starts above max(SPEECH_RMS_MIN, floor*3) and ends
    // below 60% of that (hysteresis). The noise floor adapts ONLY while not
    // speaking and is capped, so steady speech can never raise the threshold
    // above itself and read as silence (Codex review F3).
    const SPEECH_RMS_MIN = 0.012;
    const NOISE_FLOOR_CAP = 0.008;
    // A commit stays in flight until its .completed. If OpenAI never answers,
    // after this timeout the item's own deltas become the final (Codex F1).
    const COMMIT_ACK_TIMEOUT_MS = 8000;
    let lastDeltaAt = 0;
    let commitSentAt = 0;
    let commitItemId: string | null = null;
    let micAlive = false;
    let noiseFloor = 0.003;
    let speaking = false;
    let lastSpeechAt = 0;
    let speechSinceCommit = false;
    if (clientCommit) {
      micMeter = startMicLevelMeter(mediaStream, options.audioContext);
      realtimeLog('endpointer-init', { traceId: session.traceId, micMeter: Boolean(micMeter), clientSilenceMs, clientIdleMs, clientMaxTurnMs });
    } else if (options.audioContext) {
      void options.audioContext.close().catch(() => undefined);
    }
    const sendCommit = (reason: string): void => {
      if (!dc || dc.readyState !== 'open') return;
      if (commitSentAt) return;
      const pendingChars = pendingText().trim().length;
      if (!pendingChars) return;
      try {
        dc.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      } catch {
        return;
      }
      commitSentAt = Date.now();
      commitItemId = null;
      realtimeLog('client-commit', {
        traceId: session.traceId,
        reason,
        pendingChars,
        idleMs: lastDeltaAt ? Date.now() - lastDeltaAt : null,
        silenceMs: lastSpeechAt ? Date.now() - lastSpeechAt : null,
        turnMs: pendingTurnStartedAt() ? Date.now() - pendingTurnStartedAt() : null,
        micAlive,
      });
    };
    const endpointTick = (): void => {
      if (closed) return;
      const now = Date.now();
      if (micMeter) {
        const rms = micMeter.level();
        if (rms > 0) {
          if (!micAlive) {
            micAlive = true;
            realtimeLog('endpointer-mic-alive', { traceId: session.traceId });
          }
          const onThreshold = Math.max(SPEECH_RMS_MIN, noiseFloor * 3);
          if (!speaking && rms > onThreshold) speaking = true;
          else if (speaking && rms < onThreshold * 0.6) speaking = false;
          if (speaking) {
            lastSpeechAt = now;
            speechSinceCommit = true;
          } else {
            noiseFloor = rms < noiseFloor ? Math.max(rms, 0.001) : Math.min(noiseFloor * 1.005, NOISE_FLOOR_CAP);
          }
        }
      }
      if (commitSentAt) {
        if (now - commitSentAt < COMMIT_ACK_TIMEOUT_MS) return;
        const staleId = commitItemId ?? oldestItemId();
        realtimeLog('commit-ack-timeout', { traceId: session.traceId, itemId: staleId, waitedMs: now - commitSentAt });
        commitSentAt = 0;
        commitItemId = null;
        if (staleId) finalizeItem(staleId, '', 'ack_timeout');
        return;
      }
      const pending = pendingText().trim();
      if (!pending) return;
      if (micAlive) {
        if (speechSinceCommit && lastSpeechAt && now - lastSpeechAt >= clientSilenceMs) {
          speechSinceCommit = false;
          sendCommit('silence');
          return;
        }
      } else if (lastDeltaAt && now - lastDeltaAt >= clientIdleMs) {
        sendCommit('idle');
        return;
      }
      const turnStartedAt = pendingTurnStartedAt();
      const turnMs = turnStartedAt ? now - turnStartedAt : 0;
      if (turnMs >= clientMaxTurnMs && /[.!?…]\s*$/u.test(pending)) { speechSinceCommit = false; sendCommit('max-turn'); return; }
      if (turnMs >= clientMaxTurnMs * 2) { speechSinceCommit = false; sendCommit('max-turn-hard'); }
    };
    // One item becomes one final segment. Called from the .completed event
    // and from the commit ack timeout (then transcriptIn is empty and the
    // item's own deltas are used). Only this item's text leaves the interim;
    // text of a turn that already started stays visible.
    const finalizeItem = (itemId: string, transcriptIn: string, origin: 'completed' | 'ack_timeout'): void => {
      let rawTranscript = transcriptIn.trim();
      // Snapshot interim BEFORE we drop it — needed for the
      // interim-vs-final mutation diff (P0.3).
      const interimSnapshot = itemText.get(itemId) ?? '';
      itemText.delete(itemId);
      itemFirstDeltaAt.delete(itemId);
      committedItems.delete(itemId);
      if (commitSentAt && (commitItemId === itemId || commitItemId === null)) {
        commitSentAt = 0;
        commitItemId = null;
      }
      interimBuffer = joinedInterim();
      if (!itemText.size) lastDeltaAt = 0;
      // Sprint 67 - on the live model the interim IS the model's own
      // streamed text for the turn we just committed. An empty .completed
      // (or a missing one) must not erase it: promote the snapshot instead
      // of dropping the segment. Segment-based models keep the old drop,
      // their interim may be noise OpenAI chose to discard.
      if (!rawTranscript.length && clientCommit && interimSnapshot.trim().length) {
        rawTranscript = interimSnapshot.trim();
        realtimeLog(origin === 'completed' ? 'empty-completed-interim-promoted' : 'ack-timeout-interim-promoted', {
          traceId: session.traceId,
          itemId,
          chars: rawTranscript.length,
        });
      }
      // Sprint 62.P9.HOTFIX — leakage guard on final segments. Same
      // check as the interim path. If OpenAI emitted the prompt back
      // as a «completed» event (it CAN happen even when interim deltas
      // were clean if the model decides to flush the whole context),
      // we drop the segment entirely. callbacks.onFinal is NOT called.
      if (rawTranscript.length) {
        const finalLeak = detectPromptLeakage(rawTranscript);
        if (finalLeak.detected) {
          realtimeLog('prompt-leakage-detected', {
            stage: 'final',
            hits: finalLeak.hits,
            matchedSamples: finalLeak.matchedSamples,
            transcriptLen: rawTranscript.length,
          });
          callbacks.onInterim(interimBuffer);
          return;
        }
      }
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
          ...(origin === 'ack_timeout' ? { reason: 'commit_ack_timeout' } : {}),
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
        // buffer we just accumulated (prod case 2026-05-18). Detect and
        // recover by preferring interim text. See reconcileTruncatedFinal.
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
            reason: origin === 'completed' ? 'empty_completed_event' : 'ack_timeout_without_text',
          });
        } catch { /* ignore */ }
      }
      // Text of the next turn (if any) stays on screen as interim.
      callbacks.onInterim(interimBuffer);
    };
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
      realtimeLog('data-channel-open', { traceId: session.traceId, clientCommit, clientSilenceMs, clientIdleMs, clientMaxTurnMs });
      if (clientCommit && endpointTimer === null) {
        endpointTimer = window.setInterval(endpointTick, 100);
      }
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
        if (msg.type === 'input_audio_buffer.committed' && typeof msg.item_id === 'string' && msg.item_id) {
          committedItems.add(msg.item_id);
          if (commitSentAt && !commitItemId) commitItemId = msg.item_id;
        }
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
            // Sprint 62.P9.HOTFIX — prompt leakage guard on interim.
            // OpenAI Realtime can echo `transcription.prompt` back as deltas
            // when the prompt contains imperative prose. We sanitised the
            // server-side prompt (realtimePrompt.ts → dictionary-only), but
            // keep a client-side safety net: if the accumulated interim
            // matches multiple prompt signatures, drop it and reset.
            const candidate = interimBuffer + msg.delta;
            const leakage = detectPromptLeakage(candidate);
            if (leakage.detected) {
              realtimeLog('prompt-leakage-detected', {
                stage: 'interim',
                hits: leakage.hits,
                matchedSamples: leakage.matchedSamples,
                candidateLen: candidate.length,
              });
              // Reset interim buffers so the UI clears any partial leak.
              itemText.clear();
              itemFirstDeltaAt.clear();
              interimBuffer = '';
              callbacks.onInterim('');
              return;
            }
            const itemId = typeof msg.item_id === 'string' && msg.item_id ? msg.item_id : FALLBACK_ITEM_ID;
            const now = Date.now();
            if (!itemText.has(itemId)) itemFirstDeltaAt.set(itemId, now);
            itemText.set(itemId, (itemText.get(itemId) ?? '') + msg.delta);
            interimBuffer = candidate;
            deltaCount++;
            lastDeltaAt = now;
            callbacks.onInterim(interimBuffer);
          }
          return;
        }
        if (msg.type === 'conversation.item.input_audio_transcription.completed') {
          const itemId = typeof msg.item_id === 'string' && msg.item_id
            ? msg.item_id
            : (oldestItemId() ?? FALLBACK_ITEM_ID);
          finalizeItem(itemId, typeof msg.transcript === 'string' ? msg.transcript : '', 'completed');
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
  item_id?: string;
  delta?: string;
  transcript?: string;
  error?: { code?: string; message?: string; type?: string };
}

const TRANSCRIPT_EVENT_TYPES = new Set([
  'conversation.item.input_audio_transcription.delta',
  'conversation.item.input_audio_transcription.completed',
]);
