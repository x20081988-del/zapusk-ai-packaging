-- Sprint 48 — AI reliability ledger + prompt template versioning.
-- Metadata-only: no prompts, transcripts, chunks, or raw AI outputs.

ALTER TABLE "PromptTemplate" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PromptTemplate" ADD COLUMN "checksum" TEXT;
ALTER TABLE "PromptTemplate" ADD COLUMN "previousVersionId" TEXT;
ALTER TABLE "PromptTemplate" ADD COLUMN "changedById" TEXT;
ALTER TABLE "PromptTemplate" ADD COLUMN "publishedAt" DATETIME;

CREATE TABLE "PromptTemplateVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "previousVersionId" TEXT,
    "changedById" TEXT,
    "publishedAt" DATETIME,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "provider" TEXT,
    "tool" TEXT,
    "model" TEXT,
    "outputType" TEXT,
    "diffSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromptTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PromptTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PromptTemplateVersion_templateId_version_key" ON "PromptTemplateVersion"("templateId", "version");
CREATE INDEX "PromptTemplateVersion_templateId_createdAt_idx" ON "PromptTemplateVersion"("templateId", "createdAt");
CREATE INDEX "PromptTemplateVersion_changedById_createdAt_idx" ON "PromptTemplateVersion"("changedById", "createdAt");

CREATE TABLE "AiRequestLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "projectId" TEXT,
    "actorId" TEXT,
    "requestType" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "timeoutHit" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "estimatedCostUsd" REAL,
    "charInput" INTEGER,
    "charOutput" INTEGER,
    "errorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "AiRequestLedger_feature_createdAt_idx" ON "AiRequestLedger"("feature", "createdAt");
CREATE INDEX "AiRequestLedger_provider_createdAt_idx" ON "AiRequestLedger"("provider", "createdAt");
CREATE INDEX "AiRequestLedger_projectId_createdAt_idx" ON "AiRequestLedger"("projectId", "createdAt");
CREATE INDEX "AiRequestLedger_actorId_createdAt_idx" ON "AiRequestLedger"("actorId", "createdAt");
CREATE INDEX "AiRequestLedger_success_createdAt_idx" ON "AiRequestLedger"("success", "createdAt");
