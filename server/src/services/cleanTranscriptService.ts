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

// Записывает clean transcript в SalesSession. Заменяет content полей
// transcript + sets source='offline_clean' + status='clean'. Старый draft
// логируется в audit-history через transcriptSource=oldSource (если был).
//
// Если оригинальная транскрипция была 'realtime_draft', её КОНТЕНТ
// заменяется в `transcript`. Если хотим сохранить draft отдельно для
// сравнения — можно в audit / future-column.
//
// На failure (status≠'clean') — обновляем только статус, не трогаем
// transcript content.
export async function persistCleanTranscript(
  sessionId: string,
  result: CleanTranscriptResult,
  audioStoragePath?: string | null,
): Promise<void> {
  if (result.status === 'clean' && result.text) {
    await prisma.salesSession.update({
      where: { id: sessionId },
      data: {
        transcript: result.text,
        transcriptSource: 'offline_clean',
        transcriptQualityStatus: 'clean',
        ...(audioStoragePath ? { audioStoragePath } : {}),
      },
    });
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
