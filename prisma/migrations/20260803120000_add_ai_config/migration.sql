-- CreateTable
CREATE TABLE IF NOT EXISTS "AiConfig" (
    "id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "providerType" TEXT NOT NULL DEFAULT 'openai-compatible',
    "baseUrlEnc" TEXT NOT NULL,
    "apiKeyEnc" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "apiVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConfig_pkey" PRIMARY KEY ("id")
);
