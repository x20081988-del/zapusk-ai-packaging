-- CreateTable
CREATE TABLE "ConversationAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "investorName" TEXT,
    "source" TEXT NOT NULL DEFAULT 'audio_upload',
    "originalFileName" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "audioUrl" TEXT,
    "transcript" TEXT,
    "transcriptProvider" TEXT,
    "transcriptModel" TEXT,
    "transcriptDurationSec" REAL,
    "analysis" TEXT,
    "aiScore" INTEGER,
    "probabilityScore" INTEGER,
    "sentiment" TEXT,
    "spinStage" TEXT,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "fellBackToMock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConversationAnalysis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ConversationAnalysis_projectId_idx" ON "ConversationAnalysis"("projectId");

-- CreateIndex
CREATE INDEX "ConversationAnalysis_createdAt_idx" ON "ConversationAnalysis"("createdAt");
