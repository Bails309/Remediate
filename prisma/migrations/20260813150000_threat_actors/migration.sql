-- CreateTable
CREATE TABLE IF NOT EXISTS "ThreatActor" (
    "id" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "stixId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "description" TEXT,
    "actorType" TEXT,
    "origin" TEXT,
    "targetSectors" TEXT[],
    "targetRegions" TEXT[],
    "tactics" TEXT[],
    "software" TEXT[],
    "techniqueCount" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT,
    "lastModified" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreatActor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ThreatActor_externalId_key" ON "ThreatActor"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ThreatActor_stixId_key" ON "ThreatActor"("stixId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ThreatActor_name_idx" ON "ThreatActor"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ThreatActor_actorType_idx" ON "ThreatActor"("actorType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ThreatActor_lastModified_idx" ON "ThreatActor"("lastModified" DESC);
