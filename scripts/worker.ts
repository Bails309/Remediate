import { prisma } from "../lib/prisma";
import { setProgress } from "../lib/progress";
import { uploadQueue } from "../lib/queue";
import { redis } from "../lib/redis";
import { processNessusUpload } from "../lib/ingest";
// Removed problematic UploadStatus import
import { startReportScheduler } from "../lib/report-scheduler";
import { startNotificationScheduler } from "../lib/notification-scheduler";
import { startAzureFileShareScheduler } from "../lib/azure-file-share-scheduler";
import { Worker, Job } from "bullmq";

async function processJob(job: Job<{ uploadId: string; storageKey: string }>) {
  const { uploadId, storageKey } = job.data;

  const upload = await prisma.uploadHistory.findUnique({ where: { id: uploadId } });
  if (!upload) {
    return;
  }

  try {
    await setProgress(uploadId, { step: "Processing", progress: 15 });
    await processNessusUpload({ uploadId, siteId: upload.siteId, storageKey });
  } catch (error) {
    console.error('Error processing upload', uploadId, error);

    if (job.attemptsMade >= (job.opts.attempts || 1) - 1) {
      await prisma.uploadHistory.update({
        where: { id: uploadId },
        data: { status: "Failed" as const },
      });
      await setProgress(uploadId, { step: "Failed", progress: 100 });
    }
    throw error; // Let BullMQ handle retries
  } finally {
    // Maintenance after processing (successful or failed attempt)
    try {
      await prisma.$executeRawUnsafe(`VACUUM ANALYZE "Vulnerability";`);
      await prisma.$executeRawUnsafe(`VACUUM ANALYZE "VulnerabilityHistory";`);

      // 12-month retention policy cleanup
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
      const { count } = await prisma.vulnerabilityHistory.deleteMany({
        where: { archivedAt: { lt: twelveMonthsAgo } }
      });

      if (count > 0) {
        console.log(`✓ Cleaned up ${count} expired history records`);
      }
    } catch {
      console.log(`Note: Maintenance skipped for ${uploadId}`);
    }
  }
}

async function run() {
  console.log("Worker started with BullMQ");
  startReportScheduler();
  // start background notification scheduler in worker process
  startNotificationScheduler();
  startAzureFileShareScheduler().catch(err => {
    console.error("[AzureFileShare] Failed to start scheduler", err);
  });

  const nvdKey = process.env.NVD_API_KEY;
  if (nvdKey) {
    console.log(`[Config] NVD API Key detected (Ends with: ...${nvdKey.slice(-4)})`);
  } else {
    console.warn("[Config] No NVD_API_KEY found. Ingestion will be subject to strict public rate limits.");
  }

  const HEARTBEAT_KEY = "worker:heartbeat";
  const HEARTBEAT_INTERVAL_MS = 10_000;
  setInterval(async () => {
    try {
      await redis.set(HEARTBEAT_KEY, Date.now().toString());
    } catch (err) {
      console.error("Failed to set worker heartbeat", err);
    }
  }, HEARTBEAT_INTERVAL_MS);

  const worker = new Worker(uploadQueue.name, processJob, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connection: redis as any,
    concurrency: 2,
  });

  worker.on('completed', job => {
    console.log(`Job ${job.id} completed!`);
  });

  worker.on('failed', (job: Job<{ uploadId: string; storageKey: string }> | undefined, err: Error) => {
    console.error(`Job ${job?.id} failed with ${err.message}`);
  });

  console.log("BullMQ Worker is listening for jobs...");
}

run().catch((error) => {
  console.error("Worker crashed", error);
  process.exit(1);
});
