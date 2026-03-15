-- AlterEnum
-- Postgres enums can't be updated within a transaction for ADD VALUE
-- So Prisma executes these separately. 
-- In a manual migration file, we just list them.
ALTER TYPE "VulnerabilityStatus" ADD VALUE 'InProgress';
ALTER TYPE "VulnerabilityStatus" ADD VALUE 'InProgressWithCR';

-- AlterTable
ALTER TABLE "Vulnerability" ADD COLUMN "crNumber" TEXT;

-- AlterTable
ALTER TABLE "VulnerabilityHistory" ADD COLUMN "crNumber" TEXT;
