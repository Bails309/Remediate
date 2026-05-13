-- CreateEnum
CREATE TYPE "PdfProcessor" AS ENUM ('BUILTIN', 'EXTERNAL');

-- AlterTable: new installations default to BUILTIN (the in-process Trustmarque parser).
ALTER TABLE "PdfProcessingConfig" ADD COLUMN "processor" "PdfProcessor" NOT NULL DEFAULT 'BUILTIN';

-- Preserve existing behaviour for upgrades: any singleton row that already has an external
-- API URL + key configured should keep using the EXTERNAL processor so working integrations
-- are not silently rerouted through the new built-in parser.
UPDATE "PdfProcessingConfig"
SET "processor" = 'EXTERNAL'
WHERE "apiUrl" IS NOT NULL AND "apiKeyEnc" IS NOT NULL;
