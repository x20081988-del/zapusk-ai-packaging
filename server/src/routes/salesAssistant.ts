import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authMiddleware, getUser } from '../auth.js';
import { assertProjectOwnership, getActorRole, requireNotInvestor } from '../lib/ownership.js';
import { withRateLimit } from '../lib/rateLimit.js';
import { recordAudit } from '../lib/audit.js';
import {
  analyzeSalesTurn,
  analyzeSalesTurnFast,
  prepareForMeeting,
  type KnowledgeRetrievalMeta,
} from '../services/salesAssistantService.js';
import { isAIGuardrailError } from '../ai/client.js';
import type { Request } from 'express';

// Sprint 40 P0.6 + Sprint 42 P0.4 — retrieval observability.
//   • AuditEvent (Sprint 40) — security forensics: «кто и когда дёрнул KB».
//   • KnowledgeRetrievalEvent (Sprint 42) — структурированная metrics-таблица:
//     отдельные индексы по projectId/feature/actor для дешёвых дашбордов
//     («какие sources чаще используются», «процент пустых retrieval'ов»).
//
// Никогда не пишем transcript / prompt / chunk text / raw query — только
// metadata (id'ы, счётчики). См. schema комментарий.
// Sprint 43 — теперь возвращает id retrieval event'а (или null при ошибке).
// Sprint 43 P0.3 будет ссылаться на него из AssistantAdviceEvent.retrievalEventId.
// Audit пишем fire-and-forget; structured event ждём, потому что нужен id.
async function recordRetrievalObservability(
  req: Request,
  projectId: string | null,
  meta: KnowledgeRetrievalMeta,
): Promise<string | null> {
  // Audit (legacy path, оставлен на месте).
  recordAudit(req, {
    action: 'knowledge.retrieval',
    targetType: 'KnowledgeRetrieval',
    targetId: null,
    payload: {
      projectId,
      feature: meta.feature,
      sourceIds: meta.sourceIds,
      count: meta.count,
      chunksScanned: meta.chunksScanned,
      totalChars: meta.totalChars,
    },
  }).catch(() => { /* recordAudit логирует ошибки внутри */ });

  // Sprint 42 — structured event для метрик. Sprint 43 — теперь await'им, чтобы
  // получить id; insert этой row быстрый (<5ms), не влияет на user-latency.
  const actor = (req as { user?: { id?: string } }).user;
  try {
    const row = await prisma.knowledgeRetrievalEvent.create({
      data: {
        actorId: actor?.id ?? null,
        projectId,
        feature: meta.feature,
        sourceIdsJson: JSON.stringify(meta.sourceIds),
        chunkIdsJson: null,
        sourceCount: meta.count,
        totalChars: meta.totalChars,
        conversationAnalysisId: null,
        salesSessionId: null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    console.warn('[knowledge:retrieval-event] write failed', err);
    return null;
  }
}

// Sprint 43 P0.3 — пишем AssistantAdviceEvent ТОЛЬКО на full analyze.
// Fast analyze вызывается часто (раз в 1-3 секунды на живой встрече) и засорил
// бы аналитику; если в будущем понадобится — расширим phase.
async function recordAdviceEvent(args: {
  req: Request;
  projectId: string | null;
  retrievalEventId: string | null;
  // Часть AssistantCard, которую мы готовы хранить (см. schema comment).
  card: {
    spinStage?: string;
    tone?: string;
    mainQuestion?: string;
    nextStep?: string | null;
    recommendation?: string;
    confidence?: number;
    provider?: string;
    model?: string;
    fellBackToMock?: boolean;
    promptSource?: string;
    promptTemplateId?: string | null;
    usedKnowledgeSources?: Array<{ sourceId: string; chunkId?: string }>;
  };
}): Promise<string | null> {
  const actor = (args.req as { user?: { id?: string } }).user;
  try {
    const used = args.card.usedKnowledgeSources ?? [];
    const row = await prisma.assistantAdviceEvent.create({
      data: {
        projectId: args.projectId,
        actorId: actor?.id ?? null,
        retrievalEventId: args.retrievalEventId,
        phase: 'full',
        spinStage: args.card.spinStage ?? null,
        tone: args.card.tone ?? null,
        mainQuestion: args.card.mainQuestion ?? null,
        nextStep: args.card.nextStep ?? null,
        recommendation: args.card.recommendation ?? null,
        confidence: typeof args.card.confidence === 'number' ? args.card.confidence : null,
        usedSourceIdsJson: JSON.stringify(used.map((s) => s.sourceId)),
        usedChunkIdsJson: used.some((s) => s.chunkId)
          ? JSON.stringify(used.map((s) => s.chunkId ?? null))
          : null,
        provider: args.card.provider ?? null,
        model: args.card.model ?? null,
        fellBackToMock: Boolean(args.card.fellBackToMock),
        promptSource: args.card.promptSource ?? null,
        promptTemplateId: args.card.promptTemplateId ?? null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    console.warn('[sales-assistant] advice event write failed', err);
    return null;
  }
}

export const salesAssistantRoutes = Router();
salesAssistantRoutes.use(authMiddleware);
// Sprint 37 P0.4 — INVESTOR не использует sales co-pilot.
salesAssistantRoutes.use(requireNotInvestor());

// Sprint 51 — qualification desk. Frontend передаёт `mode` (meeting |
// qualification) и опциональный `scriptKey` для предзагруженных скриптов
// (DLFY / ГлавСнаб / возврат и т.д.). Если поля не переданы — поведение
// идентично прежнему meeting-режиму (gracefully).
const QUALIFICATION_SCRIPT_KEYS = [
  'dlfy_vamlyam',
  'dlfy_base',
  'glavsnab',
  'zapusk_base',
  'zapusk_after_vamlyam',
  'funnel_return',
  'generic',
] as const;

// Sprint 52 P0.7 — admin-driven qualification scripts. Endpoint доступен
// всем не-investor ролям (фаундер/менеджер/админ), чтобы Qualification
// Desk мог построить selector из DB. ТОЛЬКО metadata (key/name/description/
// active) — body остаётся server-side IP (используется в analyzeSalesTurn,
// не отдаётся фронту). Если DB пустая — frontend сам fallback'нется на
// hardcoded catalog.
salesAssistantRoutes.get('/qualification-scripts', async (_req, res) => {
  const rows = await prisma.promptTemplate.findMany({
    where: { category: 'qualification', active: true },
    select: { key: true, name: true, description: true },
    orderBy: { name: 'asc' },
  });
  // key='qualification.<scriptKey>' → для frontend селектора нам нужен
  // короткий scriptKey, который потом отправится в analyze.
  const scripts = rows
    .map((r) => {
      const m = r.key.match(/^qualification\.(.+)$/);
      const scriptKey = m ? m[1] : null;
      if (!scriptKey || !QUALIFICATION_SCRIPT_KEYS.includes(scriptKey as typeof QUALIFICATION_SCRIPT_KEYS[number])) {
        return null;
      }
      return {
        scriptKey,
        templateKey: r.key,
        name: r.name,
        description: r.description ?? null,
      };
    })
    .filter((x): x is { scriptKey: string; templateKey: string; name: string; description: string | null } => x !== null);
  res.json({ scripts });
});

const analyzeSchema = z.object({
  transcript: z.string().trim().min(1).max(32_000),
  recent: z.string().max(16_000).optional().nullable(),
  recentContext: z.string().max(16_000).optional().nullable(),
  previousAdvice: z.unknown().optional().nullable(),
  previousSpinStage: z.enum(['S', 'P', 'I', 'N']).optional().nullable(),
  adviceHistory: z.array(z.unknown()).max(12).optional().nullable(),
  // Sprint 62.HOTFIX P0.3 — frontend-detected "previous mainQuestion already
  // spoken by manager". When true, server prompt injects an extra-strict
  // rule: «не повторяй её даже частично, дай следующий шаг». Optional;
  // defaults to false so legacy clients still work.
  previousAdviceAlreadySpoken: z.boolean().optional().nullable(),
  projectId: z.string().optional().nullable(),
  mode: z.enum(['meeting', 'qualification']).optional().nullable(),
  scriptKey: z.enum(QUALIFICATION_SCRIPT_KEYS).optional().nullable(),
  // Sprint 52 P0.4 — multi-project context. Дополнительные проекты,
  // которые AI должен учитывать. Максимум 5 — больше шумит prompt и
  // размывает focus.
  projectIds: z.array(z.string()).max(5).optional().nullable(),
  // Sprint 52 P0.6 — для memory retrieval (NegotiationMemory по
  // investorName). Опционально, не влияет если пусто.
  investorName: z.string().max(200).optional().nullable(),
});

// Sprint 50 P0.2 — analyze rate-limit. AI cost guardrails already cap the
// daily spend (env.AI_MAX_*); per-actor rate-limit prevents one user from
// flooding the queue inside that budget.
salesAssistantRoutes.post('/analyze', withRateLimit('ai_inference'), async (req, res) => {
  const parsed = analyzeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Sprint 36 P0.2 — если фронт передал projectId, проверяем владение. Иначе
  // user A мог подставить projectId user B и получить AI-подсказку, построенную
  // на чужом brief'е (utвечка контента). Если projectId не задан — анализ без
  // project-context, это разрешено.
  if (parsed.data.projectId) {
    const ownership = await assertProjectOwnership(req, parsed.data.projectId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
  }

  // Sprint 49 hotfix 8 — латентность + structured warn при ошибках.
  const tStart = Date.now();
  try {
    const card = await analyzeSalesTurn({
      transcript: parsed.data.transcript.trim(),
      recentContext: parsed.data.recentContext ?? parsed.data.recent ?? undefined,
      previousAdvice: parsed.data.previousAdvice ?? undefined,
      previousSpinStage: parsed.data.previousSpinStage ?? undefined,
      adviceHistory: parsed.data.adviceHistory ?? undefined,
      previousAdviceAlreadySpoken: parsed.data.previousAdviceAlreadySpoken ?? false,
      projectId: parsed.data.projectId ?? null,
      // Sprint 38 — роль нужна для KB retrieval (visibility + raw vs redacted).
      actorRole: getActorRole(req),
      actorId: getUser(req).id,
      // Sprint 41 P0.8 — workspaceStatus для environment-фильтра.
      workspaceStatus: (req as { user?: { workspaceStatus?: string } }).user?.workspaceStatus ?? null,
      // Sprint 51 — desk mode + qualification script. По умолчанию meeting,
      // если фронт ничего не прислал. scriptKey игнорируется в meeting режиме.
      mode: parsed.data.mode ?? 'meeting',
      scriptKey: parsed.data.scriptKey ?? null,
      // Sprint 52 P0.4 — multi-project context (опционально).
      projectIds: parsed.data.projectIds ?? null,
      // Sprint 52 P0.6 — для memory retrieval.
      investorName: parsed.data.investorName ?? null,
    });
    const retrievalEventId = await recordRetrievalObservability(req, parsed.data.projectId ?? null, card.knowledgeRetrievalMeta);
    // Sprint 43 P0.3 — пишем AssistantAdviceEvent и возвращаем id фронту,
    // чтобы UI мог потом ссылаться на него в outcome event.
    const adviceEventId = await recordAdviceEvent({
      req,
      projectId: parsed.data.projectId ?? null,
      retrievalEventId,
      card: {
        spinStage: card.spinStage,
        tone: card.tone,
        mainQuestion: card.mainQuestion,
        nextStep: card.dealNextStep ?? null,
        recommendation: card.whatToDo?.[0],
        confidence: card.confidence,
        provider: card.provider,
        model: card.model,
        fellBackToMock: card.fellBackToMock,
        promptSource: card.promptSource,
        promptTemplateId: card.promptTemplateId,
        usedKnowledgeSources: card.usedKnowledgeSources.map((s) => ({
          sourceId: s.sourceId,
          // UsedKnowledgeSource в Sprint 38 не несёт chunkId; добавим в Sprint 44.
        })),
      },
    });
    res.json({ card, adviceEventId });
  } catch (err) {
    const latencyMs = Date.now() - tStart;
    if (isAIGuardrailError(err)) {
      console.warn(
        `[sales-assistant] feature=analyze FAIL reason=guardrail code=${err.code} ` +
        `actorId=${getUser(req).id} projectId=${parsed.data.projectId ?? 'none'} latencyMs=${latencyMs}`,
      );
      return res.status(err.statusCode).json({ error: err.code, reason: 'guardrail', latencyMs });
    }
    const msg = err instanceof Error ? err.message : 'unknown';
    const reason = classifyServerAnalyzeError(msg);
    console.warn(
      `[sales-assistant] feature=analyze FAIL reason=${reason} ` +
      `actorId=${getUser(req).id} projectId=${parsed.data.projectId ?? 'none'} latencyMs=${latencyMs} ` +
      `transcriptChars=${parsed.data.transcript.length} message="${msg.slice(0, 240)}"`,
    );
    res.status(500).json({ error: 'analyze_failed', reason, latencyMs, message: msg.slice(0, 240) });
  }
});

// Sprint 34В — двухэтапная генерация. Этап 1: ultra-fast tactical reply
// для живой встречи (1-3 секунды). UI должен звать сначала /analyze-fast,
// рендерить главный вопрос/backup/self-sale, потом догнать через /analyze
// для полной аналитики.
salesAssistantRoutes.post('/analyze-fast', withRateLimit('ai_inference'), async (req, res) => {
  const parsed = analyzeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Sprint 36 P0.2 — те же ownership-правила, что и на /analyze.
  if (parsed.data.projectId) {
    const ownership = await assertProjectOwnership(req, parsed.data.projectId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
  }

  // Sprint 49 hotfix 8 — латентность + structured warn при ошибках fast-фазы.
  const tStart = Date.now();
  try {
    const fast = await analyzeSalesTurnFast({
      transcript: parsed.data.transcript.trim(),
      recentContext: parsed.data.recentContext ?? parsed.data.recent ?? undefined,
      previousAdvice: parsed.data.previousAdvice ?? undefined,
      previousSpinStage: parsed.data.previousSpinStage ?? undefined,
      adviceHistory: parsed.data.adviceHistory ?? undefined,
      previousAdviceAlreadySpoken: parsed.data.previousAdviceAlreadySpoken ?? false,
      projectId: parsed.data.projectId ?? null,
      // Sprint 38 — то же что и в /analyze.
      actorRole: getActorRole(req),
      actorId: getUser(req).id,
      workspaceStatus: (req as { user?: { workspaceStatus?: string } }).user?.workspaceStatus ?? null,
      // Sprint 51 — see /analyze comment.
      mode: parsed.data.mode ?? 'meeting',
      scriptKey: parsed.data.scriptKey ?? null,
      // Sprint 52 P0.4 — multi-project context (опционально).
      projectIds: parsed.data.projectIds ?? null,
      // Sprint 52 P0.6 — для memory retrieval.
      investorName: parsed.data.investorName ?? null,
    });
    // Sprint 43 — для fast НЕ пишем AssistantAdviceEvent (см. schema comment),
    // только retrieval observability.
    await recordRetrievalObservability(req, parsed.data.projectId ?? null, fast.knowledgeRetrievalMeta);
    res.json({ fast });
  } catch (err) {
    const latencyMs = Date.now() - tStart;
    if (isAIGuardrailError(err)) {
      console.warn(
        `[sales-assistant:fast] feature=analyze_fast FAIL reason=guardrail code=${err.code} ` +
        `actorId=${getUser(req).id} projectId=${parsed.data.projectId ?? 'none'} latencyMs=${latencyMs}`,
      );
      return res.status(err.statusCode).json({ error: err.code, reason: 'guardrail', latencyMs });
    }
    const msg = err instanceof Error ? err.message : 'unknown';
    const reason = classifyServerAnalyzeError(msg);
    console.warn(
      `[sales-assistant:fast] feature=analyze_fast FAIL reason=${reason} ` +
      `actorId=${getUser(req).id} projectId=${parsed.data.projectId ?? 'none'} latencyMs=${latencyMs} ` +
      `transcriptChars=${parsed.data.transcript.length} message="${msg.slice(0, 240)}"`,
    );
    res.status(500).json({ error: 'analyze_fast_failed', reason, latencyMs, message: msg.slice(0, 240) });
  }
});

// Sprint 49 hotfix 8 — классификация серверных ошибок analyze-pipeline.
// Frontend получает `reason` и может показать ту же гранулярность, что и
// при сетевых сбоях. Сам error.message обрезается до 240 чарактеров и не
// содержит секретов/токенов — это сообщения провайдеров / network-уровня.
function classifyServerAnalyzeError(msg: string): string {
  if (/rate.?limit|429|too_many_requests/i.test(msg)) return 'rate_limit';
  if (/timeout|timed.?out|ETIMEDOUT|deadline/i.test(msg)) return 'timeout';
  if (/abort/i.test(msg)) return 'aborted';
  if (/json|parse|unexpected token|malformed/i.test(msg)) return 'parse';
  if (/network|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(msg)) return 'network';
  if (/model_not_found|invalid_request_error|404/i.test(msg)) return 'model_unavailable';
  return 'unknown';
}

// Sprint 50 hotfix — meeting prep mode.
// POST /api/sales-assistant/prepare — takes prep context (CRM notes, Zoom
// notes, investor profile, prior chat) and returns a structured MeetingPlan
// (objective, conversation style, opening questions, pitch timing, pitch
// script, leverage points, dealbreakers, stages). Distinct from
// /analyze and /analyze-fast which assume the live conversation is already
// running. UI uses this BEFORE the mic is on.
const prepareSchema = z.object({
  context: z.string().trim().min(20).max(32_000),
  projectId: z.string().optional().nullable(),
});

salesAssistantRoutes.post('/prepare', withRateLimit('ai_inference'), async (req, res) => {
  const parsed = prepareSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (parsed.data.projectId) {
    const ownership = await assertProjectOwnership(req, parsed.data.projectId);
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error });
  }

  const tStart = Date.now();
  try {
    const plan = await prepareForMeeting({
      context: parsed.data.context.trim(),
      projectId: parsed.data.projectId ?? null,
      actorRole: getActorRole(req),
      actorId: getUser(req).id,
    });
    console.info(
      `[sales-assistant:prepare] feature=prepare OK actorId=${getUser(req).id} ` +
      `projectId=${parsed.data.projectId ?? 'none'} latencyMs=${Date.now() - tStart} ` +
      `contextChars=${parsed.data.context.length} promptSource=${plan.promptSource} ` +
      `promptVersion=${plan.promptVersion ?? 'none'} templateId=${plan.promptTemplateId ?? 'none'}`,
    );
    res.json({ plan });
  } catch (err) {
    const latencyMs = Date.now() - tStart;
    if (isAIGuardrailError(err)) {
      console.warn(
        `[sales-assistant:prepare] feature=prepare FAIL reason=guardrail code=${err.code} ` +
        `actorId=${getUser(req).id} projectId=${parsed.data.projectId ?? 'none'} latencyMs=${latencyMs}`,
      );
      return res.status(err.statusCode).json({ error: err.code, reason: 'guardrail', latencyMs });
    }
    const msg = err instanceof Error ? err.message : 'unknown';
    const reason = classifyServerAnalyzeError(msg);
    console.warn(
      `[sales-assistant:prepare] feature=prepare FAIL reason=${reason} ` +
      `actorId=${getUser(req).id} projectId=${parsed.data.projectId ?? 'none'} latencyMs=${latencyMs} ` +
      `contextChars=${parsed.data.context.length} message="${msg.slice(0, 240)}"`,
    );
    res.status(500).json({ error: 'prepare_failed', reason, latencyMs, message: msg.slice(0, 240) });
  }
});
