// Sprint 62.P1 — DB doctor.
//
// Run via:   npm run db:doctor   (from project root)
//   or:     cd server && npx tsx src/scripts/dbDoctor.ts
//
// What it does:
//   • Read-only check that critical tables + columns exist in the connected DB.
//   • Returns exit code 0 if healthy, 1 if drift detected.
//   • Suggests next step (run prisma migrate dev / applyFullSchemaDrift) for
//     each failing check, but does NOT modify the DB.
//
// What it does NOT do:
//   • Never drops, alters, resets, or seeds. For schema repair use:
//       npx tsx src/scripts/applyFullSchemaDrift.ts
//     or:
//       npx prisma migrate dev
//
// Why it exists:
//   Dev databases drift over time as branches add migrations. Until Sprint 62
//   we discovered this only when an API route threw P2022 in production-like
//   testing. This doctor catches drift up front in 1 second.

import 'dotenv/config';
import { prisma } from '../db.js';

interface Check {
  name: string;
  // Returns null if check passes, or a string explaining what failed.
  run: () => Promise<string | null>;
  remediation: string;
}

const CHECKS: Check[] = [
  // ── PromptTemplate Sprint 48 columns ────────────────────────────────────
  {
    name: 'PromptTemplate.version exists (Sprint 48)',
    run: async () => {
      try {
        await prisma.$queryRawUnsafe('SELECT version FROM "PromptTemplate" LIMIT 1');
        return null;
      } catch (err) {
        return (err as Error).message.slice(0, 160);
      }
    },
    remediation: 'cd server && npx tsx src/scripts/applyFullSchemaDrift.ts',
  },
  {
    name: 'PromptTemplate.checksum exists (Sprint 48)',
    run: async () => {
      try {
        await prisma.$queryRawUnsafe('SELECT checksum FROM "PromptTemplate" LIMIT 1');
        return null;
      } catch (err) {
        return (err as Error).message.slice(0, 160);
      }
    },
    remediation: 'cd server && npx tsx src/scripts/applyFullSchemaDrift.ts',
  },

  // ── SalesSession.createdById (Sprint 42/43 era) ─────────────────────────
  {
    name: 'SalesSession.createdById exists',
    run: async () => {
      try {
        await prisma.$queryRawUnsafe('SELECT createdById FROM "SalesSession" LIMIT 1');
        return null;
      } catch (err) {
        return (err as Error).message.slice(0, 160);
      }
    },
    remediation: 'cd server && npx tsx src/scripts/applyFullSchemaDrift.ts',
  },
  {
    name: 'ConversationAnalysis.createdById exists',
    run: async () => {
      try {
        await prisma.$queryRawUnsafe('SELECT createdById FROM "ConversationAnalysis" LIMIT 1');
        return null;
      } catch (err) {
        return (err as Error).message.slice(0, 160);
      }
    },
    remediation: 'cd server && npx tsx src/scripts/applyFullSchemaDrift.ts',
  },

  // ── AiRequestLedger (Sprint 48) ─────────────────────────────────────────
  {
    name: 'AiRequestLedger table exists',
    run: async () => {
      try {
        await prisma.aiRequestLedger.count();
        return null;
      } catch (err) {
        return (err as Error).message.slice(0, 160);
      }
    },
    remediation: 'cd server && npx tsx src/scripts/applyFullSchemaDrift.ts',
  },

  // ── IdempotencyKey (Sprint 49+) ─────────────────────────────────────────
  {
    name: 'IdempotencyKey table exists',
    run: async () => {
      try {
        await prisma.idempotencyKey.count();
        return null;
      } catch (err) {
        return (err as Error).message.slice(0, 160);
      }
    },
    remediation: 'cd server && npx tsx src/scripts/applyFullSchemaDrift.ts',
  },

  // ── PromptTemplateVersion expanded columns (Sprint 48) ──────────────────
  {
    name: 'PromptTemplateVersion has expanded columns (key/name/category/body/active)',
    run: async () => {
      try {
        await prisma.$queryRawUnsafe('SELECT key, name, category, body, active FROM "PromptTemplateVersion" LIMIT 1');
        return null;
      } catch (err) {
        return (err as Error).message.slice(0, 160);
      }
    },
    remediation: 'cd server && npx tsx src/scripts/applyFullSchemaDrift.ts',
  },

  // ── Seed integrity ──────────────────────────────────────────────────────
  {
    name: 'realtime_transcription template seeded',
    run: async () => {
      try {
        const t = await prisma.promptTemplate.findFirst({ where: { key: 'realtime_transcription' } });
        if (!t) return 'template missing in DB';
        if (!t.active) return 'template present but inactive';
        if (!t.body || t.body.length < 50) return 'template body too short';
        return null;
      } catch (err) {
        return (err as Error).message.slice(0, 160);
      }
    },
    remediation: 'cd server && npm run db:seed',
  },
  {
    name: 'At least one user with role=ADMIN exists',
    run: async () => {
      try {
        const count = await prisma.user.count({ where: { role: 'ADMIN' } });
        if (count === 0) return 'no ADMIN user';
        return null;
      } catch (err) {
        return (err as Error).message.slice(0, 160);
      }
    },
    remediation: 'Set BOOTSTRAP_ADMIN_PASSWORD in env, then `cd server && npm run db:seed`',
  },
];

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  DB Doctor — Zapusk AI Packaging (Sprint 62.P1)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ?? '(unset)'}\n`);

  let pass = 0;
  let fail = 0;
  const failed: Array<{ name: string; message: string; remediation: string }> = [];

  for (const check of CHECKS) {
    const result = await check.run();
    if (result === null) {
      console.log(`  ✓ ${check.name}`);
      pass++;
    } else {
      console.log(`  ✗ ${check.name}`);
      console.log(`      reason: ${result}`);
      failed.push({ name: check.name, message: result, remediation: check.remediation });
      fail++;
    }
  }

  console.log();
  console.log(`  passed=${pass}  failed=${fail}\n`);

  if (failed.length > 0) {
    console.log('Suggested next steps:');
    const uniqueRemediations = Array.from(new Set(failed.map((f) => f.remediation)));
    for (const r of uniqueRemediations) {
      console.log(`  • ${r}`);
    }
    console.log();
  }

  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[db-doctor] failed:', err);
  process.exit(1);
});
