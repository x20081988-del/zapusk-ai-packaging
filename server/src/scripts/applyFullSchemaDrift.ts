// Apply remaining additive schema drift to dev.db to bring it in line with schema.prisma.
// Idempotent: any "duplicate column" / "already exists" errors are ignored so the script
// is safe to re-run. Does NOT drop anything — destructive ops require user approval.
//
// Covers:
//   • SalesSession.createdById (+ index)
//   • ConversationAnalysis.createdById (+ index)
//   • AiRequestLedger table (+ 5 indexes)
//   • IdempotencyKey table (+ 2 indexes)
//   • PromptTemplateVersion: 11 missing columns (table is empty in dev, safe to extend)
//
// Skipped intentionally:
//   • DROP INDEX statements for 5 stale indexes (no runtime impact, leave them alone)
//   • DROP TABLE KnowledgeChunkFts* (FTS5 virtual table noise — Prisma can't model them)

import { prisma } from '../db.js';

type Step = { label: string; sql: string };

const STEPS: Step[] = [
  // ── SalesSession.createdById ────────────────────────────────────────────
  {
    label: 'ALTER TABLE SalesSession ADD COLUMN createdById',
    sql: `ALTER TABLE "SalesSession" ADD COLUMN "createdById" TEXT`,
  },
  {
    label: 'CREATE INDEX SalesSession_createdById_idx',
    sql: `CREATE INDEX IF NOT EXISTS "SalesSession_createdById_idx" ON "SalesSession"("createdById")`,
  },

  // ── ConversationAnalysis.createdById ────────────────────────────────────
  {
    label: 'ALTER TABLE ConversationAnalysis ADD COLUMN createdById',
    sql: `ALTER TABLE "ConversationAnalysis" ADD COLUMN "createdById" TEXT`,
  },
  {
    label: 'CREATE INDEX ConversationAnalysis_createdById_idx',
    sql: `CREATE INDEX IF NOT EXISTS "ConversationAnalysis_createdById_idx" ON "ConversationAnalysis"("createdById")`,
  },

  // ── AiRequestLedger ─────────────────────────────────────────────────────
  {
    label: 'CREATE TABLE AiRequestLedger',
    sql: `CREATE TABLE IF NOT EXISTS "AiRequestLedger" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "feature" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "model" TEXT NOT NULL,
      "projectId" TEXT,
      "actorId" TEXT,
      "requestType" TEXT NOT NULL,
      "success" BOOLEAN NOT NULL,
      "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
      "timeoutHit" BOOLEAN NOT NULL DEFAULT false,
      "latencyMs" INTEGER NOT NULL,
      "tokensIn" INTEGER,
      "tokensOut" INTEGER,
      "estimatedCostUsd" REAL,
      "charInput" INTEGER,
      "charOutput" INTEGER,
      "errorCode" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  { label: 'idx AiRequestLedger_feature_createdAt', sql: `CREATE INDEX IF NOT EXISTS "AiRequestLedger_feature_createdAt_idx" ON "AiRequestLedger"("feature", "createdAt")` },
  { label: 'idx AiRequestLedger_provider_createdAt', sql: `CREATE INDEX IF NOT EXISTS "AiRequestLedger_provider_createdAt_idx" ON "AiRequestLedger"("provider", "createdAt")` },
  { label: 'idx AiRequestLedger_projectId_createdAt', sql: `CREATE INDEX IF NOT EXISTS "AiRequestLedger_projectId_createdAt_idx" ON "AiRequestLedger"("projectId", "createdAt")` },
  { label: 'idx AiRequestLedger_actorId_createdAt', sql: `CREATE INDEX IF NOT EXISTS "AiRequestLedger_actorId_createdAt_idx" ON "AiRequestLedger"("actorId", "createdAt")` },
  { label: 'idx AiRequestLedger_success_createdAt', sql: `CREATE INDEX IF NOT EXISTS "AiRequestLedger_success_createdAt_idx" ON "AiRequestLedger"("success", "createdAt")` },

  // ── IdempotencyKey ──────────────────────────────────────────────────────
  {
    label: 'CREATE TABLE IdempotencyKey',
    sql: `CREATE TABLE IF NOT EXISTS "IdempotencyKey" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "key" TEXT NOT NULL,
      "actorId" TEXT NOT NULL,
      "route" TEXT NOT NULL,
      "requestHash" TEXT NOT NULL,
      "responseJson" TEXT NOT NULL,
      "statusCode" INTEGER NOT NULL,
      "expiresAt" DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  { label: 'idx IdempotencyKey_expiresAt', sql: `CREATE INDEX IF NOT EXISTS "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt")` },
  { label: 'idx IdempotencyKey_key_actorId_route_key', sql: `CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyKey_key_actorId_route_key" ON "IdempotencyKey"("key", "actorId", "route")` },

  // ── PromptTemplateVersion: 11 missing columns ───────────────────────────
  // Table is empty (verified), so NOT NULL with DEFAULT is safe.
  { label: 'ptv ADD key',         sql: `ALTER TABLE "PromptTemplateVersion" ADD COLUMN "key" TEXT NOT NULL DEFAULT ''` },
  { label: 'ptv ADD name',        sql: `ALTER TABLE "PromptTemplateVersion" ADD COLUMN "name" TEXT NOT NULL DEFAULT ''` },
  { label: 'ptv ADD category',    sql: `ALTER TABLE "PromptTemplateVersion" ADD COLUMN "category" TEXT NOT NULL DEFAULT ''` },
  { label: 'ptv ADD description', sql: `ALTER TABLE "PromptTemplateVersion" ADD COLUMN "description" TEXT` },
  { label: 'ptv ADD active',      sql: `ALTER TABLE "PromptTemplateVersion" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true` },
  { label: 'ptv ADD provider',    sql: `ALTER TABLE "PromptTemplateVersion" ADD COLUMN "provider" TEXT` },
  { label: 'ptv ADD tool',        sql: `ALTER TABLE "PromptTemplateVersion" ADD COLUMN "tool" TEXT` },
  { label: 'ptv ADD model',       sql: `ALTER TABLE "PromptTemplateVersion" ADD COLUMN "model" TEXT` },
  { label: 'ptv ADD outputType',  sql: `ALTER TABLE "PromptTemplateVersion" ADD COLUMN "outputType" TEXT` },
  { label: 'ptv ADD diffSummary', sql: `ALTER TABLE "PromptTemplateVersion" ADD COLUMN "diffSummary" TEXT` },
];

function isIgnorable(err: unknown): boolean {
  const msg = (err as Error)?.message ?? String(err);
  return /duplicate column|already exists/i.test(msg);
}

async function main() {
  console.log(`Applying ${STEPS.length} additive schema steps…\n`);
  let applied = 0;
  let skipped = 0;
  for (const step of STEPS) {
    try {
      await prisma.$executeRawUnsafe(step.sql);
      console.log(`  ✓ ${step.label}`);
      applied++;
    } catch (err) {
      if (isIgnorable(err)) {
        console.log(`  – ${step.label} (already present)`);
        skipped++;
      } else {
        console.error(`  ✗ ${step.label}`);
        throw err;
      }
    }
  }
  console.log(`\nDone. applied=${applied} skipped=${skipped}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Schema drift apply failed:', err);
  process.exit(1);
});
