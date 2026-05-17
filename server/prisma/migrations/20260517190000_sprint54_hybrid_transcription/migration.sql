-- Sprint 54 P0 — Hybrid transcription (draft + clean final).
-- Realtime sometimes hallucinates; offline gpt-4o-transcribe on the recorded
-- audio is the clean source of truth. These additive columns let UI + AI
-- pipelines distinguish draft from clean transcripts.
--
-- Additive only. Existing rows keep all three columns NULL → service layer
-- treats NULL as 'realtime_draft' / 'draft' / no-audio (back-compat).

ALTER TABLE "SalesSession" ADD COLUMN "transcriptSource" TEXT;
ALTER TABLE "SalesSession" ADD COLUMN "transcriptQualityStatus" TEXT;
ALTER TABLE "SalesSession" ADD COLUMN "audioStoragePath" TEXT;

CREATE INDEX "SalesSession_transcriptQualityStatus_idx" ON "SalesSession"("transcriptQualityStatus");
