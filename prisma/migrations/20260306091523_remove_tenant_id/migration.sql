/*
  Warnings:

  - You are about to drop the column `tenantIdEnc` on the `OidcConfig` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "OidcConfig" DROP COLUMN "tenantIdEnc";
