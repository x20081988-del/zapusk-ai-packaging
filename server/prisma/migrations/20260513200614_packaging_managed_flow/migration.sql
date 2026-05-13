-- AlterTable
ALTER TABLE "PackagingJob" ADD COLUMN "completedBy" TEXT;
ALTER TABLE "PackagingJob" ADD COLUMN "managerComment" TEXT;

-- CreateIndex
CREATE INDEX "PackagingJob_status_idx" ON "PackagingJob"("status");
