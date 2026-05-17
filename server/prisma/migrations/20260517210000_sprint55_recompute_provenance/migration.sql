-- Sprint 55 P0 — Recompute AI artifacts from clean transcript.
-- Adds provenance fields so we can:
--   1) Preserve draft transcript when clean replaces it (diff/QA).
--   2) Track which transcript version drove summary/objections/etc.
--   3) Idempotently re-run recompute (skip if already processed).
--
-- Additive only. All new columns nullable. Existing rows treated as
-- aiDerivedFrom=NULL → service layer interprets as 'draft' for back-compat.

ALTER TABLE "SalesSession" ADD COLUMN "draftTranscript" TEXT;
ALTER TABLE "SalesSession" ADD COLUMN "aiDerivedFrom" TEXT;
ALTER TABLE "SalesSession" ADD COLUMN "cleanTranscriptProcessedAt" DATETIME;

ALTER TABLE "NegotiationMemory" ADD COLUMN "sourceTranscriptQuality" TEXT;

CREATE INDEX "SalesSession_cleanTranscriptProcessedAt_idx" ON "SalesSession"("cleanTranscriptProcessedAt");
CREATE INDEX "NegotiationMemory_sourceTranscriptQuality_idx" ON "NegotiationMemory"("sourceTranscriptQuality");
