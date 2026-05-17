// Sprint 55 P0 — Recompute AI artifacts from clean transcript.
//
// После того как offline gpt-4o-transcribe сгенерировал clean транскрипт,
// AI summary/objections/insights/memory всё ещё построены на draft.
// Этот сервис безопасно пере-вычисляет всё на clean'е и обновляет:
//   • SalesSession.summary, investorInterest, checkRange, objections, risks,
//     materialsToSend, nextStep, followUpMessage, probabilityScore,
//     investorType, tone, managerNote
//   • SalesSession.aiDerivedFrom='clean', cleanTranscriptProcessedAt=now
//   • NegotiationMemory (upsert по salesSessionId — НЕ создаём дубликат)
//
// Idempotency guard:
//   Если cleanTranscriptProcessedAt уже set И aiDerivedFrom='clean' →
//   skip. Повторные вызовы безвредны.
//
// Async-safe:
//   Single Prisma transaction для финального UPDATE. AI call (completeSession)
//   делается ВНЕ транзакции (медленно). Если параллельные вызовы прорвутся
//   между check и AI call — UPDATE всё равно идемпотентен (последний wins,
//   результат identical).
//
// Failure handling:
//   • AI call fail → recompute не происходит, draft artifacts остаются.
//     status: 'ai_failed'.
//   • DB update fail → возвращаем status: 'persist_failed'.
//   • Clean transcript отсутствует → status: 'no_clean'.

import { prisma } from '../db.js';
import { completeSession } from './salesSessionService.js';
import { upsertMemoryForSession } from './negotiationMemoryService.js';
import { compareDraftVsClean, type TranscriptDiff } from './transcriptDiff.js';
import { isAIGuardrailError } from '../ai/client.js';

export type RecomputeStatus =
  | 'recomputed'
  | 'skipped_already_processed'
  | 'no_clean'
  | 'ai_failed'
  | 'persist_failed';

export interface RecomputeResult {
  status: RecomputeStatus;
  durationMs: number;
  hallucinationCandidatesCount?: number;
  similarity?: number;
  reason?: string;
}

export async function recomputeFromCleanTranscript(sessionId: string): Promise<RecomputeResult> {
  const started = Date.now();
  const session = await prisma.salesSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    return { status: 'persist_failed', durationMs: Date.now() - started, reason: 'session_not_found' };
  }

  // Idempotency guard: если уже recompute'нули — skip.
  if (session.aiDerivedFrom === 'clean' && session.cleanTranscriptProcessedAt) {
    return {
      status: 'skipped_already_processed',
      durationMs: Date.now() - started,
      reason: `already at clean since ${session.cleanTranscriptProcessedAt.toISOString()}`,
    };
  }

  // Должен быть clean transcript для recompute.
  if (session.transcriptQualityStatus !== 'clean' || !session.transcript) {
    return { status: 'no_clean', durationMs: Date.now() - started, reason: 'transcript not clean yet' };
  }

  const cleanText = session.transcript;
  const draftText = session.draftTranscript ?? '';

  // Run AI completeSession on clean. Это тот же сервис, что и initial finalize.
  let summary;
  try {
    summary = await completeSession({
      projectId: session.projectId,
      leadId: session.leadId,
      investorName: session.investorName,
      investorPhone: session.investorPhone,
      transcript: cleanText,
      adviceHistory: [],
      startedAt: session.startedAt?.toISOString() ?? null,
      endedAt: session.endedAt?.toISOString() ?? null,
      createdById: session.createdById,
      outcome: (session.outcome as 'success' | 'failed' | 'followup' | 'unknown' | null) ?? undefined,
      managerOutcomeNotes: session.managerOutcomeNotes,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    if (isAIGuardrailError(err)) {
      console.warn(`[recompute] session=${sessionId} ai_guardrail code=${err.code}`);
      return { status: 'ai_failed', durationMs: Date.now() - started, reason: `guardrail:${err.code}` };
    }
    console.warn(`[recompute] session=${sessionId} ai_failed: ${msg.slice(0, 200)}`);
    return { status: 'ai_failed', durationMs: Date.now() - started, reason: msg.slice(0, 200) };
  }

  // Compute diff (best-effort; never blocks the persist).
  let diff: TranscriptDiff | null = null;
  try {
    diff = compareDraftVsClean(draftText, cleanText);
  } catch (err) {
    console.warn('[recompute] diff failed (non-fatal):', err);
  }

  // Persist update to SalesSession.
  try {
    // Sprint 60 P0.6 + P0.7 — persist RealtimeReliabilityScore + auto-
    // escalation flag derived from the diff. If diff failed entirely
    // (no draft), leave both null/false — we can't grade a session
    // without comparison data.
    const reliabilityScore = diff?.realtimeQualityScore ?? null;
    const requiresManualReview = diff?.requiresManualReview ?? false;
    const escalationReason = diff?.manualReviewReason ?? null;

    await prisma.salesSession.update({
      where: { id: sessionId },
      data: {
        summary: summary.summary,
        investorInterest: summary.investorInterest,
        checkRange: summary.checkRange,
        objections: JSON.stringify(summary.objections),
        risks: JSON.stringify(summary.risks),
        materialsToSend: JSON.stringify(summary.materialsToSend),
        nextStep: summary.nextStep,
        followUpMessage: summary.followUpMessage,
        probabilityScore: summary.probabilityScore,
        investorType: summary.investorType,
        tone: summary.tone,
        managerNote: summary.managerNote,
        aiProvider: summary.provider,
        aiModel: summary.model,
        fellBackToMock: summary.fellBackToMock,
        // Provenance.
        aiDerivedFrom: 'clean',
        cleanTranscriptProcessedAt: new Date(),
        // Sprint 60 reliability + escalation.
        ...(reliabilityScore !== null ? { realtimeReliabilityScore: reliabilityScore } : {}),
        ...(requiresManualReview ? { requiresManualReview: true } : {}),
      },
    });

    if (requiresManualReview) {
      console.log(
        `[recompute] session=${sessionId} ESCALATED requires_manual_review=true ` +
        `reason="${escalationReason}"`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn(`[recompute] session=${sessionId} persist_failed: ${msg.slice(0, 200)}`);
    return { status: 'persist_failed', durationMs: Date.now() - started, reason: msg.slice(0, 200) };
  }

  // Upsert NegotiationMemory с clean artifacts. Не создаём дубликат.
  try {
    await upsertMemoryForSession(sessionId, {
      primaryProjectId: session.projectId,
      // projectIds reconstruction: SalesSession not tracking explicitly,
      // but NegotiationMemory.projectIds is JSON. We pass [primary] for
      // simplicity; if multi-project state needs preservation, future
      // sprint can plumb projectIds through to SalesSession too.
      projectIds: session.projectId ? [session.projectId] : [],
      investorName: session.investorName,
      investorPhone: session.investorPhone,
      transcript: cleanText,
      summary: summary.summary,
      outcome: session.outcome,
      objections: summary.objections,
      tags: [],
      speakerInsights: null, // not derived by completeSession; future enrichment
      managerNotes: session.managerOutcomeNotes,
      createdById: session.createdById,
      sourceTranscriptQuality: 'clean',
    });
  } catch (err) {
    console.warn(`[recompute] session=${sessionId} memory upsert failed (non-fatal):`, err);
  }

  const durationMs = Date.now() - started;
  console.log(
    `[recompute] session=${sessionId} status=recomputed durationMs=${durationMs} ` +
    `hallucinations=${diff?.hallucinationCandidates.length ?? 0} ` +
    `similarity=${diff?.similarity?.toFixed(3) ?? '-'} ` +
    `draftChars=${diff?.draftStats.chars ?? 0} cleanChars=${diff?.cleanStats.chars ?? 0}`,
  );

  return {
    status: 'recomputed',
    durationMs,
    hallucinationCandidatesCount: diff?.hallucinationCandidates.length,
    similarity: diff?.similarity,
  };
}
