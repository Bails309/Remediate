-- CreateExtension removed for Azure compatibility

-- CreateEnums safely
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
        CREATE TYPE "UserRole" AS ENUM ('site_admin', 'web_app_admin', 'pentest_admin', 'web_app_user', 'pentest_user');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VulnerabilityStatus') THEN
        CREATE TYPE "VulnerabilityStatus" AS ENUM ('Open', 'Remediated', 'FalsePositive', 'NoFixAvailable');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Risk') THEN
        CREATE TYPE "Risk" AS ENUM ('Critical', 'High', 'Medium', 'Low', 'None');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UploadStatus') THEN
        CREATE TYPE "UploadStatus" AS ENUM ('Processing', 'Completed', 'Failed');
    END IF;
END $$;

-- CreateTable safely
CREATE TABLE IF NOT EXISTS "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roles" "UserRole"[] NOT NULL DEFAULT ARRAY['web_app_user']::"UserRole"[],
    "authSource" TEXT NOT NULL DEFAULT 'Local',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Repair User table if it already existed
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='authSource') THEN
        ALTER TABLE "User" ADD COLUMN "authSource" TEXT NOT NULL DEFAULT 'Local';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='roles') THEN
        ALTER TABLE "User" ADD COLUMN "roles" "UserRole"[] NOT NULL DEFAULT ARRAY['web_app_user']::"UserRole"[];
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Site" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable safely
CREATE TABLE IF NOT EXISTS "Vulnerability" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "assigneeId" UUID,
    "status" "VulnerabilityStatus" NOT NULL DEFAULT 'Open',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "askForHelp" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Vulnerability_pkey" PRIMARY KEY ("id")
);

-- Repair Vulnerability table if it already existed
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Vulnerability' AND column_name='askForHelp') THEN
        ALTER TABLE "Vulnerability" ADD COLUMN "askForHelp" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "OidcConfig" (
    "id" UUID NOT NULL,
    "clientIdEnc" TEXT NOT NULL,
    "clientSecretEnc" TEXT NOT NULL,
    "issuerUrlEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OidcConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReportConfig" (
    "id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "recipients" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL DEFAULT 1,
    "hour" INTEGER NOT NULL DEFAULT 9,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "lastSentAt" TIMESTAMP(3),
    "smtpHostEnc" TEXT NOT NULL,
    "smtpPortEnc" TEXT NOT NULL,
    "smtpUserEnc" TEXT,
    "smtpPassEnc" TEXT,
    "smtpSecureEnc" TEXT NOT NULL,
    "smtpFromEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UploadHistory" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "uploadedBy" UUID NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "UploadStatus" NOT NULL DEFAULT 'Processing',
    "fileName" TEXT,
    "rowCount" INTEGER,

    CONSTRAINT "UploadHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "VulnerabilityHistory" (
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

-- CreateTable
CREATE TABLE IF NOT EXISTS "Comment" (
    "id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "vulnerabilityId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PentestExecution" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "toolId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "output" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "PentestExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "_VulnerabilityCollaborators" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Site_name_key" ON "Site"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Vulnerability_siteId_pluginId_host_port_idx" ON "Vulnerability"("siteId", "pluginId", "host", "port");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Vulnerability_status_idx" ON "Vulnerability"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Vulnerability_risk_idx" ON "Vulnerability"("risk");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Vulnerability_siteId_status_risk_idx" ON "Vulnerability"("siteId", "status", "risk");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Vulnerability_risk_lastSeenAt_idx" ON "Vulnerability"("risk", "lastSeenAt" DESC);

-- GIN indexes removed for Azure compatibility

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UploadHistory_siteId_uploadDate_idx" ON "UploadHistory"("siteId", "uploadDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VulnerabilityHistory_lastSeenAt_idx" ON "VulnerabilityHistory"("lastSeenAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VulnerabilityHistory_archivedAt_idx" ON "VulnerabilityHistory"("archivedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VulnerabilityHistory_siteId_risk_idx" ON "VulnerabilityHistory"("siteId", "risk");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Comment_vulnerabilityId_createdAt_idx" ON "Comment"("vulnerabilityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PentestExecution_userId_startedAt_idx" ON "PentestExecution"("userId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PentestExecution_toolId_startedAt_idx" ON "PentestExecution"("toolId", "startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "_VulnerabilityCollaborators_AB_unique" ON "_VulnerabilityCollaborators"("A", "B");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "_VulnerabilityCollaborators_B_index" ON "_VulnerabilityCollaborators"("B");

-- AddForeignKey safely
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Vulnerability_siteId_fkey') THEN
        ALTER TABLE "Vulnerability" ADD CONSTRAINT "Vulnerability_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Vulnerability_assigneeId_fkey') THEN
        ALTER TABLE "Vulnerability" ADD CONSTRAINT "Vulnerability_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'UploadHistory_siteId_fkey') THEN
        ALTER TABLE "UploadHistory" ADD CONSTRAINT "UploadHistory_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'UploadHistory_uploadedBy_fkey') THEN
        ALTER TABLE "UploadHistory" ADD CONSTRAINT "UploadHistory_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'VulnerabilityHistory_siteId_fkey') THEN
        ALTER TABLE "VulnerabilityHistory" ADD CONSTRAINT "VulnerabilityHistory_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'VulnerabilityHistory_assigneeId_fkey') THEN
        ALTER TABLE "VulnerabilityHistory" ADD CONSTRAINT "VulnerabilityHistory_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Comment_vulnerabilityId_fkey') THEN
        ALTER TABLE "Comment" ADD CONSTRAINT "Comment_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "Vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Comment_authorId_fkey') THEN
        ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'PentestExecution_userId_fkey') THEN
        ALTER TABLE "PentestExecution" ADD CONSTRAINT "PentestExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = '_VulnerabilityCollaborators_A_fkey') THEN
        ALTER TABLE "_VulnerabilityCollaborators" ADD CONSTRAINT "_VulnerabilityCollaborators_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = '_VulnerabilityCollaborators_B_fkey') THEN
        ALTER TABLE "_VulnerabilityCollaborators" ADD CONSTRAINT "_VulnerabilityCollaborators_B_fkey" FOREIGN KEY ("B") REFERENCES "Vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
