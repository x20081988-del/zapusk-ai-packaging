// One-shot read-only check that Luce Silva demo showcase upgrade is applied.
// Sprint 62.P3.
import { prisma } from '../db.js';

async function main() {
  const p = await prisma.project.findFirst({
    where: { name: 'Luce Silva', isDemo: true },
    include: { brief: true, investorTerms: true, packagingJobs: true, artefactReviews: true },
  });
  if (!p) {
    console.log('Luce Silva (isDemo=true) NOT FOUND');
    process.exit(1);
  }
  console.log('id=', p.id);
  console.log('status=', p.status, '· investmentTrack=', p.investmentTrack, '· isDemo=', p.isDemo);
  console.log('brief.missingData=', p.brief?.missingData);
  const interviewLen = JSON.parse(p.brief?.interviewAnswers || '[]').length;
  console.log('brief.interviewAnswers.length=', interviewLen);
  console.log(
    'investorTerms=',
    p.investorTerms
      ? `amount=${p.investorTerms.amount}, equity=${p.investorTerms.equityPercent}%, payback=${p.investorTerms.payback}`
      : 'NONE',
  );
  console.log('packagingJobs.count=', p.packagingJobs.length);
  const succeeded = p.packagingJobs.filter((j) => j.status === 'succeeded' && j.completedBy);
  console.log('packagingJobs.succeeded_with_completedBy=', succeeded.length);
  const byStatus = p.packagingJobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] || 0) + 1;
    return acc;
  }, {});
  console.log('packagingJobs.byStatus=', byStatus);
  const legalReviews = p.artefactReviews.filter((r) => r.artefactKind === 'legal' && r.approved);
  console.log('legalReviews.approved=', legalReviews.map((r) => r.artefactKey));
  const briefReview = p.artefactReviews.find((r) => r.artefactKind === 'brief' && r.approved);
  console.log('briefReview.approved=', briefReview ? 'YES' : 'NO');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
