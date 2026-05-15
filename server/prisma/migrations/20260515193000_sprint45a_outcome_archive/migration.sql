ALTER TABLE "AssistantOutcomeEvent" ADD COLUMN "archivedAt" DATETIME;

CREATE INDEX "AssistantOutcomeEvent_archivedAt_idx" ON "AssistantOutcomeEvent"("archivedAt");
