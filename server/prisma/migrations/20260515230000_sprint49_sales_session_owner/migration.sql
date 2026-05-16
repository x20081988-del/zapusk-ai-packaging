-- Sprint 49 hotfix 10 — allow AI-assistant meetings without a project while
-- keeping founder-level ownership. Existing rows remain NULL and are visible
-- only to admin/manager; new orphan meetings carry the creator's id so the
-- founder sees them in their own meetings list.
ALTER TABLE "SalesSession" ADD COLUMN "createdById" TEXT;

CREATE INDEX "SalesSession_createdById_idx" ON "SalesSession"("createdById");
