import { prisma } from "../lib/prisma";
import { setProgress } from "../lib/progress";
import { uploadQueue, pentestPdfQueue, QUEUE_NAME, PENTEST_QUEUE_NAME } from "../lib/queue";
import { getBullmqConnection, createDedicatedRedis } from "../lib/redis";
import { processNessusUpload, processAcrUpload } from "../lib/ingest";
import { processPentestPdfUpload } from "../lib/pentest-pdf";
// Removed problematic UploadStatus import
import { startReportScheduler } from "../lib/report-scheduler";
import { startNotificationScheduler } from "../lib/notification-scheduler";
import { startAzureFileShareScheduler } from "../lib/azure-file-share-scheduler";
import { startAzureBlobIngestScheduler } from "../lib/azure-blob-ingest-scheduler";
import { ScannerType } from "@prisma/client";
import { Worker, Job } from "bullmq";

async function processJob(job: Job<{ uploadId: string; storageKey: string }>) {
  const { uploadId, storageKey } = job.data;

  const upload = await prisma.uploadHistory.findUnique({ where: { id: uploadId } });
  if (!upload) {
    return;
  }

  try {
    await setProgress(uploadId, { step: "Processing", progress: 15 });
    if (upload.scannerType === ScannerType.ACR) {
      await processAcrUpload({ uploadId, siteId: upload.siteId, storageKey });
    } else {
      await processNessusUpload({ uploadId, siteId: upload.siteId, storageKey });
    }
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
    // Lightweight statistics refresh (ANALYZE only, no VACUUM) to keep query planner current.
    // Full VACUUM should be scheduled separately (e.g., daily cron) to avoid locking tables per-upload.
    try {
      await prisma.$executeRawUnsafe(`ANALYZE "Vulnerability";`);
      await prisma.$executeRawUnsafe(`ANALYZE "VulnerabilityHistory";`);

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
  startAzureBlobIngestScheduler().catch(err => {
    console.error("[AzureBlobIngest] Failed to start scheduler", err);
  });

  const nvdKey = process.env.NVD_API_KEY;
  if (nvdKey) {
    console.log(`[Config] NVD API Key detected (Ends with: ...${nvdKey.slice(-4)})`);
  } else {
    console.warn("[Config] No NVD_API_KEY found. Ingestion will be subject to strict public rate limits.");
  }

  const HEARTBEAT_KEY = "worker:heartbeat";
  const HEARTBEAT_INTERVAL_MS = 10_000;
  // Dedicated, fail-fast connection for the heartbeat. Previously this wrote
  // through the shared `redis` proxy, which is created with
  // `maxRetriesPerRequest: null` (required for BullMQ). When the managed-Redis
  // socket dropped (idle timeout / topology refresh / failover) that setting
  // left the `SET` queued in the offline queue *forever* with no error, so the
  // heartbeat silently froze and a perfectly healthy worker showed up as
  // "Stale" in the health check. A finite `commandTimeout` + `maxRetriesPerRequest`
  // makes a stuck write reject within a few seconds — it gets logged, ioredis
  // reconnects, and the next tick refreshes the heartbeat.
  const heartbeatRedis = createDedicatedRedis({
    commandTimeout: 5_000,
    maxRetriesPerRequest: 3,
  });
  heartbeatRedis.on("error", (err: Error) => {
    console.error("[Heartbeat] Redis connection error:", err.message);
  });
  setInterval(async () => {
    try {
      await heartbeatRedis.set(HEARTBEAT_KEY, Date.now().toString());
    } catch (err) {
      console.error(
        "[Heartbeat] Failed to write worker heartbeat:",
        err instanceof Error ? err.message : err,
      );
    }
  }, HEARTBEAT_INTERVAL_MS);

  const worker = new Worker(uploadQueue.name, processJob, {
    // Own our BullMQ connections so the blocking `bclient` has its own
    // reconnect lifecycle. Sharing the general `redis` proxy previously left
    // the worker unable to pull jobs after any TCP idle-timeout drop.
    connection: getBullmqConnection(),
    concurrency: 2,
  });

  worker.on('ready', () => {
    console.log(`[Worker:${QUEUE_NAME}] Ready — blocking connection established.`);
  });
  worker.on('error', err => {
    console.error(`[Worker:${QUEUE_NAME}] error:`, err);
  });
  worker.on('ioredis:close', () => {
    console.warn(`[Worker:${QUEUE_NAME}] ioredis connection closed — will reconnect via retryStrategy.`);
  });

  worker.on('completed', job => {
    console.log(`Job ${job.id} completed!`);
  });

  worker.on('failed', (job: Job<{ uploadId: string; storageKey: string }> | undefined, err: Error) => {
    console.error(`Job ${job?.id} failed with ${err.message}`);
  });

  // Dedicated worker for pentest PDF uploads. Uses the same payload shape as the CSV worker so
  // dead-letter management UI can re-queue with the existing helpers.
  const pentestWorker = new Worker(pentestPdfQueue.name, async (job: Job<{ uploadId: string; storageKey: string }>) => {
    const { uploadId, storageKey } = job.data;
    const upload = await prisma.uploadHistory.findUnique({ where: { id: uploadId } });
    if (!upload) return;
    try {
      await setProgress(uploadId, { step: "Processing", progress: 15 });
      await processPentestPdfUpload({ uploadId, siteId: upload.siteId, storageKey });
    } catch (error) {
      console.error('Error processing pentest PDF', uploadId, error);
      const message = error instanceof Error ? error.message : String(error);
      if (job.attemptsMade >= (job.opts.attempts || 1) - 1) {
        await prisma.uploadHistory.update({ where: { id: uploadId }, data: { status: "Failed" as const } });
        // Surface the underlying error (e.g. "PDF Processing API returned 401 Unauthorized")
        // so the operator isn't left guessing why the upload failed.
        await setProgress(uploadId, { step: "Failed", progress: 100, error: message });
      }
      throw error;
    }
  }, {
    // Own our BullMQ connections — see comment on the upload worker above.
    connection: getBullmqConnection(),
    concurrency: 2,
  });

  pentestWorker.on('ready', () => {
    console.log(`[Worker:${PENTEST_QUEUE_NAME}] Ready — blocking connection established.`);
  });
  pentestWorker.on('error', err => {
    console.error(`[Worker:${PENTEST_QUEUE_NAME}] error:`, err);
  });
  pentestWorker.on('completed', job => {
    console.log(`Pentest PDF job ${job.id} completed!`);
  });
  pentestWorker.on('failed', (job, err) => {
    console.error(`Pentest PDF job ${job?.id} failed with ${err.message}`);
  });

  // Periodic queue-depth log — surfaces stalled-worker symptoms (waiting > 0
  // for extended periods with active = 0) directly in container logs so a
  // future recurrence is immediately visible without needing to shell in.
  const DEPTH_LOG_INTERVAL_MS = 60_000;
  setInterval(async () => {
    try {
      const [uploadCounts, pentestCounts] = await Promise.all([
        uploadQueue.getJobCounts("waiting", "active", "delayed", "failed"),
        pentestPdfQueue.getJobCounts("waiting", "active", "delayed", "failed"),
      ]);
      console.log(
        `[QueueDepth] upload=${JSON.stringify(uploadCounts)} pentest=${JSON.stringify(pentestCounts)}`,
      );
    } catch (err) {
      console.error("[QueueDepth] failed to read counts:", err);
    }
  }, DEPTH_LOG_INTERVAL_MS);

  console.log("BullMQ Worker is listening for jobs...");
}

run().catch((error) => {
  console.error("Worker crashed", error);
  process.exit(1);
});
