// Sprint 62 P6 — Golden dataset foundation (instrumentation only).
//
// Scope:
//   This sprint does NOT build the ML pipeline. It establishes the
//   structure + capture hooks so a future sprint can:
//     1. Read structured events from log aggregator AND from the existing
//        SalesSession rows to assemble a labeled investor-call dataset.
//     2. Add tagging (investor archetype, objection classification,
//        success/failure outcome) without changing the storage shape.
//
// What we ship in P6:
//   • `recordMeetingSnapshot(session)` — emits a single structured log
//     line `[dataset/meeting-snapshot]` with metadata only (no PII raw):
//        sessionId, projectId, outcome, transcriptSource, transcriptQuality,
//        chars, objectionCount, hasFollowUp, probabilityScore,
//        investorArchetype (if tag present), createdAt.
//   • `summarizeForDataset(session)` — pure helper that builds the same
//     shape (for the admin read endpoint).
//
// We do NOT:
//   • create a new DB table
//   • run any ML
//   • change SalesSession contract
//
// The existing SalesSession row already has everything we need. P6 just
// wraps it in a stable dataset-friendly projection.

import { createHash } from 'node:crypto';

export interface DatasetMeetingSnapshot {
  sessionId: string;
  projectId: string | null;
  createdAt: string;
  outcome: string | null;
  transcriptSource: string | null;
  transcriptQualityStatus: string | null;
  transcriptChars: number;
  draftTranscriptChars: number;
  /** Investor name SHA-256 prefix — no raw name leaks into dataset logs. */
  investorHash: string | null;
  hasInvestorName: boolean;
  hasFollowUp: boolean;
  objectionCount: number;
  materialsCount: number;
  probabilityScore: number | null;
  investorInterest: string | null;
  investorType: string | null;
  /** True when a clean transcript replaced draft (Sprint 60 immutability). */
  hasCleanTranscript: boolean;
  /** Sprint 60 reliability score. */
  realtimeReliabilityScore: number | null;
  requiresManualReview: boolean;
}

interface SessionRowForDataset {
  id: string;
  projectId: string | null;
  createdAt: Date;
  outcome: string | null;
  transcriptSource: string | null;
  transcriptQualityStatus: string | null;
  transcript: string | null;
  draftTranscript: string | null;
  investorName: string | null;
  followUpMessage: string | null;
  objections: string | null;
  materialsToSend: string | null;
  probabilityScore: number | null;
  investorInterest: string | null;
  investorType: string | null;
  transcriptFrozenAt: Date | null;
  realtimeReliabilityScore: number | null;
  requiresManualReview: boolean | null;
}

function hashInvestor(name: string | null): string | null {
  if (!name || !name.trim()) return null;
  return createHash('sha256').update(name.trim().toLowerCase()).digest('hex').slice(0, 12);
}

function countJsonArray(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch { return 0; }
}

export function summarizeForDataset(session: SessionRowForDataset): DatasetMeetingSnapshot {
  return {
    sessionId: session.id,
    projectId: session.projectId,
    createdAt: session.createdAt.toISOString(),
    outcome: session.outcome,
    transcriptSource: session.transcriptSource,
    transcriptQualityStatus: session.transcriptQualityStatus,
    transcriptChars: (session.transcript ?? '').length,
    draftTranscriptChars: (session.draftTranscript ?? '').length,
    investorHash: hashInvestor(session.investorName),
    hasInvestorName: Boolean(session.investorName && session.investorName.trim()),
    hasFollowUp: Boolean(session.followUpMessage && session.followUpMessage.trim()),
    objectionCount: countJsonArray(session.objections),
    materialsCount: countJsonArray(session.materialsToSend),
    probabilityScore: session.probabilityScore,
    investorInterest: session.investorInterest,
    investorType: session.investorType,
    hasCleanTranscript: Boolean(session.transcriptFrozenAt),
    realtimeReliabilityScore: session.realtimeReliabilityScore,
    requiresManualReview: Boolean(session.requiresManualReview),
  };
}

// Idempotent. Called when a session reaches a terminal state (finalize /
// recompute). Single log line so ops can grep them out of the log aggregator
// and assemble training set without DB queries.
export function recordMeetingSnapshot(session: SessionRowForDataset): void {
  const snapshot = summarizeForDataset(session);
  try {
    console.log('[dataset/meeting-snapshot]', JSON.stringify(snapshot));
  } catch { /* ignore */ }
}
