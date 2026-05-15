-- Sprint 48A — allow AI conversation analysis without a project while keeping
-- founder-level ownership. Existing rows remain NULL and stay project-owned
-- via projectId or admin-visible if orphaned.
ALTER TABLE "ConversationAnalysis" ADD COLUMN "createdById" TEXT;

CREATE INDEX "ConversationAnalysis_createdById_idx" ON "ConversationAnalysis"("createdById");
