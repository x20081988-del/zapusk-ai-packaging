// Sprint 62.VERIFICATION P2 — Read-only inspector of dev DB shape.
// Tells us which projects + KB sources we can run real-data tests against.
//
// Read-only: no writes.

import { prisma } from '../db.js';
import { initKnowledgeFts, isFtsAvailable } from '../services/knowledgeFts.js';

async function main(): Promise<void> {
  await initKnowledgeFts();
  console.log(`FTS available: ${isFtsAvailable()}`);

  const projects = await prisma.project.findMany({
    where: { archivedAt: null },
    select: {
      id: true, name: true, industry: true, stage: true,
      _count: { select: { files: true, knowledgeSources: true, numericFacts: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  console.log(`\nProjects in dev DB: ${projects.length}`);
  for (const p of projects) {
    console.log(`  ${p.id.slice(0, 12)}  ${p.name.padEnd(40)}  ind=${p.industry ?? '-'}  stage=${p.stage ?? '-'}  files=${p._count.files}  KB=${p._count.knowledgeSources}  facts=${p._count.numericFacts}`);
  }

  const totalSources = await prisma.knowledgeSource.count({ where: { archivedAt: null } });
  const projectSources = await prisma.knowledgeSource.count({ where: { archivedAt: null, scope: 'project' } });
  const globalSources = await prisma.knowledgeSource.count({ where: { archivedAt: null, scope: 'global' } });
  const totalChunks = await prisma.knowledgeChunk.count();
  const chunksWithSection = await prisma.knowledgeChunk.count({ where: { sectionLabel: { not: null } } });
  const totalFacts = await prisma.projectNumericFact.count();
  const totalFiles = await prisma.uploadedFile.count({ where: { archivedAt: null } });

  console.log('\n── KB & files overall ──');
  console.log(`  KnowledgeSource total / project / global: ${totalSources} / ${projectSources} / ${globalSources}`);
  console.log(`  KnowledgeChunk total: ${totalChunks}`);
  console.log(`  KnowledgeChunk with sectionLabel (Sprint 62 P4): ${chunksWithSection}`);
  console.log(`  ProjectNumericFact total: ${totalFacts}`);
  console.log(`  UploadedFile total (non-archived): ${totalFiles}`);

  // Files per category
  const byCat = await prisma.uploadedFile.groupBy({
    by: ['category'],
    where: { archivedAt: null },
    _count: true,
  });
  console.log('\n── Files by category ──');
  for (const c of byCat) console.log(`  ${c.category.padEnd(20)} ${c._count}`);

  // Sources by sourceType
  const bySrcType = await prisma.knowledgeSource.groupBy({
    by: ['sourceType', 'scope'],
    where: { archivedAt: null },
    _count: true,
  });
  console.log('\n── KnowledgeSource by sourceType × scope ──');
  for (const s of bySrcType) console.log(`  ${s.sourceType.padEnd(28)} ${s.scope.padEnd(10)} ${s._count}`);

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
