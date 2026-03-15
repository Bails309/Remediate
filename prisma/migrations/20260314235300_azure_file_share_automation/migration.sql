-- AlterTable
ALTER TABLE "Site" ADD COLUMN "importPattern" TEXT,
ADD COLUMN "importAliases" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "AzureFileShareConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "connectionStringEnc" TEXT,
    "accountName" TEXT,
    "accountKeyEnc" TEXT,
    "sasTokenEnc" TEXT,
    "shareName" TEXT DEFAULT 'security-scans',
    "directoryPath" TEXT DEFAULT '/',
    "pollIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "deleteAfterImport" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AzureFileShareConfig_pkey" PRIMARY KEY ("id")
);
