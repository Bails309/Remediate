import { redis } from "@/lib/redis";

const PROGRESS_TTL_SECONDS = 60 * 60;

// Progress writes are best-effort UI sugar. The authoritative upload status
// lives in Postgres (uploadHistory.status). The shared `redis` client is
// configured with maxRetriesPerRequest: null (required by BullMQ), which means
// a command issued while the socket is down queues indefinitely and never
// rejects. Without a timeout, a single stalled progress write can wedge an
// entire ingest before it reaches the "Completed" DB write, leaving the upload
// stuck in "Processing" forever. Cap each write so a degraded Redis can never
// block the job.
const PROGRESS_WRITE_TIMEOUT_MS = 2_000;

export function getProgressKey(uploadId: string) {
  return `upload:progress:${uploadId}`;
}

export async function setProgress(uploadId: string, data: Record<string, unknown>) {
  try {
    await withTimeout(
      redis.set(getProgressKey(uploadId), JSON.stringify(data), "EX", PROGRESS_TTL_SECONDS),
      PROGRESS_WRITE_TIMEOUT_MS,
    );
  } catch (err) {
    // Never let a progress write failure abort or hang an ingest.
    console.warn(`[Progress] Failed to write progress for ${uploadId}:`, err);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Redis progress write timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
