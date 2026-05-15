-- CreateTable
CREATE TABLE "KnowledgeRetrievalEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "projectId" TEXT,
    "feature" TEXT NOT NULL,
    "sourceIdsJson" TEXT NOT NULL,
    "chunkIdsJson" TEXT,
    "sourceCount" INTEGER NOT NULL,
    "totalChars" INTEGER NOT NULL,
    "conversationAnalysisId" TEXT,
    "salesSessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "KnowledgeRetrievalEvent_projectId_createdAt_idx" ON "KnowledgeRetrievalEvent"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeRetrievalEvent_feature_createdAt_idx" ON "KnowledgeRetrievalEvent"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeRetrievalEvent_actorId_createdAt_idx" ON "KnowledgeRetrievalEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeRetrievalEvent_createdAt_idx" ON "KnowledgeRetrievalEvent"("createdAt");
