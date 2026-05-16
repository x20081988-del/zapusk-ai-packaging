import { Router } from 'express';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { authMiddleware, getUser } from '../auth.js';
import { recordAudit } from '../lib/audit.js';
import { requireNotInvestor } from '../lib/ownership.js';

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
const REALTIME_SESSIONS_ENDPOINT = 'https://api.openai.com/v1/realtime/transcription_sessions';
// Sprint 49 hotfix — hard fallback на случай, если и template.model, и
// env.OPENAI_MODEL_REALTIME_TRANSCRIBE пустые. `gpt-realtime-whisper` —
// текущая GA realtime streaming transcription модель OpenAI.
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
  const instructions = tpl.body.trim();

  try {
    const upstream = await fetch(REALTIME_SESSIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'realtime=v1',
      },
      body: JSON.stringify({
        input_audio_format: 'pcm16',
        input_audio_transcription: {
          model,
          prompt: instructions,
          language: 'ru',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
        },
      }),
    });

    if (!upstream.ok) {
      const errText = await safeText(upstream);
      // Sprint 49 hotfix — структурно логируем upstream error чтобы можно
      // было диагностировать. Клиенту отдаём только status + код, тело
      // OpenAI (может содержать org_id / req_id) не пробрасываем.
      console.warn(`[realtime] openai ${upstream.status} model=${model} modelSource=${modelSource} body="${errText.slice(0, 400)}"`);
      return res.status(502).json({ error: 'openai_session_failed', status: upstream.status, model });
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
      payload: { actorId: getUser(req).id, model, modelSource, templateVersion: tpl.version },
    });

    res.json({
      clientSecret,
      model,
      expiresAt,
      templateVersion: tpl.version,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn(`[realtime] session bootstrap failed model=${model} modelSource=${modelSource} err="${msg}"`);
    res.status(502).json({ error: 'openai_session_failed', model });
  }
});

interface RealtimeSessionResponse {
  client_secret?: { value?: string; expires_at?: number };
}

async function safeText(r: Response): Promise<string> {
  try { return await r.text(); } catch { return ''; }
}
