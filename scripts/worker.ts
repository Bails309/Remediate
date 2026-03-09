import { prisma } from "../lib/prisma";
import { setProgress } from "../lib/progress";
import {
  deletePayload,
  dequeueUpload,
  getLockKey,
  getPayload,
  incrementRetry,
  resetRetry,
  scheduleRetry,
  sendToDeadLetter,
} from "../lib/queue";
import { redis } from "../lib/redis";
import { processNessusUpload } from "../lib/ingest";
import { UploadStatus } from "@prisma/client";
import { startReportScheduler } from "../lib/report-scheduler";
import { redis } from "../lib/redis";

const MAX_RETRIES = 3;
const BASE_DELAY_SECONDS = 15;
const LOCK_TTL_SECONDS = 60 * 30;

async function processJob(uploadId: string) {
  const upload = await prisma.uploadHistory.findUnique({ where: { id: uploadId } });
  if (!upload) {
    await deletePayload(uploadId);
    return;
  }

  const payload = await getPayload(uploadId);
  if (!payload) {
    await prisma.uploadHistory.update({
      where: { id: uploadId },
      data: { status: UploadStatus.Failed },
    });
    await setProgress(uploadId, { step: "Failed", progress: 100 });
    await sendToDeadLetter(uploadId);
    await redis.del(getLockKey(upload.siteId));
    return;
  }

  let shouldDeletePayload = false;
  let shouldReleaseLock = false;

  try {
    await setProgress(uploadId, { step: "Processing", progress: 15 });
    await processNessusUpload({ uploadId, siteId: upload.siteId, text: payload });
    await resetRetry(uploadId);
    shouldDeletePayload = true;
    shouldReleaseLock = true;
  } catch (error) {
    console.error('Error processing upload', uploadId, error);
    const attempt = await incrementRetry(uploadId);
    if (attempt <= MAX_RETRIES) {
      const delay = BASE_DELAY_SECONDS * Math.pow(2, attempt - 1);
      await setProgress(uploadId, { step: `Retrying in ${delay}s`, progress: 30 });
      await scheduleRetry(uploadId, delay);
      await redis.expire(getLockKey(upload.siteId), LOCK_TTL_SECONDS);
      return;
    }

    await prisma.uploadHistory.update({
      where: { id: uploadId },
      data: { status: UploadStatus.Failed },
    });
    await setProgress(uploadId, { step: "Failed", progress: 100 });
    await sendToDeadLetter(uploadId);
    shouldReleaseLock = true;
  } finally {
    if (shouldDeletePayload) {
      await deletePayload(uploadId);
    }
    if (shouldReleaseLock) {
      await redis.del(getLockKey(upload.siteId));
    }
    // Optimization: run maintenance after successfully processing an upload
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

      console.log(`✓ Maintenance complete for site ${upload.siteId}`);
    } catch {
      // Silently skip if vacuum fails (e.g. concurrent vacuum in progress)
      console.log(`Note: Maintenance skipped for ${uploadId}`);
    }
  }
}

async function run() {
  console.log("Worker started");
  startReportScheduler();
  // heartbeat key for health checks: updated periodically so the app can detect worker liveness
  const HEARTBEAT_KEY = "worker:heartbeat";
  const HEARTBEAT_INTERVAL_MS = 10_000;
  setInterval(async () => {
    try {
      await redis.set(HEARTBEAT_KEY, Date.now().toString());
    } catch (err) {
      console.error("Failed to set worker heartbeat", err);
    }
  }, HEARTBEAT_INTERVAL_MS);
  while (true) {
    const uploadId = await dequeueUpload();
    if (!uploadId) {
      continue;
    }
    await processJob(uploadId);
  }
}

run().catch((error) => {
  console.error("Worker crashed", error);
  process.exit(1);
});
