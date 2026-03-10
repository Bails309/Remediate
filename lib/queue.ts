import { Queue, Job } from "bullmq";
import { redis } from "@/lib/redis";

const QUEUE_NAME = "upload-queue";

export const uploadQueue = new Queue(QUEUE_NAME, {
  connection: {
    ...redis.options,
    maxRetriesPerRequest: null,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 15000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export function getLockKey(siteId: string) {
  return `upload:lock:${siteId}`;
}

export async function enqueueUpload(uploadId: string, storageKey: string) {
  // Use uploadId as jobId for easy lookup in dead-letter management
  await uploadQueue.add(uploadId, { uploadId, storageKey }, { jobId: uploadId });
}

export async function listDeadLetters(limit: number = 50) {
  const jobs = await uploadQueue.getJobs(["failed"], 0, limit - 1, false);
  return jobs.map((job: Job) => job.id as string);
}

export async function getRetryCount(uploadId: string) {
  const job = await uploadQueue.getJob(uploadId);
  return job?.attemptsMade ?? 0;
}

export async function getPayload(uploadId: string) {
  const job = await uploadQueue.getJob(uploadId);
  return (job?.data?.storageKey as string) ?? null;
}

export async function removeDeadLetter(uploadId: string) {
  const job = await uploadQueue.getJob(uploadId);
  if (job) {
    await job.remove();
  }
}

export async function removeDeadLetters(ids: string[]) {
  for (const id of ids) {
    await removeDeadLetter(id);
  }
}

export async function resetRetry(uploadId: string) {
  // BullMQ handles retries differently, but for the dead-letter UI, 
  // we just remove the old failed job before re-enqueueing.
  await removeDeadLetter(uploadId);
}

export async function deletePayload(uploadId: string) {
  // This is now handled by StorageProvider, but we keep the helper for 
  // backward compatibility in the route.
  const { getStorageProvider } = await import("./storage");
  const storage = await getStorageProvider();
  const storageKey = `nessus-${uploadId}.csv`;
  try {
    await storage.delete(storageKey);
  } catch (err) {
    console.log(`Note: Failed to delete storage key ${storageKey}`, err);
  }
}
