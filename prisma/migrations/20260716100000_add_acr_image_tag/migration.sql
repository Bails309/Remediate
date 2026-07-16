-- Adds the image tag to ACR vulnerability rows so assignees can identify
-- which image/tag a container finding came from alongside the digest.
--   * imageTag column on Vulnerability + VulnerabilityHistory (nullable,
--     Nessus rows leave it blank).
-- Idempotent and additive — safe to re-apply.

-- AlterTable Vulnerability
ALTER TABLE "Vulnerability"
  ADD COLUMN IF NOT EXISTS "imageTag" TEXT;

-- AlterTable VulnerabilityHistory
ALTER TABLE "VulnerabilityHistory"
  ADD COLUMN IF NOT EXISTS "imageTag" TEXT;
