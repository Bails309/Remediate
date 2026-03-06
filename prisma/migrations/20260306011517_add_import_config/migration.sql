-- CreateTable
CREATE TABLE "ImportConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "pluginGracePeriodDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportConfig_pkey" PRIMARY KEY ("id")
);
