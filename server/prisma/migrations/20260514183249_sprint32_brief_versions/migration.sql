-- CreateTable
CREATE TABLE "ProjectBriefVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "businessSummary" TEXT,
    "monetization" TEXT,
    "keyMetrics" TEXT,
    "investmentAsk" TEXT,
    "strengths" TEXT,
    "weaknesses" TEXT,
    "missingData" TEXT,
    "missingByCategory" TEXT,
    "interviewAnswers" TEXT,
    "napkin" TEXT,
    "rawAIResponse" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectBriefVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProjectBriefVersion_projectId_version_idx" ON "ProjectBriefVersion"("projectId", "version");

-- CreateIndex
CREATE INDEX "ProjectBriefVersion_projectId_createdAt_idx" ON "ProjectBriefVersion"("projectId", "createdAt");
