-- Sprint 52 P0.2 + P0.3
-- 1) SalesSession gets `outcome` and `managerOutcomeNotes` columns + index.
-- 2) NegotiationMemory table — foundation for negotiation memory layer.
--    JSON arrays (projectIds, objections, tags) stored as TEXT (SQLite has
--    no native JSON / array), serialized by service layer.
--
-- Additive only. No data backfill needed — existing SalesSession rows get
-- outcome=NULL (treated as 'unknown' at the service layer).

ALTER TABLE "SalesSession" ADD COLUMN "outcome" TEXT;
ALTER TABLE "SalesSession" ADD COLUMN "managerOutcomeNotes" TEXT;

CREATE INDEX "SalesSession_outcome_idx" ON "SalesSession"("outcome");

CREATE TABLE "NegotiationMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salesSessionId" TEXT,
    "primaryProjectId" TEXT,
    "projectIds" TEXT NOT NULL DEFAULT '[]',
    "investorName" TEXT,
    "investorPhone" TEXT,
    "transcript" TEXT NOT NULL,
    "summary" TEXT,
    "outcome" TEXT,
    "objections" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "speakerInsights" TEXT,
    "managerNotes" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NegotiationMemory_salesSessionId_fkey" FOREIGN KEY ("salesSessionId") REFERENCES "SalesSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "NegotiationMemory_investorName_idx" ON "NegotiationMemory"("investorName");
CREATE INDEX "NegotiationMemory_primaryProjectId_idx" ON "NegotiationMemory"("primaryProjectId");
CREATE INDEX "NegotiationMemory_createdById_idx" ON "NegotiationMemory"("createdById");
CREATE INDEX "NegotiationMemory_createdAt_idx" ON "NegotiationMemory"("createdAt");
CREATE INDEX "NegotiationMemory_outcome_idx" ON "NegotiationMemory"("outcome");
