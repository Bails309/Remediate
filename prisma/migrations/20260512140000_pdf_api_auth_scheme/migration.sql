-- CreateEnum
CREATE TYPE "PdfApiAuthScheme" AS ENUM ('X_API_KEY', 'BEARER', 'BOTH', 'NONE');

-- AlterTable
ALTER TABLE "PdfProcessingConfig" ADD COLUMN "authScheme" "PdfApiAuthScheme" NOT NULL DEFAULT 'X_API_KEY';
