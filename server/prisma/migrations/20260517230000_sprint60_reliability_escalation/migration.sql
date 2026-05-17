-- Sprint 60 P0 — Realtime reliability score + auto-escalation + clean
-- transcript immutability timestamp.
--
-- Additive only. All columns nullable / default false → existing rows
-- behave as legacy (no score, no escalation, not frozen).

ALTER TABLE "SalesSession" ADD COLUMN "realtimeReliabilityScore" INTEGER;
ALTER TABLE "SalesSession" ADD COLUMN "requiresManualReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SalesSession" ADD COLUMN "transcriptFrozenAt" DATETIME;

CREATE INDEX "SalesSession_requiresManualReview_idx" ON "SalesSession"("requiresManualReview");
CREATE INDEX "SalesSession_realtimeReliabilityScore_idx" ON "SalesSession"("realtimeReliabilityScore");
