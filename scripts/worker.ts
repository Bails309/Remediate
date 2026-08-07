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
import { monitorEventLoopDelay } from "node:perf_hooks";
import v8 from "node:v8";

/** Reject rather than hang so a stalled probe is visible in logs. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const started = Date.now();
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      // Report when the timer actually fired: a large gap over `ms` means timers
      // themselves were starved, which is a different fault to a slow command.
      const timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms (timer fired at ${Date.now() - started}ms)`)),
        ms,
      );
      timer.unref();
    }),
  ]);
}

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
  const HEARTBEAT_WRITE_TIMEOUT_MS = 5_000;
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

  // A blocked event loop and an unreachable Redis look identical from the
  // outside (heartbeat stops advancing, worker shows "Stale") but need
  // opposite fixes. Sample the loop delay so the logs say which one it was.
  // This runs on its own synchronous interval: reading and resetting the
  // histogram inside the async heartbeat let backed-up ticks fire in a burst
  // after a stall and reset it before the stall was ever reported, which is how
  // a 32s Redis write came to be logged alongside "loop lag 0ms".
  const loopDelay = monitorEventLoopDelay({ resolution: 20 });
  loopDelay.enable();
  const LOOP_LAG_WARN_MS = 1_000;
  let lastLoopLagMs = 0;

  setInterval(() => {
    lastLoopLagMs = loopDelay.max / 1e6;
    loopDelay.reset();

    // Long, *growing* pauses are usually GC under memory pressure rather than
    // application CPU, and end in an OOM kill that looks like an unexplained
    // container crash. Report heap so the two are distinguishable.
    const mem = process.memoryUsage();
    const heapUsedMb = Math.round(mem.heapUsed / 1048576);
    const heapTotalMb = Math.round(mem.heapTotal / 1048576);
    const rssMb = Math.round(mem.rss / 1048576);
    const heapLimitMb = Math.round(v8.getHeapStatistics().heap_size_limit / 1048576);

    if (lastLoopLagMs > LOOP_LAG_WARN_MS) {
      console.warn(
        `[Heartbeat] Event loop blocked for up to ${Math.round(lastLoopLagMs)}ms in the last interval — ` +
          `heap ${heapUsedMb}/${heapTotalMb}MB (limit ${heapLimitMb}MB), rss ${rssMb}MB.`,
      );
    }

    if (heapUsedMb > heapLimitMb * 0.85) {
      console.error(
        `[Heartbeat] Heap at ${heapUsedMb}MB of ${heapLimitMb}MB limit (rss ${rssMb}MB) — ` +
          `approaching OOM; long pauses from here are GC, not application CPU.`,
      );
    }
  }, HEARTBEAT_INTERVAL_MS).unref();

  setInterval(async () => {
    const started = Date.now();
    try {
      // `commandTimeout` only bounds per-node commands; in cluster mode a write
      // issued while the slot map is refreshing waits in the cluster-level queue
      // unbounded (observed: a 28s SET on a client configured to fail at 5s).
      await withTimeout(
        heartbeatRedis.set(HEARTBEAT_KEY, Date.now().toString()),
        HEARTBEAT_WRITE_TIMEOUT_MS,
        "heartbeat write",
      );
      const elapsed = Date.now() - started;
      if (elapsed > 1_000) {
        console.warn(`[Heartbeat] Redis SET took ${elapsed}ms (loop lag ${Math.round(lastLoopLagMs)}ms)`);
      }
    } catch (err) {
      console.error(
        `[Heartbeat] Failed to write worker heartbeat after ${Date.now() - started}ms ` +
          `(loop lag ${Math.round(lastLoopLagMs)}ms):`,
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
    const started = Date.now();
    try {
      // The shared BullMQ client uses `maxRetriesPerRequest: null`, so a read
      // issued while the socket is down queues forever and this probe silently
      // stops reporting. Time-cap it so the gap is logged instead.
      const [uploadCounts, pentestCounts] = await withTimeout(
        Promise.all([
          uploadQueue.getJobCounts("waiting", "active", "delayed", "failed"),
          pentestPdfQueue.getJobCounts("waiting", "active", "delayed", "failed"),
        ]),
        15_000,
        "queue depth read",
      );
      console.log(
        `[QueueDepth] upload=${JSON.stringify(uploadCounts)} pentest=${JSON.stringify(pentestCounts)} (${Date.now() - started}ms)`,
      );
    } catch (err) {
      console.error(`[QueueDepth] failed to read counts after ${Date.now() - started}ms:`, err);
    }
  }, DEPTH_LOG_INTERVAL_MS);

  console.log("BullMQ Worker is listening for jobs...");
}

run().catch((error) => {
  console.error("Worker crashed", error);
  process.exit(1);
});
