import { prisma } from "../lib/prisma";
import { setProgress } from "../lib/progress";
import { uploadQueue, getLockKey } from "../lib/queue";
import { redis } from "../lib/redis";
import { processNessusUpload } from "../lib/ingest";
import { UploadStatus } from "@prisma/client";
import { startReportScheduler } from "../lib/report-scheduler";
import { Worker, Job } from "bullmq";

async function processJob(job: Job<any>) {
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
        data: { status: UploadStatus.Failed },
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

  const HEARTBEAT_KEY = "worker:heartbeat";
  const HEARTBEAT_INTERVAL_MS = 10_000;
  setInterval(async () => {
    try {
      await redis.set(HEARTBEAT_KEY, Date.now().toString());
    } catch (err) {
      console.error("Failed to set worker heartbeat", err);
    }
  }, HEARTBEAT_INTERVAL_MS);

  const worker = new Worker("upload-queue", processJob, {
    connection: {
      ...redis.options,
      maxRetriesPerRequest: null,
    },
    concurrency: 2,
  });

  worker.on('completed', job => {
    console.log(`Job ${job.id} completed!`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`Job ${job?.id} failed with ${err.message}`);
  });

  console.log("BullMQ Worker is listening for jobs...");
}

run().catch((error) => {
  console.error("Worker crashed", error);
  process.exit(1);
});
