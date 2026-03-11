-- Create UserRole_new with the correct roles
CREATE TYPE "UserRole_new" AS ENUM ('site_admin', 'web_app_admin', 'toolkit_admin', 'web_app_user', 'toolkit_user');

-- Update User table to use the new enum, mapping the values
ALTER TABLE "public"."User" ALTER COLUMN "roles" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "roles" TYPE "UserRole_new"[] USING (
    array_replace(array_replace("roles"::text[], 'pentest_admin', 'toolkit_admin'), 'pentest_user', 'toolkit_user')::"UserRole_new"[]
);

-- Cleanup old type
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";

-- Restore default
ALTER TABLE "User" ALTER COLUMN "roles" SET DEFAULT ARRAY['web_app_user']::"UserRole"[];
