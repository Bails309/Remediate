/*
  Warnings:

  - You are about to drop the `_VulnerabilityCollaborators` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum safely
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StorageProvider') THEN
        CREATE TYPE "StorageProvider" AS ENUM ('LOCAL', 'AZURE');
    END IF;
END $$;

-- DropForeignKey safely
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'PentestExecution_userId_fkey') THEN
        ALTER TABLE "PentestExecution" DROP CONSTRAINT "PentestExecution_userId_fkey";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'UploadHistory_uploadedBy_fkey') THEN
        ALTER TABLE "UploadHistory" DROP CONSTRAINT "UploadHistory_uploadedBy_fkey";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = '_VulnerabilityCollaborators_A_fkey') THEN
        ALTER TABLE "_VulnerabilityCollaborators" DROP CONSTRAINT "_VulnerabilityCollaborators_A_fkey";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = '_VulnerabilityCollaborators_B_fkey') THEN
        ALTER TABLE "_VulnerabilityCollaborators" DROP CONSTRAINT "_VulnerabilityCollaborators_B_fkey";
    END IF;
END $$;

-- DropTable safely
DROP TABLE IF EXISTS "_VulnerabilityCollaborators";

-- CreateTable safely
CREATE TABLE IF NOT EXISTS "StorageConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "provider" "StorageProvider" NOT NULL DEFAULT 'LOCAL',
    "azureConnectionStringEnc" TEXT,
    "azureContainerName" TEXT DEFAULT 'uploads',
    "localStoragePath" TEXT DEFAULT '/tmp/uploads',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable safely
CREATE TABLE IF NOT EXISTS "ImportConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "pluginGracePeriodDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable safely
CREATE TABLE IF NOT EXISTS "_Collaborators" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_Collaborators_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex safely
CREATE INDEX IF NOT EXISTS "_Collaborators_B_index" ON "_Collaborators"("B");

-- AddForeignKey safely
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'UploadHistory_uploadedBy_fkey') THEN
        ALTER TABLE "UploadHistory" ADD CONSTRAINT "UploadHistory_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'PentestExecution_userId_fkey') THEN
        ALTER TABLE "PentestExecution" ADD CONSTRAINT "PentestExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = '_Collaborators_A_fkey') THEN
        ALTER TABLE "_Collaborators" ADD CONSTRAINT "_Collaborators_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = '_Collaborators_B_fkey') THEN
        ALTER TABLE "_Collaborators" ADD CONSTRAINT "_Collaborators_B_fkey" FOREIGN KEY ("B") REFERENCES "Vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
