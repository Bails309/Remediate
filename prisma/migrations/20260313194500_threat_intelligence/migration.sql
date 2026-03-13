-- CreateTable safely
CREATE TABLE IF NOT EXISTS "ThreatVulnerability" (
    "id" UUID NOT NULL,
    "osvId" TEXT NOT NULL,
    "cveId" TEXT,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "source" TEXT NOT NULL,
    "affectedPackages" JSONB NOT NULL,
    "remediation" TEXT,
    "cvssScore" DOUBLE PRECISION,
    "epssScore" DOUBLE PRECISION,
    "cisaKevStatus" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "modifiedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreatVulnerability_pkey" PRIMARY KEY ("id")
);

-- CreateTable safely
CREATE TABLE IF NOT EXISTS "ThreatSubscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "isSubscribed" BOOLEAN NOT NULL DEFAULT false,
    "minRisk" "Risk" NOT NULL DEFAULT 'High',
    "cisaKevOnly" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreatSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable safely
CREATE TABLE IF NOT EXISTS "ThreatFeedMetadata" (
    "id" TEXT NOT NULL,
    "lastModified" TIMESTAMP(3),
    "sha256Hash" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreatFeedMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex safely
CREATE UNIQUE INDEX IF NOT EXISTS "ThreatVulnerability_osvId_key" ON "ThreatVulnerability"("osvId");
CREATE UNIQUE INDEX IF NOT EXISTS "ThreatVulnerability_cveId_key" ON "ThreatVulnerability"("cveId");
CREATE INDEX IF NOT EXISTS "ThreatVulnerability_cveId_idx" ON "ThreatVulnerability"("cveId");
CREATE INDEX IF NOT EXISTS "ThreatVulnerability_publishedAt_idx" ON "ThreatVulnerability"("publishedAt" DESC);
CREATE INDEX IF NOT EXISTS "ThreatVulnerability_cvssScore_idx" ON "ThreatVulnerability"("cvssScore" DESC);
CREATE INDEX IF NOT EXISTS "ThreatVulnerability_cisaKevStatus_idx" ON "ThreatVulnerability"("cisaKevStatus");
CREATE UNIQUE INDEX IF NOT EXISTS "ThreatSubscription_userId_key" ON "ThreatSubscription"("userId");

-- AddForeignKey safely
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ThreatSubscription_userId_fkey') THEN
        ALTER TABLE "ThreatSubscription" ADD CONSTRAINT "ThreatSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
