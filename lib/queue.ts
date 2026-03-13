import { Queue, Job } from "bullmq";
import { redis } from "@/lib/redis";

export const QUEUE_NAME = "{upload-queue}";

let _realQueue: Queue | undefined;

function buildQueue() {
  if (!_realQueue) {
    _realQueue = new Queue(QUEUE_NAME, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      connection: redis as any,
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
  }
  return _realQueue;
}

const queueHandler: ProxyHandler<Queue> = {
  get(_, prop) {
    const q = buildQueue();
    const value = Reflect.get(q, prop);
    if (typeof value === "function") return value.bind(q);
    return value;
  },
  set(_, prop, val) {
    const q = buildQueue();
    return Reflect.set(q, prop, val);
  },
  has(_, prop) {
    const q = buildQueue();
    return prop in q;
  },
  ownKeys() {
    const q = buildQueue();
    return Reflect.ownKeys(q as object);
  },
  getOwnPropertyDescriptor(_, prop) {
    const q = buildQueue();
    return Object.getOwnPropertyDescriptor(q as object, prop as PropertyKey) || undefined;
  },
};

export const uploadQueue = new Proxy({} as unknown as Queue, queueHandler);

export function getLockKey(siteId: string) {
  return `{site:${siteId}}:upload-lock`;
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
