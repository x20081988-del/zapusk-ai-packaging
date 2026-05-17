// Sprint 54 P0 — Hybrid transcription: clean final transcript service.
//
// Realtime WebRTC дёшево, но галлюцинирует на слабом аудио. Поэтому после
// финализации мы (если есть recorded дорожка) запускаем повторную
// транскрипцию через gpt-4o-transcribe — это медленнее, но точнее.
// Результат сохраняется отдельно с пометкой `transcriptQualityStatus='clean'`.
//
// Этот сервис тонкая обёртка над уже существующим `transcribeAudioOpenAI`
// (server/src/services/openaiTranscribe). Здесь добавляется:
//   • brand normalization (тот же, что live path);
//   • явный статус (clean / failed / not_available);
//   • persistence в SalesSession.
//
// Гарантии:
//   • Никогда не возвращает raw OpenAI ошибки наружу.
//   • Никогда не перетирает draft transcript БЕЗ успешной clean.
//   • Если transcribe вернул null/ошибку → status='failed', draft не трогаем.

import { prisma } from '../db.js';
import { transcribeAudioOpenAI } from './openaiTranscribe.js';
import { normalizeTranscript } from '../lib/transcriptNormalize.js';

export type TranscriptSource = 'realtime_draft' | 'offline_clean' | 'uploaded_audio' | 'manual';
export type TranscriptQualityStatus = 'draft' | 'clean' | 'failed' | 'not_available';

export interface CleanTranscriptResult {
  status: TranscriptQualityStatus;
  // Если status='clean' — содержит финальный текст с применёнными
  // brand-нормализациями. Иначе null.
  text: string | null;
  provider: string | null;
  model: string | null;
  // Latency для диагностики.
  latencyMs: number;
  // Reason при failure (логируется, не показывается пользователю).
  reason?: string;
}

interface RunInput {
  buffer: Buffer;
  mimeType?: string;
  fileName?: string;
}

// Запускает offline transcription через gpt-4o-transcribe + нормализацию.
// Не пишет в DB — возвращает результат. Caller'у решать, сохранять ли его.
export async function runCleanTranscription(input: RunInput): Promise<CleanTranscriptResult> {
  const started = Date.now();
  if (!input.buffer || input.buffer.byteLength === 0) {
    return {
      status: 'not_available',
      text: null,
      provider: null,
      model: null,
      latencyMs: Date.now() - started,
      reason: 'empty_buffer',
    };
  }
  try {
    const r = await transcribeAudioOpenAI(input.buffer, {
      mimeType: input.mimeType,
      fileName: input.fileName,
    });
    if (!r || !r.text || !r.text.trim()) {
      return {
        status: 'failed',
        text: null,
        provider: r?.provider ?? null,
        model: r?.model ?? null,
        latencyMs: Date.now() - started,
        reason: 'empty_response',
      };
    }
    // openaiTranscribe already applies normalizeTranscript on its output
    // (Sprint 53 Voice QA). Calling it again here is idempotent + future-
    // proof if anyone refactors the call chain.
    const text = normalizeTranscript(r.text.trim());
    return {
      status: 'clean',
      text,
      provider: r.provider,
      model: r.model,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn(`[clean-transcript] failed: ${msg.slice(0, 200)}`);
    return {
      status: 'failed',
      text: null,
      provider: null,
      model: null,
      latencyMs: Date.now() - started,
      reason: msg.slice(0, 100),
    };
  }
}

// Записывает clean transcript в SalesSession.
//
// Sprint 55 P0 — provenance flow:
//   1. Перед заменой `transcript` сохраняем оригинал в `draftTranscript`
//      (только если draftTranscript ещё пуст — не перетираем уже
//      сохранённый draft при ретрае).
//   2. Replace transcript content + sets source='offline_clean' + status='clean'.
//   3. NOTE: AI artifacts (summary, objections и пр.) пока остаются
//      draft-derived. recomputeFromCleanTranscript() — отдельный шаг,
//      вызывается caller'ом сразу после этого update'а.
//
// Sprint 60 P0.4 — Immutability guard.
//   После того как clean transcript однажды установлен (transcriptFrozenAt
//   != null), повторный вызов persistCleanTranscript() с другим content
//   просто LOG'ируется и не пишет в DB. Это защищает от случайного
//   перезаписывания canonical-источника правды (например, если оператор
//   загрузил кусок аудио, потом перезалил случайно — первая транскрипция
//   wins). Для intentional re-transcription смотри recomputeFromCleanTranscript
//   manual endpoint.
//
// На failure — обновляем только статус, не трогаем transcript content.
export async function persistCleanTranscript(
  sessionId: string,
  result: CleanTranscriptResult,
  audioStoragePath?: string | null,
): Promise<void> {
  if (result.status === 'clean' && result.text) {
    // Sprint 55 P0 — preserve draft before clean replaces it. Только если
    // draftTranscript ещё null (защита от перезаписи на повторных uploads).
    const current = await prisma.salesSession.findUnique({
      where: { id: sessionId },
      select: { transcript: true, draftTranscript: true, transcriptFrozenAt: true },
    });
    // Sprint 60 P0.4 — Immutability guard.
    if (current?.transcriptFrozenAt) {
      console.log(
        `[clean-transcript] session=${sessionId} ALREADY FROZEN at ${current.transcriptFrozenAt.toISOString()} — ` +
        `refusing to overwrite (immutability guard). Submitted chars=${result.text.length} ignored.`,
      );
      // Update only audioStoragePath if newly provided; no transcript mutation.
      if (audioStoragePath) {
        await prisma.salesSession.update({
          where: { id: sessionId },
          data: { audioStoragePath },
        });
      }
      return;
    }
    const preserveDraft = current && !current.draftTranscript && current.transcript
      ? current.transcript
      : null;
    await prisma.salesSession.update({
      where: { id: sessionId },
      data: {
        transcript: result.text,
        transcriptSource: 'offline_clean',
        transcriptQualityStatus: 'clean',
        ...(preserveDraft ? { draftTranscript: preserveDraft } : {}),
        ...(audioStoragePath ? { audioStoragePath } : {}),
        // Sprint 60 P0.4 — freeze. From this moment forward, clean
        // transcript is canonical and immutable for normal write paths.
        transcriptFrozenAt: new Date(),
      },
    });
    console.log(`[clean-transcript] session=${sessionId} FROZEN — clean transcript persisted (chars=${result.text.length})`);
    return;
  }
  // failed / not_available — только статус
  await prisma.salesSession.update({
    where: { id: sessionId },
    data: {
      transcriptQualityStatus: result.status,
      ...(audioStoragePath ? { audioStoragePath } : {}),
    },
  });
}
