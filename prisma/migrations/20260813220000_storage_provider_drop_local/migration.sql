-- Reconciles a long-standing drift: `20260315012500_force_sync_schema` added REDIS
-- to the enum but never removed LOCAL nor moved the column default off it, so a
-- database built from migrations still defaulted `provider` to a value the
-- application no longer models. Runtime was unaffected because getStorageProvider()
-- treats anything other than AZURE as Redis; this makes the schema say the same.

-- Prisma's generated cast has no fallback, so any surviving LOCAL row would abort
-- the type change. LOCAL already behaved as Redis, so this is a semantic no-op.
UPDATE "StorageConfig" SET "provider" = 'REDIS' WHERE "provider"::text = 'LOCAL';

-- AlterEnum
BEGIN;
CREATE TYPE "StorageProvider_new" AS ENUM ('AZURE', 'REDIS');
ALTER TABLE "public"."StorageConfig" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "StorageConfig" ALTER COLUMN "provider" TYPE "StorageProvider_new" USING ("provider"::text::"StorageProvider_new");
ALTER TYPE "StorageProvider" RENAME TO "StorageProvider_old";
ALTER TYPE "StorageProvider_new" RENAME TO "StorageProvider";
DROP TYPE "public"."StorageProvider_old";
ALTER TABLE "StorageConfig" ALTER COLUMN "provider" SET DEFAULT 'REDIS';
COMMIT;
