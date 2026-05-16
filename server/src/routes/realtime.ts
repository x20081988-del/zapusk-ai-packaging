import { Router } from 'express';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { authMiddleware, getUser } from '../auth.js';
import { recordAudit } from '../lib/audit.js';
import { requireNotInvestor } from '../lib/ownership.js';
import { buildRealtimePrompt } from '../services/realtimePrompt.js';

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

export const realtimeRoutes = Router();
realtimeRoutes.use(authMiddleware);
realtimeRoutes.use(requireNotInvestor());

// POST /api/realtime/transcription-session
// Returns { clientSecret, model, expiresAt, dictionaryVersion } для браузера.
realtimeRoutes.post('/transcription-session', async (req, res) => {
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

  // Sprint 49 hotfix 3 — OpenAI Realtime принимает prompt ≤ 1024 чарактеров.
  // Шаблон может вырасти, поэтому проходим через buildRealtimePrompt(),
  // который выбрасывает пустые строки и section headers и режет по
  // word-boundary до 1000 чарактеров.
  const built = buildRealtimePrompt(tpl.body);

  // Sprint 49 hotfix 2 — GA payload для /v1/realtime/client_secrets.
  // Структура: session.type='transcription' с audio.input.{transcription,
  // turn_detection}. prompt (словарь терминов) живёт внутри transcription,
  // language='ru'. Никаких response.create / output audio — это
  // transcription-only сессия.
  const requestBody = {
    session: {
      type: 'transcription' as const,
      audio: {
        input: {
          transcription: {
            model,
            language: 'ru',
            prompt: built.prompt,
          },
          turn_detection: {
            type: 'server_vad' as const,
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 700,
          },
        },
      },
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
        `promptLength=${built.length} promptTrimmed=${built.trimmed} ` +
        `errorType=${upErr?.type ?? 'unknown'} errorCode=${upErr?.code ?? 'none'} ` +
        `param=${upErr?.param ?? 'none'} message="${(upErr?.message ?? errText).slice(0, 400)}"`,
      );
      return res.status(502).json({
        error: 'openai_session_failed',
        status: upstream.status,
        model,
        promptLength: built.length,
        promptTrimmed: built.trimmed,
        upstreamType: upErr?.type ?? null,
        upstreamCode: upErr?.code ?? null,
        upstreamParam: upErr?.param ?? null,
        upstreamMessage: (upErr?.message ?? '').slice(0, 240) || null,
      });
    }

    const data = (await upstream.json()) as RealtimeSessionResponse;
    const clientSecret = data.client_secret?.value;
    const expiresAt = data.client_secret?.expires_at ?? null;
    if (!clientSecret) {
      console.warn(`[realtime] openai response missing client_secret model=${model} modelSource=${modelSource}`);
      return res.status(502).json({ error: 'openai_session_invalid' });
    }

    await recordAudit(req, {
      action: 'realtime.transcription_session.issued',
      targetType: 'PromptTemplate',
      targetId: tpl.id,
      payload: {
        actorId: getUser(req).id,
        model, modelSource,
        promptLength: built.length, promptTrimmed: built.trimmed,
        templateVersion: tpl.version,
      },
    });

    res.json({
      clientSecret,
      model,
      expiresAt,
      templateVersion: tpl.version,
      promptLength: built.length,
      promptTrimmed: built.trimmed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn(
      `[realtime] session bootstrap failed model=${model} modelSource=${modelSource} ` +
      `promptLength=${built.length} promptTrimmed=${built.trimmed} err="${msg}"`,
    );
    res.status(502).json({
      error: 'openai_session_failed',
      model,
      promptLength: built.length,
      promptTrimmed: built.trimmed,
      upstreamMessage: msg.slice(0, 240),
    });
  }
});

interface RealtimeSessionResponse {
  client_secret?: { value?: string; expires_at?: number };
}

async function safeText(r: Response): Promise<string> {
  try { return await r.text(); } catch { return ''; }
}

function safeJson(s: string): unknown {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}
