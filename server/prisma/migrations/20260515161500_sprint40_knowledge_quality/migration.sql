-- AlterTable
ALTER TABLE "KnowledgeSource" ADD COLUMN "isCandidate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "KnowledgeSource" ADD COLUMN "qualityScore" INTEGER;
ALTER TABLE "KnowledgeSource" ADD COLUMN "qualityReasonJson" TEXT;
ALTER TABLE "KnowledgeSource" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "KnowledgeSource" ADD COLUMN "originType" TEXT;
ALTER TABLE "KnowledgeSource" ADD COLUMN "originId" TEXT;
ALTER TABLE "KnowledgeSource" ADD COLUMN "verifiedById" TEXT;
ALTER TABLE "KnowledgeSource" ADD COLUMN "verifiedAt" DATETIME;
ALTER TABLE "KnowledgeSource" ADD COLUMN "publishedAt" DATETIME;
ALTER TABLE "KnowledgeSource" ADD COLUMN "disabledReason" TEXT;
ALTER TABLE "KnowledgeSource" ADD COLUMN "lastRetrievedAt" DATETIME;
ALTER TABLE "KnowledgeSource" ADD COLUMN "retrievalCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "KnowledgeSource" ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'production';

-- CreateIndex
CREATE INDEX "KnowledgeSource_isCandidate_status_idx" ON "KnowledgeSource"("isCandidate", "status");

-- CreateIndex
CREATE INDEX "KnowledgeSource_contentHash_idx" ON "KnowledgeSource"("contentHash");

-- CreateIndex
CREATE INDEX "KnowledgeSource_environment_status_idx" ON "KnowledgeSource"("environment", "status");
