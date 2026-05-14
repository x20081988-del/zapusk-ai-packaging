import { prisma } from '../db.js';
import { assertNotProduction } from '../seedGuards.js';

// Sprint 29 — destructive reset для dev. Стирает все пользовательские данные
// и оставляет только bootstrap/demo seed. Под production отказывается с
// явной ошибкой, чтобы случайный запуск не зачистил реальных клиентов.
//
// Использование: `npm run db:seed:dev-reset` (только локально, без
// NODE_ENV=production).

async function devReset(): Promise<void> {
  assertNotProduction('db:seed:dev-reset wipe');
  console.log('[seed:dev-reset] wiping local database (NODE_ENV != production)...');

  // Порядок важен — сначала зависимые таблицы, потом основные.
  await prisma.artefactReview.deleteMany();
  await prisma.salesSession.deleteMany();
  await prisma.conversationAnalysis.deleteMany();
  await prisma.packagingJob.deleteMany();
  await prisma.generatedDocument.deleteMany();
  await prisma.generatedPrompt.deleteMany();
  await prisma.projectBrief.deleteMany();
  await prisma.uploadedFile.deleteMany();
  await prisma.project.deleteMany();
  await prisma.inviteToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.promptTemplate.deleteMany();
  await prisma.financialModelTemplate.deleteMany();

  console.log('[seed:dev-reset] wipe complete. Now run `npm run db:seed` to reseed.');
}

devReset()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
