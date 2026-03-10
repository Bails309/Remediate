-- Add Azure storage columns to StorageConfig for backward compatibility
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='StorageConfig' AND column_name='azureAuthMethod'
    ) THEN
        ALTER TABLE "StorageConfig" ADD COLUMN "azureAuthMethod" TEXT DEFAULT 'CONNECTION_STRING';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='StorageConfig' AND column_name='azureAccountName'
    ) THEN
        ALTER TABLE "StorageConfig" ADD COLUMN "azureAccountName" TEXT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='StorageConfig' AND column_name='azureAccountKeyEnc'
    ) THEN
        ALTER TABLE "StorageConfig" ADD COLUMN "azureAccountKeyEnc" TEXT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='StorageConfig' AND column_name='azureSasTokenEnc'
    ) THEN
        ALTER TABLE "StorageConfig" ADD COLUMN "azureSasTokenEnc" TEXT;
    END IF;
END $$;

-- Ensure updatedAt is set
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StorageConfig' AND column_name='updatedAt') THEN
        -- no-op, column exists
    ELSE
        ALTER TABLE "StorageConfig" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now();
    END IF;
END $$;
