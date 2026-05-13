-- AlterTable
ALTER TABLE "PackagingJob" ADD COLUMN "completedAt" DATETIME;
ALTER TABLE "PackagingJob" ADD COLUMN "errorCode" TEXT;
ALTER TABLE "PackagingJob" ADD COLUMN "errorMessage" TEXT;
ALTER TABLE "PackagingJob" ADD COLUMN "previewUrl" TEXT;
ALTER TABLE "PackagingJob" ADD COLUMN "providerJobId" TEXT;
ALTER TABLE "PackagingJob" ADD COLUMN "resultJson" TEXT;
ALTER TABLE "PackagingJob" ADD COLUMN "resultUrl" TEXT;
