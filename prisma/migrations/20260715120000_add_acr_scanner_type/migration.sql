-- Adds Azure Container Registry (ACR) vulnerability ingest support.
--   * New enum ScannerType (NESSUS | ACR)
--   * scannerType column on UploadHistory, Vulnerability, VulnerabilityHistory
--   * ACR-specific fidelity columns on Vulnerability + VulnerabilityHistory
--   * New AzureBlobIngestConfig table for polling an Azure Blob container for
--     CSV exports (independent from the existing StorageConfig + AzureFileShareConfig).

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ScannerType" AS ENUM ('NESSUS', 'ACR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable UploadHistory
ALTER TABLE "UploadHistory"
  ADD COLUMN IF NOT EXISTS "scannerType" "ScannerType" NOT NULL DEFAULT 'NESSUS';

CREATE INDEX IF NOT EXISTS "UploadHistory_scannerType_uploadDate_idx"
  ON "UploadHistory"("scannerType", "uploadDate");

-- AlterTable Vulnerability
ALTER TABLE "Vulnerability"
  ADD COLUMN IF NOT EXISTS "scannerType"      "ScannerType" NOT NULL DEFAULT 'NESSUS',
  ADD COLUMN IF NOT EXISTS "registryName"     TEXT,
  ADD COLUMN IF NOT EXISTS "repository"       TEXT,
  ADD COLUMN IF NOT EXISTS "imageDigest"      TEXT,
  ADD COLUMN IF NOT EXISTS "packageName"      TEXT,
  ADD COLUMN IF NOT EXISTS "installedVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "remediation"      TEXT,
  ADD COLUMN IF NOT EXISTS "timeGenerated"    TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Vulnerability_siteId_scannerType_imageDigest_idx"
  ON "Vulnerability"("siteId", "scannerType", "imageDigest");

-- AlterTable VulnerabilityHistory
ALTER TABLE "VulnerabilityHistory"
  ADD COLUMN IF NOT EXISTS "scannerType"      "ScannerType" NOT NULL DEFAULT 'NESSUS',
  ADD COLUMN IF NOT EXISTS "registryName"     TEXT,
  ADD COLUMN IF NOT EXISTS "repository"       TEXT,
  ADD COLUMN IF NOT EXISTS "imageDigest"      TEXT,
  ADD COLUMN IF NOT EXISTS "packageName"      TEXT,
  ADD COLUMN IF NOT EXISTS "installedVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "remediation"      TEXT,
  ADD COLUMN IF NOT EXISTS "timeGenerated"    TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "VulnerabilityHistory_siteId_scannerType_idx"
  ON "VulnerabilityHistory"("siteId", "scannerType");

-- CreateTable AzureBlobIngestConfig
CREATE TABLE IF NOT EXISTS "AzureBlobIngestConfig" (
    "id"                    TEXT NOT NULL DEFAULT 'singleton',
    "enabled"               BOOLEAN NOT NULL DEFAULT false,
    "authMethod"            "AzureAuthMethod" NOT NULL DEFAULT 'CONNECTION_STRING',
    "connectionStringEnc"   TEXT,
    "accountName"           TEXT,
    "accountKeyEnc"         TEXT,
    "sasTokenEnc"           TEXT,
    "containerName"         TEXT DEFAULT 'acr-vulnerabilities',
    "prefix"                TEXT DEFAULT '',
    "defaultSiteId"         UUID,
    "pollIntervalMinutes"   INTEGER NOT NULL DEFAULT 60,
    "deleteAfterImport"     BOOLEAN NOT NULL DEFAULT true,
    "lastPollAt"            TIMESTAMP(3),
    "updatedAt"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AzureBlobIngestConfig_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "AzureBlobIngestConfig"
    ADD CONSTRAINT "AzureBlobIngestConfig_defaultSiteId_fkey"
    FOREIGN KEY ("defaultSiteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
