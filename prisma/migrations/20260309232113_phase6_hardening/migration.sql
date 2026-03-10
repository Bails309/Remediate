/*
  Warnings:

  - You are about to drop the `_VulnerabilityCollaborators` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('LOCAL', 'AZURE');

-- DropForeignKey
ALTER TABLE "PentestExecution" DROP CONSTRAINT "PentestExecution_userId_fkey";

-- DropForeignKey
ALTER TABLE "UploadHistory" DROP CONSTRAINT "UploadHistory_uploadedBy_fkey";

-- DropForeignKey
ALTER TABLE "_VulnerabilityCollaborators" DROP CONSTRAINT "_VulnerabilityCollaborators_A_fkey";

-- DropForeignKey
ALTER TABLE "_VulnerabilityCollaborators" DROP CONSTRAINT "_VulnerabilityCollaborators_B_fkey";

-- DropTable
DROP TABLE "_VulnerabilityCollaborators";

-- CreateTable
CREATE TABLE "StorageConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "provider" "StorageProvider" NOT NULL DEFAULT 'LOCAL',
    "azureConnectionStringEnc" TEXT,
    "azureContainerName" TEXT DEFAULT 'uploads',
    "localStoragePath" TEXT DEFAULT '/tmp/uploads',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "pluginGracePeriodDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_Collaborators" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_Collaborators_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_Collaborators_B_index" ON "_Collaborators"("B");

-- AddForeignKey
ALTER TABLE "UploadHistory" ADD CONSTRAINT "UploadHistory_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PentestExecution" ADD CONSTRAINT "PentestExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Collaborators" ADD CONSTRAINT "_Collaborators_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Collaborators" ADD CONSTRAINT "_Collaborators_B_fkey" FOREIGN KEY ("B") REFERENCES "Vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
