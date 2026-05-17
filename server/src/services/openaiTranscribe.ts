import { prisma } from '../db.js';
import { env } from '../env.js';
import type { TranscriptionResult } from './deepgramClient.js';
import { normalizeTranscript } from '../lib/transcriptNormalize.js';

// Sprint 49 — server-side OpenAI gpt-4o-transcribe (request-based, не Realtime).
// Используется для загруженных аудиофайлов: pre-recorded transcription у OpenAI
// дешевле, точнее по русскому языку и принимает тот же словарь терминов через
// `prompt`, что live-канал. Realtime API намеренно НЕ используется для файлов:
// 60-секундный ephemeral key короче типичной длины загруженной записи.
//
// Шаблон `realtime_transcription` хранит словарь. Если шаблон отсутствует —
// транскрибируем без prompt'а (модель всё равно справляется, просто без
// бизнес-имён в приоритете распознавания).

const OPENAI_TRANSCRIPTIONS_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const REQUEST_TIMEOUT_MS = 90_000;
const REALTIME_TEMPLATE_KEY = 'realtime_transcription';

export interface OpenAITranscribeOptions {
  mimeType?: string;
  fileName?: string;
}

export async function transcribeAudioOpenAI(
  buffer: Buffer,
  opts: OpenAITranscribeOptions = {},
): Promise<TranscriptionResult | null> {
  if (!env.OPENAI_API_KEY || env.OPENAI_API_KEY.length < 10) return null;
  if (!buffer || buffer.byteLength === 0) return null;

  const tpl = await prisma.promptTemplate.findFirst({
    where: { key: REALTIME_TEMPLATE_KEY },
  });
  const promptText = tpl?.active && tpl.body && tpl.body.trim().length >= 50
    ? tpl.body.trim().slice(0, 4_000)
    : null;
  const model = (tpl?.model && tpl.model.trim()) || env.OPENAI_MODEL_TRANSCRIBE;

  const fileName = opts.fileName || `audio.${mimeToExt(opts.mimeType)}`;
  const blob = new Blob([new Uint8Array(buffer)], { type: opts.mimeType || 'audio/mpeg' });
  const form = new FormData();
  form.append('file', blob, fileName);
  form.append('model', model);
  form.append('language', 'ru');
  form.append('response_format', 'json');
  if (promptText) form.append('prompt', promptText);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(OPENAI_TRANSCRIPTIONS_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: form as unknown as BodyInit,
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await safeText(res);
      console.warn(`[openai-transcribe] ${res.status} ${res.statusText}: ${errText.slice(0, 240)}`);
      return null;
    }
    const json = (await res.json()) as { text?: string };
    const rawText = (json.text ?? '').trim();
    if (!rawText) return null;
    // Sprint 53 Voice QA — нормализуем известные brand mis-recognitions
    // («ГласНаб» → «Главснаб» и т.п.) до того как transcript попадает
    // в conversationAnalysis или persistSession. Это закрывает gap, что
    // OpenAI prompt-словарь — bias, не enforce.
    const text = normalizeTranscript(rawText);
    return {
      text,
      provider: 'openai',
      model,
      durationSec: null,
      fellBackToMock: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn(`[openai-transcribe] failed: ${msg}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function mimeToExt(mime: string | undefined): string {
  if (!mime) return 'mp3';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('m4a') || mime.includes('mp4')) return 'm4a';
  if (mime.includes('flac')) return 'flac';
  return 'mp3';
}

async function safeText(r: Response): Promise<string> {
  try { return await r.text(); } catch { return ''; }
}
