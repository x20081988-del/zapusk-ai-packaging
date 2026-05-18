// Sprint 61.P1 — debug probe over benchmark fixtures.

import { prisma } from '../db.js';
import { retrieveKnowledgeForTranscript } from '../services/knowledgeService.js';
import { initKnowledgeFts, isFtsAvailable } from '../services/knowledgeFts.js';
import { cleanup, seed, BENCH_PROJECT_ID } from './retrievalBenchmarkFixtures.js';

async function main(): Promise<void> {
  await initKnowledgeFts();
  await cleanup();
  await seed();

  const sources = await prisma.knowledgeSource.findMany({
    where: { title: { contains: 'BENCH' } },
  });
  console.log(`FTS available: ${isFtsAvailable()}`);
  console.log(`Bench sources count: ${sources.length}`);
  for (const s of sources) {
    const chunks = await prisma.knowledgeChunk.findMany({
      where: { sourceId: s.id },
      select: { id: true, chunkIndex: true, text: true },
    });
    console.log(`\n  ${s.title}`);
    console.log(`    scope=${s.scope} type=${s.sourceType} status=${s.status} visibility=${s.visibility} env=${s.environment} isCandidate=${s.isCandidate}`);
    console.log(`    chunks=${chunks.length}`);
    for (const c of chunks) {
      console.log(`      [${c.chunkIndex}] len=${c.text.length} head="${c.text.slice(0, 80).replace(/\n/g, '⏎')}"`);
    }
  }

  console.log('\n--- direct retrieve test ---');
  const queries = [
    'чистая прибыль 2027 финмодель выручка',
    'команда CFO Анна Соловьёва',
    'якорный арендатор риск концентрация',
    'строительство третьей очереди',
    'недвижимость на стройке слишком рискованно',
  ];
  for (const q of queries) {
    const r = await retrieveKnowledgeForTranscript(q, {
      projectId: BENCH_PROJECT_ID,
      role: 'ADMIN',
      topN: 5,
      feature: 'sales_assistant.analyze',
      mode: 'debug',
      financeBoost: true,
    });
    console.log(`\n  query: "${q}"`);
    console.log(`  retrieved=${r.sources.length} scanned=${r.totalChunksScanned}`);
    for (const s of r.sources) {
      console.log(`    - ${s.title.slice(0, 50)}  score=${s.score.toFixed(4)}  reasons=${s.breakdown?.reasons.join(',')}`);
    }
  }

  await cleanup();
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
