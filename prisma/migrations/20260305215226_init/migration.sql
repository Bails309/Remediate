-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('Admin', 'User');

-- CreateEnum
CREATE TYPE "VulnerabilityStatus" AS ENUM ('Open', 'Remediated', 'FalsePositive', 'NoFixAvailable');

-- CreateEnum
CREATE TYPE "Risk" AS ENUM ('Critical', 'High', 'Medium', 'Low', 'None');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('Processing', 'Completed', 'Failed');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'User',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vulnerability" (
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

    CONSTRAINT "Vulnerability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OidcConfig" (
    "id" UUID NOT NULL,
    "clientIdEnc" TEXT NOT NULL,
    "clientSecretEnc" TEXT NOT NULL,
    "issuerUrlEnc" TEXT NOT NULL,
    "tenantIdEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OidcConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportConfig" (
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
CREATE TABLE "UploadHistory" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "uploadedBy" UUID NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "UploadStatus" NOT NULL DEFAULT 'Processing',
    "fileName" TEXT,
    "rowCount" INTEGER,

    CONSTRAINT "UploadHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Site_name_key" ON "Site"("name");

-- CreateIndex
CREATE INDEX "Vulnerability_siteId_pluginId_host_port_idx" ON "Vulnerability"("siteId", "pluginId", "host", "port");

-- CreateIndex
CREATE INDEX "Vulnerability_status_idx" ON "Vulnerability"("status");

-- CreateIndex
CREATE INDEX "Vulnerability_risk_idx" ON "Vulnerability"("risk");

-- CreateIndex
CREATE INDEX "UploadHistory_siteId_uploadDate_idx" ON "UploadHistory"("siteId", "uploadDate");

-- AddForeignKey
ALTER TABLE "Vulnerability" ADD CONSTRAINT "Vulnerability_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vulnerability" ADD CONSTRAINT "Vulnerability_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadHistory" ADD CONSTRAINT "UploadHistory_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadHistory" ADD CONSTRAINT "UploadHistory_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
