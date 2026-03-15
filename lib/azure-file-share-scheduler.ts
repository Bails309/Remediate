import { AzureFileShareService } from "./azure-file-share";
import { prisma } from "./prisma";

let pollInterval: NodeJS.Timeout | null = null;

export async function startAzureFileShareScheduler() {
  console.log("[AzureFileShare] Starting scheduler...");

  // Initial poll on startup
  await AzureFileShareService.pollAndIngest();

  // Set up recurring poll
  const config = await prisma.azureFileShareConfig.findUnique({
    where: { id: "singleton" },
  });

  const intervalMinutes = config?.pollIntervalMinutes || 60;
  console.log(`[AzureFileShare] Scheduler set to poll every ${intervalMinutes} minutes`);

  if (pollInterval) {
    clearInterval(pollInterval);
  }

  pollInterval = setInterval(async () => {
    console.log("[AzureFileShare] Running scheduled poll...");
    await AzureFileShareService.pollAndIngest();
  }, intervalMinutes * 60 * 1000);
}

export function stopAzureFileShareScheduler() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log("[AzureFileShare] Scheduler stopped");
  }
}
