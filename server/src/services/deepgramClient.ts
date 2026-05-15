import { env } from '../env.js';

// Thin wrapper over Deepgram pre-recorded transcription API.
// Uses global fetch (Node 22) — no SDK needed, keeps deps lean.
//
// Reference: https://developers.deepgram.com/reference/listen-file
// We send audio binary → Deepgram returns JSON with diarized utterances.
// On failure or missing API key we fall back to a deterministic mock so the
// product never blocks the user on infra issues during demo.

export interface TranscriptionResult {
  text: string;
  // Sprint 49 — добавили 'openai' (gpt-4o-transcribe) как primary provider
  // загруженных файлов. Deepgram остаётся fallback'ом для legacy/dev сетапов.
  provider: 'openai' | 'deepgram' | 'mock';
  model: string;
  durationSec: number | null;
  fellBackToMock: boolean;
  speakers?: number;
}

export interface TranscribeOptions {
  mimeType?: string;
  language?: string;
  diarize?: boolean;
}

const DEEPGRAM_ENDPOINT = 'https://api.deepgram.com/v1/listen';
const REQUEST_TIMEOUT_MS = 90_000;

export async function transcribeAudio(buffer: Buffer, opts: TranscribeOptions = {}): Promise<TranscriptionResult> {
  if (!env.DEEPGRAM_API_KEY) {
    console.warn('[deepgram] no API key — using mock transcript');
    return mockTranscript();
  }
  if (!buffer || buffer.byteLength === 0) {
    return mockTranscript();
  }

  const params = new URLSearchParams({
    model: env.DEEPGRAM_MODEL,
    language: opts.language ?? 'ru',
    punctuate: 'true',
    smart_format: 'true',
    diarize: String(opts.diarize ?? true),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${DEEPGRAM_ENDPOINT}?${params.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        'Content-Type': opts.mimeType || 'audio/mpeg',
      },
      // Cast to BodyInit — Node fetch accepts Buffer directly.
      body: buffer as unknown as BodyInit,
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await safeText(res);
      console.warn(`[deepgram] ${res.status} ${res.statusText}: ${errText.slice(0, 240)}`);
      return mockTranscript(true);
    }
    const json = (await res.json()) as DeepgramResponse;
    const channels = json.results?.channels ?? [];
    const alt = channels[0]?.alternatives?.[0];
    const text = alt?.transcript?.trim() ?? '';
    if (!alt || !text) {
      console.warn('[deepgram] empty transcript');
      return mockTranscript(true);
    }
    return {
      text,
      provider: 'deepgram',
      model: env.DEEPGRAM_MODEL,
      durationSec: json.metadata?.duration ?? null,
      fellBackToMock: false,
      speakers: alt.words ? countSpeakers(alt.words) : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn(`[deepgram] failed: ${msg}`);
    return mockTranscript(true);
  } finally {
    clearTimeout(timer);
  }
}

// Deterministic mock transcript that exercises every downstream analyzer branch:
// SPIN-stage detection, objection keywords, materials request, buying signals.
function mockTranscript(fellBack = false): TranscriptionResult {
  const text = [
    'Менеджер: Добрый день. Расскажите коротко про ваш текущий портфель — что обычно рассматриваете?',
    'Инвестор: В основном недвижимость и облигации. Сейчас ищу что-то более доходное.',
    'Менеджер: Понял. У нас как раз есть кейс с понятной экономикой — могу рассказать?',
    'Инвестор: Да, расскажите. Меня волнует ликвидность и насколько рискованно.',
    'Менеджер: Базовый сценарий — окупаемость 2 года, доходность около 35-40 процентов. Чек от 1 миллиона.',
    'Инвестор: Хм. А что с гарантиями и как я могу выйти из сделки?',
    'Менеджер: Есть механика выхода через выкуп доли. Подробнее можем разобрать на следующей встрече.',
    'Инвестор: Окей. Пришлите финансовую модель и презентацию. Если все совпадет с тем что вы говорите — готов обсуждать чек 3 миллиона.',
    'Менеджер: Отлично. Отправлю сегодня. Когда удобно созвониться?',
    'Инвестор: На следующей неделе во вторник, после обеда.',
  ].join('\n');
  return {
    text,
    provider: 'mock',
    model: 'mock-v1',
    durationSec: 320,
    fellBackToMock: fellBack,
    speakers: 2,
  };
}

interface DeepgramWord { speaker?: number }
interface DeepgramAlternative { transcript?: string; words?: DeepgramWord[] }
interface DeepgramChannel { alternatives?: DeepgramAlternative[] }
interface DeepgramResponse {
  results?: { channels?: DeepgramChannel[] };
  metadata?: { duration?: number };
}

function countSpeakers(words: DeepgramWord[]): number {
  const speakers = new Set<number>();
  for (const w of words) {
    if (typeof w.speaker === 'number') speakers.add(w.speaker);
  }
  return speakers.size || 1;
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ''; }
}
