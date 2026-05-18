-- Sprint 62 P4 — sheet/section provenance for structured documents.
-- Additive: two nullable columns, no defaults, no data backfill needed.
-- Legacy chunks keep sectionLabel=NULL (treated as "unstructured prose").
ALTER TABLE "KnowledgeChunk" ADD COLUMN "sectionLabel" TEXT;
ALTER TABLE "KnowledgeChunk" ADD COLUMN "headerContext" TEXT;
