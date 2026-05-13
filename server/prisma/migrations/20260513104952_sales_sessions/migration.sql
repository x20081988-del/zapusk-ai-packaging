-- CreateTable
CREATE TABLE "SalesSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "leadId" TEXT,
    "investorName" TEXT,
    "investorPhone" TEXT,
    "source" TEXT NOT NULL DEFAULT 'sales_assistant',
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "transcript" TEXT,
    "summary" TEXT,
    "investorInterest" TEXT,
    "checkRange" TEXT,
    "objections" TEXT,
    "risks" TEXT,
    "materialsToSend" TEXT,
    "nextStep" TEXT,
    "followUpMessage" TEXT,
    "probabilityScore" INTEGER,
    "investorType" TEXT,
    "tone" TEXT,
    "managerNote" TEXT,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "fellBackToMock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SalesSession_projectId_idx" ON "SalesSession"("projectId");

-- CreateIndex
CREATE INDEX "SalesSession_leadId_idx" ON "SalesSession"("leadId");
