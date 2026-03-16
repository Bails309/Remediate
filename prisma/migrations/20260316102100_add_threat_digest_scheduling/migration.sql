-- AlterTable
ALTER TABLE "ThreatSubscription" ADD COLUMN "lastSentAt" TIMESTAMP(3);
ALTER TABLE "ThreatSubscription" ADD COLUMN "scheduledHour" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "ThreatSubscription" ADD COLUMN "scheduledMinute" INTEGER NOT NULL DEFAULT 0;
