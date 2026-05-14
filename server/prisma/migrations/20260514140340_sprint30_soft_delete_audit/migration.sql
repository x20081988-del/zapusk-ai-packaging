-- AlterTable
ALTER TABLE "ArtefactReview" ADD COLUMN "archivedAt" DATETIME;

-- AlterTable
ALTER TABLE "ConversationAnalysis" ADD COLUMN "archivedAt" DATETIME;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "archivedAt" DATETIME;

-- AlterTable
ALTER TABLE "SalesSession" ADD COLUMN "archivedAt" DATETIME;

-- AlterTable
ALTER TABLE "UploadedFile" ADD COLUMN "archivedAt" DATETIME;

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "payload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- CreateIndex
CREATE INDEX "AuditEvent_targetType_targetId_idx" ON "AuditEvent"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");
