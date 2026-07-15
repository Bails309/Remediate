import { AzureBlobIngestService } from "./azure-blob-ingest";
import { prisma } from "./prisma";

let pollInterval: NodeJS.Timeout | null = null;

/**
 * Kicks off the ACR blob-container poll loop. Mirrors
 * startAzureFileShareScheduler in shape so it's obvious how they relate.
 * Safe to call multiple times \u2014 will clear any prior interval.
 */
export async function startAzureBlobIngestScheduler() {
  console.log("[AzureBlobIngest] Starting scheduler...");

  await AzureBlobIngestService.pollAndIngest();

  const config = await prisma.azureBlobIngestConfig.findUnique({
    where: { id: "singleton" },
  });

  const intervalMinutes = config?.pollIntervalMinutes || 60;
  console.log(`[AzureBlobIngest] Scheduler set to poll every ${intervalMinutes} minutes`);

  if (pollInterval) {
    clearInterval(pollInterval);
  }

  pollInterval = setInterval(async () => {
    console.log("[AzureBlobIngest] Running scheduled poll...");
    await AzureBlobIngestService.pollAndIngest();
  }, intervalMinutes * 60 * 1000);
}
