-- AlterTable
ALTER TABLE "GeneratedPrompt" ADD COLUMN "feedback" TEXT;

-- AlterTable
ALTER TABLE "ProjectBrief" ADD COLUMN "missingByCategory" TEXT;

-- CreateTable
CREATE TABLE "ArtefactReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "artefactKind" TEXT NOT NULL,
    "artefactKey" TEXT NOT NULL,
    "artefactId" TEXT,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "needsRework" BOOLEAN NOT NULL DEFAULT false,
    "reviewer" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ArtefactReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ArtefactReview_projectId_artefactKey_idx" ON "ArtefactReview"("projectId", "artefactKey");
