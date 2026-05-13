-- AlterTable
ALTER TABLE "PromptTemplate" ADD COLUMN "model" TEXT;
ALTER TABLE "PromptTemplate" ADD COLUMN "outputType" TEXT;
ALTER TABLE "PromptTemplate" ADD COLUMN "provider" TEXT;
ALTER TABLE "PromptTemplate" ADD COLUMN "tool" TEXT;

-- CreateTable
CREATE TABLE "PackagingJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "templateId" TEXT,
    "templateKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "model" TEXT,
    "outputType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'succeeded',
    "prompt" TEXT NOT NULL,
    "resultPreview" TEXT,
    "generatedPromptId" TEXT,
    "generatedDocumentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackagingJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PackagingJob_projectId_createdAt_idx" ON "PackagingJob"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "PackagingJob_projectId_outputType_idx" ON "PackagingJob"("projectId", "outputType");
