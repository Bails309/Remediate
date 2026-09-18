-- AlterTable
ALTER TABLE "ThreatSubscription" ADD COLUMN "globalDigestEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ThreatSubscription" ADD COLUMN "environmentDigestEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ThreatSubscription" ADD COLUMN "lastSentGlobalAt" TIMESTAMP(3);
ALTER TABLE "ThreatSubscription" ADD COLUMN "lastSentEnvironmentAt" TIMESTAMP(3);
