-- Sprint 52 P0.1 — Template Context Attachments.
-- Admin прикрепляет к PromptTemplate context files (PDF / DOCX / TXT / MD /
-- датасеты / презентации). MVP — только relational metadata + storage path;
-- RAG / vector search накладываются сверху позже без миграции.

CREATE TABLE "TemplateAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TemplateAttachment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PromptTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TemplateAttachment_templateId_idx" ON "TemplateAttachment"("templateId");
CREATE INDEX "TemplateAttachment_createdAt_idx" ON "TemplateAttachment"("createdAt");
