import { Router } from 'express';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { authMiddleware, getUser } from '../auth.js';
import { recordAudit } from '../lib/audit.js';
import { requireNotInvestor } from '../lib/ownership.js';
import { buildRealtimePrompt } from '../services/realtimePrompt.js';
import { withRateLimit } from '../lib/rateLimit.js';

// Sprint 49 — OpenAI Realtime live transcription session bootstrap.
//
// Browser нужен ephemeral client secret для WebRTC канала к OpenAI Realtime.
// Sirверный код выдаёт его, чтобы основной OPENAI_API_KEY никогда не попадал
// в браузер. Каждый секрет короткоживущий (60 секунд, по дефолту OpenAI) и
// действителен только для одного клиента.
//
// Шаблон `realtime_transcription` хранит словарь терминов и инструкции —
// суперадмин редактирует их без redeploy. Если шаблон отсутствует / выключен,
// эндпоинт возвращает 503: фронт переключится на резервный браузерный Web
// Speech API. Так пользователь не остаётся без транскрипции при сбое.

const REALTIME_TEMPLATE_KEY = 'realtime_transcription';
// Sprint 49 hotfix 2 — переход на GA endpoint /v1/realtime/client_secrets и
// session-wrapped payload. Старый /v1/realtime/transcription_sessions помечен
// в доках как deprecated и в нашем тенанте возвращает 400 на новых моделях
// (gpt-realtime-whisper). GA endpoint принимает session-конфиг как тело,
// внутри session.type='transcription'.
const REALTIME_CLIENT_SECRETS_ENDPOINT = 'https://api.openai.com/v1/realtime/client_secrets';
// Hard fallback на случай, если и template.model, и env пустые.
// `gpt-realtime-whisper` — текущая GA realtime streaming transcription модель.
const REALTIME_TRANSCRIBE_HARD_FALLBACK = 'gpt-realtime-whisper';

function resolveTranscriptionModel(templateModel: string | null): string {
  const fromTemplate = templateModel?.trim();
  if (fromTemplate) return fromTemplate;
  const fromEnv = env.OPENAI_MODEL_REALTIME_TRANSCRIBE?.trim();
  if (fromEnv) return fromEnv;
  return REALTIME_TRANSCRIBE_HARD_FALLBACK;
}

// Sprint 49 hotfix 4 — `gpt-realtime-whisper` GA модель в transcription
// session не принимает `prompt` (OpenAI: invalid_value `prompt` parameter
// is not supported for this model). gpt-4o-transcribe / gpt-4o-mini-transcribe
// и whisper-1 — принимают. Шаблон realtime_transcription сохраняем как
// управляемый словарь (используется в file transcription и UI), но для
// realtime session подмешиваем prompt только если модель его поддерживает.
const REALTIME_PROMPT_UNSUPPORTED_MODELS = new Set<string>([
  'gpt-realtime-whisper',
]);

function supportsRealtimeTranscriptionPrompt(model: string): boolean {
  return !REALTIME_PROMPT_UNSUPPORTED_MODELS.has(model);
}

// Sprint 49 hotfix 5 — `gpt-realtime-whisper` также не принимает
// session.audio.input.turn_detection (OpenAI: "Turn detection is not
// supported for this transcription model"). Эта модель работает
// в continuous streaming-режиме, OpenAI сама режет на сегменты.
// gpt-4o-transcribe / gpt-4o-mini-transcribe / whisper-1 — принимают server_vad.
const REALTIME_TURN_DETECTION_UNSUPPORTED_MODELS = new Set<string>([
  'gpt-realtime-whisper',
]);

function supportsRealtimeTurnDetection(model: string): boolean {
  return !REALTIME_TURN_DETECTION_UNSUPPORTED_MODELS.has(model);
}

export const realtimeRoutes = Router();
realtimeRoutes.use(authMiddleware);
realtimeRoutes.use(requireNotInvestor());

// POST /api/realtime/transcription-session
// Returns { clientSecret, model, expiresAt, dictionaryVersion } для браузера.
// Sprint 50 P0.2 — realtime_token bucket. Each call mints an ephemeral
// OpenAI client_secret with real cost ($0.017/min during the realtime
// session OpenAI bills against). Without this guard a misbehaving page
// could refresh every few seconds and rack up bills inside the daily AI
// guardrail. 10-token burst with ~12 req/min sustained.
realtimeRoutes.post('/transcription-session', withRateLimit('realtime_token'), async (req, res) => {
  if (!env.OPENAI_API_KEY || env.OPENAI_API_KEY.length < 10) {
    return res.status(503).json({ error: 'openai_not_configured' });
  }

  // Любая ошибка чтения шаблона / запроса к OpenAI должна вернуть 503, а не
  // уронить процесс. Фронт интерпретирует 503 как «realtime недоступен» и
  // переключается на резервный Web Speech API.
  let tpl: { id: string; active: boolean; body: string; model: string | null; version: number } | null = null;
  try {
    tpl = await prisma.promptTemplate.findFirst({
      where: { key: REALTIME_TEMPLATE_KEY },
      select: { id: true, active: true, body: true, model: true, version: true },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn(`[realtime] template lookup failed: ${msg}`);
    return res.status(503).json({ error: 'transcription_template_missing' });
  }
  if (!tpl || !tpl.active || !tpl.body || tpl.body.trim().length < 50) {
    console.warn(`[realtime] template "${REALTIME_TEMPLATE_KEY}" missing/inactive — returning 503`);
    return res.status(503).json({ error: 'transcription_template_missing' });
  }

  const model = resolveTranscriptionModel(tpl.model);
  const modelSource: 'template' | 'env' | 'hard_fallback' =
    tpl.model?.trim() ? 'template' : (env.OPENAI_MODEL_REALTIME_TRANSCRIBE?.trim() ? 'env' : 'hard_fallback');

  // Sprint 49 hotfix 4 — gpt-realtime-whisper не поддерживает transcription.prompt.
  // Решение про prompt принимаем здесь: если модель в whitelist'е — компактим
  // body шаблона до ≤1024 (hotfix 3) и кладём в transcription.prompt. Если
  // нет — отправляем только model+language, шаблон остаётся как управляемая
  // документация и используется для file transcription.
  const promptSupported = supportsRealtimeTranscriptionPrompt(model);
  const built = promptSupported
    ? buildRealtimePrompt(tpl.body)
    : { prompt: '', length: 0, trimmed: false };
  const promptSkippedReason = promptSupported ? null : 'model_does_not_support_prompt';

  // Sprint 49 hotfix 5 — gpt-realtime-whisper не принимает turn_detection.
  // Модель сама режет на сегменты по своей внутренней VAD-логике. Для
  // других моделей (gpt-4o-transcribe, whisper-1) оставляем server_vad.
  const turnDetectionSupported = supportsRealtimeTurnDetection(model);
  const turnDetectionSkippedReason = turnDetectionSupported ? null : 'model_does_not_support_turn_detection';

  // Sprint 49 hotfix 2 — GA payload для /v1/realtime/client_secrets.
  // Структура: session.type='transcription' с audio.input.{transcription,
  // turn_detection}. language='ru' всегда. prompt — только когда модель его
  // поддерживает. turn_detection — только когда модель его поддерживает.
  // Никаких response.create / output audio — transcription-only.
  const transcriptionConfig: { model: string; language: string; prompt?: string } = {
    model,
    language: 'ru',
  };
  if (promptSupported && built.prompt) transcriptionConfig.prompt = built.prompt;

  const audioInput: {
    transcription: typeof transcriptionConfig;
    turn_detection?: {
      type: 'server_vad';
      threshold: number;
      prefix_padding_ms: number;
      silence_duration_ms: number;
    };
  } = { transcription: transcriptionConfig };
  if (turnDetectionSupported) {
    audioInput.turn_detection = {
      type: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 700,
    };
  }

  const requestBody = {
    session: {
      type: 'transcription' as const,
      audio: { input: audioInput },
    },
  };

  try {
    const upstream = await fetch(REALTIME_CLIENT_SECRETS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!upstream.ok) {
      const errText = await safeText(upstream);
      // Sprint 49 hotfix 2 — пробуем JSON-парсинг, чтобы вытащить
      // error.type / error.message / error.param. Тело OpenAI ошибки
      // не содержит API key, можно безопасно показать клиенту type+message
      // (без org_id / req_id).
      const parsed = safeJson(errText);
      const upErr = parsed && typeof parsed === 'object' && 'error' in parsed
        ? (parsed as { error?: { type?: string; message?: string; param?: string; code?: string } }).error
        : null;
      console.warn(
        `[realtime] openai ${upstream.status} model=${model} modelSource=${modelSource} ` +
        `promptSupported=${promptSupported} promptLength=${built.length} promptTrimmed=${built.trimmed} ` +
        `turnDetectionSupported=${turnDetectionSupported} ` +
        `errorType=${upErr?.type ?? 'unknown'} errorCode=${upErr?.code ?? 'none'} ` +
        `param=${upErr?.param ?? 'none'} message="${(upErr?.message ?? errText).slice(0, 400)}"`,
      );
      return res.status(502).json({
        error: 'openai_session_failed',
        status: upstream.status,
        model,
        promptSupported,
        promptLength: built.length,
        promptTrimmed: built.trimmed,
        promptSkippedReason,
        turnDetectionSupported,
        turnDetectionSkippedReason,
        upstreamType: upErr?.type ?? null,
        upstreamCode: upErr?.code ?? null,
        upstreamParam: upErr?.param ?? null,
        upstreamMessage: (upErr?.message ?? '').slice(0, 240) || null,
      });
    }

    const data = (await upstream.json()) as Record<string, unknown>;
    const extracted = extractClientSecret(data);
    if (!extracted.value) {
      // Sprint 49 hotfix 6 — структурный debug. Логируем top-level keys и
      // shape поля client_secret/clientSecret, чтобы можно было понять,
      // что именно OpenAI вернула. Сам секрет НЕ логируем.
      const keys = Object.keys(data);
      const cs = (data as { client_secret?: unknown }).client_secret;
      const csType = cs === null ? 'null' : Array.isArray(cs) ? 'array' : typeof cs;
      console.warn(
        `[realtime] openai response missing client_secret model=${model} modelSource=${modelSource} ` +
        `responseKeys=[${keys.join(',')}] clientSecretType=${csType}`,
      );
      return res.status(502).json({
        error: 'openai_session_invalid',
        model,
        promptSupported,
        turnDetectionSupported,
        responseKeys: keys,
        clientSecretShape: csType,
      });
    }
    const clientSecret = extracted.value;
    const expiresAt = extracted.expiresAt;

    await recordAudit(req, {
      action: 'realtime.transcription_session.issued',
      targetType: 'PromptTemplate',
      targetId: tpl.id,
      payload: {
        actorId: getUser(req).id,
        model, modelSource,
        promptSupported,
        promptLength: built.length, promptTrimmed: built.trimmed,
        turnDetectionSupported,
        templateVersion: tpl.version,
      },
    });

    res.json({
      clientSecret,
      model,
      expiresAt,
      templateVersion: tpl.version,
      promptSupported,
      promptLength: built.length,
      promptTrimmed: built.trimmed,
      promptSkippedReason,
      turnDetectionSupported,
      turnDetectionSkippedReason,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn(
      `[realtime] session bootstrap failed model=${model} modelSource=${modelSource} ` +
      `promptSupported=${promptSupported} promptLength=${built.length} promptTrimmed=${built.trimmed} ` +
      `turnDetectionSupported=${turnDetectionSupported} err="${msg}"`,
    );
    res.status(502).json({
      error: 'openai_session_failed',
      model,
      promptSupported,
      promptLength: built.length,
      promptTrimmed: built.trimmed,
      promptSkippedReason,
      turnDetectionSupported,
      turnDetectionSkippedReason,
      upstreamMessage: msg.slice(0, 240),
    });
  }
});

// Sprint 49 hotfix 6 — терпимый парсинг ответа /v1/realtime/client_secrets.
// GA shape: `client_secret` — строка на верхнем уровне, `expires_at`
// тоже на верхнем уровне. Legacy shape (transcription_sessions endpoint):
// `client_secret.value` + `client_secret.expires_at`. Парсер поддерживает
// обе формы плюс camelCase варианты, не зная заранее, какая модель отдала.
function extractClientSecret(data: Record<string, unknown>): { value: string | null; expiresAt: number | null } {
  if (!data || typeof data !== 'object') return { value: null, expiresAt: null };

  // Top-level expires_at / expiresAt (GA shape).
  let expiresAt: number | null = null;
  if (typeof data.expires_at === 'number') expiresAt = data.expires_at;
  else if (typeof (data as { expiresAt?: unknown }).expiresAt === 'number') expiresAt = (data as { expiresAt: number }).expiresAt;

  // Try in order: top-level string → top-level object.value → camelCase
  // variants → legacy `secret` / `value` shapes.
  const candidates: Array<unknown> = [
    data.client_secret,
    (data as { clientSecret?: unknown }).clientSecret,
    (data as { secret?: unknown }).secret,
    (data as { value?: unknown }).value,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 10) {
      return { value: c, expiresAt };
    }
    if (c && typeof c === 'object') {
      const obj = c as { value?: unknown; expires_at?: unknown; expiresAt?: unknown };
      if (typeof obj.value === 'string' && obj.value.length > 10) {
        if (expiresAt == null) {
          if (typeof obj.expires_at === 'number') expiresAt = obj.expires_at;
          else if (typeof obj.expiresAt === 'number') expiresAt = obj.expiresAt;
        }
        return { value: obj.value, expiresAt };
      }
    }
  }
  return { value: null, expiresAt };
}

async function safeText(r: Response): Promise<string> {
  try { return await r.text(); } catch { return ''; }
}

function safeJson(s: string): unknown {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}
