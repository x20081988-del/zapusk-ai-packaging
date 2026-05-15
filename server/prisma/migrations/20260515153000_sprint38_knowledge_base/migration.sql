-- CreateTable
CREATE TABLE "KnowledgeSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "visibility" TEXT NOT NULL DEFAULT 'internal',
    "uploadedFileId" TEXT,
    "conversationAnalysisId" TEXT,
    "salesSessionId" TEXT,
    "tagsJson" TEXT,
    "summary" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "KnowledgeSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "projectId" TEXT,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "redactedText" TEXT,
    "tokenEstimate" INTEGER NOT NULL,
    "tagsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "KnowledgeSource_scope_status_idx" ON "KnowledgeSource"("scope", "status");

-- CreateIndex
CREATE INDEX "KnowledgeSource_projectId_status_idx" ON "KnowledgeSource"("projectId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeSource_sourceType_status_idx" ON "KnowledgeSource"("sourceType", "status");

-- CreateIndex
CREATE INDEX "KnowledgeSource_createdAt_idx" ON "KnowledgeSource"("createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_sourceId_chunkIndex_idx" ON "KnowledgeChunk"("sourceId", "chunkIndex");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_projectId_idx" ON "KnowledgeChunk"("projectId");
