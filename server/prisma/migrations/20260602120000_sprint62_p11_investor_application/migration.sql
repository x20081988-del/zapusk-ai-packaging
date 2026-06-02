-- CreateTable
CREATE TABLE "InvestorApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "email" TEXT,
    "checkRange" TEXT NOT NULL,
    "interest" TEXT NOT NULL,
    "comment" TEXT,
    "source" TEXT NOT NULL DEFAULT 'opportunities',
    "status" TEXT NOT NULL DEFAULT 'new',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InvestorApplication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "InvestorApplication_projectId_createdAt_idx" ON "InvestorApplication"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "InvestorApplication_isDemo_status_idx" ON "InvestorApplication"("isDemo", "status");
