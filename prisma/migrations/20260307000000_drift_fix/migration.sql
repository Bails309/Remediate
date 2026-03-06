-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authSource" TEXT NOT NULL DEFAULT 'Local';

-- CreateTable
CREATE TABLE "VulnerabilityHistory" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "assigneeId" UUID,
    "status" "VulnerabilityStatus" NOT NULL DEFAULT 'Remediated',
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "pluginId" TEXT NOT NULL,
    "cve" TEXT,
    "cvssScore" DOUBLE PRECISION,
    "risk" "Risk" NOT NULL DEFAULT 'None',
    "host" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "port" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "synopsis" TEXT,
    "description" TEXT,
    "solution" TEXT,
    "seeAlso" TEXT,
    "pluginOutput" TEXT,
    "pluginPublicationDate" TIMESTAMP(3),
    "pluginModificationDate" TIMESTAMP(3),

    CONSTRAINT "VulnerabilityHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VulnerabilityHistory_lastSeenAt_idx" ON "VulnerabilityHistory"("lastSeenAt");

-- CreateIndex
CREATE INDEX "VulnerabilityHistory_archivedAt_idx" ON "VulnerabilityHistory"("archivedAt");

-- CreateIndex
CREATE INDEX "VulnerabilityHistory_siteId_risk_idx" ON "VulnerabilityHistory"("siteId", "risk");

-- CreateIndex
CREATE INDEX "Vulnerability_siteId_status_risk_idx" ON "Vulnerability"("siteId", "status", "risk");

-- CreateIndex
CREATE INDEX "Vulnerability_risk_lastSeenAt_idx" ON "Vulnerability"("risk", "lastSeenAt" DESC);

-- CreateIndex
CREATE INDEX "Vulnerability_name_idx" ON "Vulnerability" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Vulnerability_host_idx" ON "Vulnerability" USING GIN ("host" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Vulnerability_pluginId_idx" ON "Vulnerability" USING GIN ("pluginId" gin_trgm_ops);

-- AddForeignKey
ALTER TABLE "VulnerabilityHistory" ADD CONSTRAINT "VulnerabilityHistory_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VulnerabilityHistory" ADD CONSTRAINT "VulnerabilityHistory_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
