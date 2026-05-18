-- Sprint 62 P5 — Numeric facts layer V1. Deterministic financial grounding.
CREATE TABLE "ProjectNumericFact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "metricSlug" TEXT NOT NULL,
  "period" TEXT,
  "value" REAL NOT NULL,
  "unit" TEXT,
  "sourceFileId" TEXT,
  "sourceChunkId" TEXT,
  "sectionLabel" TEXT,
  "rowLabel" TEXT,
  "columnHeader" TEXT,
  "confidence" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectNumericFact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProjectNumericFact_projectId_metricSlug_idx" ON "ProjectNumericFact"("projectId", "metricSlug");
CREATE INDEX "ProjectNumericFact_projectId_period_idx" ON "ProjectNumericFact"("projectId", "period");
CREATE INDEX "ProjectNumericFact_sourceFileId_idx" ON "ProjectNumericFact"("sourceFileId");
