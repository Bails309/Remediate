-- CreateEnum
CREATE TYPE "UploadType" AS ENUM ('CSV', 'PDF');

-- AlterTable
ALTER TABLE "UploadHistory"
    ADD COLUMN "uploadType" "UploadType" NOT NULL DEFAULT 'CSV';

-- CreateTable
CREATE TABLE "PdfProcessingConfig" (
    "id"        TEXT NOT NULL DEFAULT 'singleton',
    "enabled"   BOOLEAN NOT NULL DEFAULT false,
    "apiUrl"    TEXT,
    "apiKeyEnc" TEXT,
    "timeoutMs" INTEGER NOT NULL DEFAULT 120000,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdfProcessingConfig_pkey" PRIMARY KEY ("id")
);
