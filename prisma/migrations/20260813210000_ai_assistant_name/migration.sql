-- Optional display name for the AI assistant. NULL falls back to "Ask AI".
ALTER TABLE "AiConfig" ADD COLUMN "assistantName" TEXT;
