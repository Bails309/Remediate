-- Redefine foreign keys with ON DELETE CASCADE for Site relations

-- Vulnerability
ALTER TABLE "Vulnerability" DROP CONSTRAINT IF EXISTS "Vulnerability_siteId_fkey";
ALTER TABLE "Vulnerability" ADD CONSTRAINT "Vulnerability_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- VulnerabilityHistory
ALTER TABLE "VulnerabilityHistory" DROP CONSTRAINT IF EXISTS "VulnerabilityHistory_siteId_fkey";
ALTER TABLE "VulnerabilityHistory" ADD CONSTRAINT "VulnerabilityHistory_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- UploadHistory
ALTER TABLE "UploadHistory" DROP CONSTRAINT IF EXISTS "UploadHistory_siteId_fkey";
ALTER TABLE "UploadHistory" ADD CONSTRAINT "UploadHistory_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
