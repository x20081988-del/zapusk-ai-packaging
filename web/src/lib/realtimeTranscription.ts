import { api } from './api';

// Sprint 49 — OpenAI Realtime live transcription через WebRTC.
//
// Контракт:
//   1. Сервер /api/realtime/transcription-session выдаёт ephemeral client secret
//      (короткоживущий, 60 секунд) — основной OPENAI_API_KEY никогда не уходит
//      в браузер.
//   2. Браузер открывает RTCPeerConnection к https://api.openai.com/v1/realtime
//      с этим секретом, шлёт SDP offer, получает answer.
//   3. Один audio track (mic) + один data channel "oai-events".
//   4. Из data channel приходят события transcription:
//        conversation.item.input_audio_transcription.delta  — partial
//        conversation.item.input_audio_transcription.completed — final
//   5. На любую ошибку — promise reject; вызывающий код переключается на
//      Web Speech API fallback.

const REALTIME_BASE_URL = 'https://api.openai.com/v1/realtime';
const SESSION_ENDPOINT = '/api/realtime/transcription-session';

export interface RealtimeSessionInfo {
  clientSecret: string;
  model: string;
  expiresAt: number | null;
  templateVersion: number;
}

export interface RealtimeCallbacks {
  /** Partial / delta transcript для текущего сегмента. */
  onInterim: (text: string) => void;
  /** Финальный сегмент (закончившаяся реплика). */
  onFinal: (text: string) => void;
  /** Ошибка после успешного подключения — UI должен переключиться на fallback. */
  onError: (err: Error) => void;
  /** Закрытие соединения (по stop() или со стороны OpenAI). */
  onClose?: () => void;
}

export interface RealtimeSession {
  /** Корректно завершает соединение (release mic + закрывает PC). */
  stop: () => void;
  /** Технические данные текущей сессии — для UI badge. */
  info: RealtimeSessionInfo;
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
    callbacks.onClose?.();
  };

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

    const audioTrack = mediaStream.getAudioTracks()[0];
    if (!audioTrack) throw new RealtimeUnavailableError('no_audio_track', 0);
    pc.addTrack(audioTrack, mediaStream);

    // Аккумулируем delta'ы текущего сегмента, чтобы UI получал растущий
    // interim, а не голые чанки. На .completed — сбрасываем буфер.
    let interimBuffer = '';
    dc = pc.createDataChannel('oai-events');
    dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as RealtimeEvent;
        if (msg.type === 'conversation.item.input_audio_transcription.delta') {
          if (typeof msg.delta === 'string' && msg.delta.length) {
            interimBuffer += msg.delta;
            callbacks.onInterim(interimBuffer);
          }
          return;
        }
        if (msg.type === 'conversation.item.input_audio_transcription.completed') {
          interimBuffer = '';
          if (typeof msg.transcript === 'string' && msg.transcript.trim().length) {
            callbacks.onFinal(msg.transcript.trim());
          }
          // После завершения сегмента очищаем interim в UI.
          callbacks.onInterim('');
          return;
        }
        if (msg.type === 'error') {
          callbacks.onError(new Error(msg.error?.message ?? 'openai_realtime_error'));
        }
      } catch {
        // Не-JSON события игнорируем (keepalive и т.п.).
      }
    };

    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        if (!closed) callbacks.onError(new Error(`webrtc_${pc.connectionState}`));
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpResponse = await fetch(`${REALTIME_BASE_URL}?model=${encodeURIComponent(session.model)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.clientSecret}`,
        'Content-Type': 'application/sdp',
        'OpenAI-Beta': 'realtime=v1',
      },
      body: offer.sdp,
    });
    if (!sdpResponse.ok) {
      const text = await sdpResponse.text().catch(() => '');
      throw new RealtimeUnavailableError('sdp_exchange_failed', sdpResponse.status, text.slice(0, 240));
    }
    const answer = { type: 'answer' as const, sdp: await sdpResponse.text() };
    await pc.setRemoteDescription(answer);

    return { stop, info: session };
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
  error?: { message?: string };
}
