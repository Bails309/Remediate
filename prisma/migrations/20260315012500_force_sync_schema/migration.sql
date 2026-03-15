-- AlterTable
ALTER TABLE "UploadHistory" ALTER COLUMN "uploadedBy" DROP NOT NULL;

-- Fix StorageConfig drift
ALTER TABLE "StorageConfig" DROP COLUMN IF EXISTS "localStoragePath";
ALTER TABLE "StorageConfig" ALTER COLUMN "azureAuthMethod" SET NOT NULL;

-- Handle StorageProvider enum drift if necessary
-- Note: REDIS was added via db push, so we just ensure it exists here logic-wise
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'StorageProvider' AND e.enumlabel = 'REDIS') THEN
        ALTER TYPE "StorageProvider" ADD VALUE 'REDIS';
    END IF;
END $$;
