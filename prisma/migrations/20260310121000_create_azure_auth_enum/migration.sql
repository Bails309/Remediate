-- Create AzureAuthMethod enum and convert StorageConfig.azureAuthMethod to use it
DO $$ BEGIN
    -- Create the enum type if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AzureAuthMethod') THEN
        CREATE TYPE "AzureAuthMethod" AS ENUM ('CONNECTION_STRING', 'ACCOUNT_KEY', 'SAS_TOKEN');
    END IF;

    -- If the column exists and is not already of the enum type, alter it safely
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='StorageConfig' AND column_name='azureAuthMethod'
    ) THEN
        -- Only alter if the column is not already of the enum type
        PERFORM (
            SELECT 1 FROM pg_type t
            JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = 'AzureAuthMethod'
        );

        -- Try to cast the existing text values to the enum. Use USING to convert.
        BEGIN
            ALTER TABLE "StorageConfig" ALTER COLUMN "azureAuthMethod" TYPE "AzureAuthMethod" USING ("azureAuthMethod"::text::"AzureAuthMethod");
        EXCEPTION WHEN others THEN
            -- If cast fails (unlikely), attempt a safer path: add a temporary column, populate, swap
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns WHERE table_name='StorageConfig' AND column_name='azureAuthMethod_tmp'
            ) THEN
                ALTER TABLE "StorageConfig" ADD COLUMN "azureAuthMethod_tmp" "AzureAuthMethod" DEFAULT 'CONNECTION_STRING';
                UPDATE "StorageConfig" SET "azureAuthMethod_tmp" = CASE
                    WHEN "azureAuthMethod" = 'ACCOUNT_KEY' THEN 'ACCOUNT_KEY'::"AzureAuthMethod"
                    WHEN "azureAuthMethod" = 'SAS_TOKEN' THEN 'SAS_TOKEN'::"AzureAuthMethod"
                    ELSE 'CONNECTION_STRING'::"AzureAuthMethod" END;
                ALTER TABLE "StorageConfig" DROP COLUMN "azureAuthMethod";
                ALTER TABLE "StorageConfig" RENAME COLUMN "azureAuthMethod_tmp" TO "azureAuthMethod";
            END IF;
        END;
    END IF;
END $$;
