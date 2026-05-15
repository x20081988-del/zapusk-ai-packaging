-- CreateTable
CREATE TABLE "AssistantAdviceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "actorId" TEXT,
    "salesSessionId" TEXT,
    "conversationAnalysisId" TEXT,
    "retrievalEventId" TEXT,
    "phase" TEXT NOT NULL DEFAULT 'full',
    "spinStage" TEXT,
    "tone" TEXT,
    "mainQuestion" TEXT,
    "nextStep" TEXT,
    "recommendation" TEXT,
    "confidence" INTEGER,
    "usedSourceIdsJson" TEXT NOT NULL,
    "usedChunkIdsJson" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "fellBackToMock" BOOLEAN NOT NULL DEFAULT false,
    "promptSource" TEXT,
    "promptTemplateId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AssistantAdviceEvent_projectId_createdAt_idx" ON "AssistantAdviceEvent"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantAdviceEvent_actorId_createdAt_idx" ON "AssistantAdviceEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantAdviceEvent_salesSessionId_createdAt_idx" ON "AssistantAdviceEvent"("salesSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantAdviceEvent_conversationAnalysisId_createdAt_idx" ON "AssistantAdviceEvent"("conversationAnalysisId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantAdviceEvent_retrievalEventId_idx" ON "AssistantAdviceEvent"("retrievalEventId");

-- CreateTable
CREATE TABLE "AssistantOutcomeEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adviceEventId" TEXT,
    "projectId" TEXT,
    "salesSessionId" TEXT,
    "conversationAnalysisId" TEXT,
    "investorName" TEXT,
    "outcomeType" TEXT NOT NULL,
    "valueRub" REAL,
    "probabilityAfter" INTEGER,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantOutcomeEvent_adviceEventId_fkey" FOREIGN KEY ("adviceEventId") REFERENCES "AssistantAdviceEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AssistantOutcomeEvent_adviceEventId_createdAt_idx" ON "AssistantOutcomeEvent"("adviceEventId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantOutcomeEvent_projectId_createdAt_idx" ON "AssistantOutcomeEvent"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantOutcomeEvent_salesSessionId_createdAt_idx" ON "AssistantOutcomeEvent"("salesSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantOutcomeEvent_conversationAnalysisId_createdAt_idx" ON "AssistantOutcomeEvent"("conversationAnalysisId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantOutcomeEvent_outcomeType_createdAt_idx" ON "AssistantOutcomeEvent"("outcomeType", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantOutcomeEvent_createdById_createdAt_idx" ON "AssistantOutcomeEvent"("createdById", "createdAt");
