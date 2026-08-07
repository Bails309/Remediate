-- Ingest reconciliation lookups filter on (siteId, scannerType, status).
-- Without these composite indexes the diff step fell back to a sequential scan
-- of the full 12-month VulnerabilityHistory archive on every upload, which
-- wedged the worker mid-job and left uploads stuck in "Processing".

CREATE INDEX IF NOT EXISTS "Vulnerability_siteId_scannerType_status_idx"
  ON "Vulnerability"("siteId", "scannerType", "status");

CREATE INDEX IF NOT EXISTS "VulnerabilityHistory_siteId_scannerType_status_idx"
  ON "VulnerabilityHistory"("siteId", "scannerType", "status");
