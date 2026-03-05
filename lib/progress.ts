import { redis } from "@/lib/redis";

const PROGRESS_TTL_SECONDS = 60 * 60;

export function getProgressKey(uploadId: string) {
  return `upload:progress:${uploadId}`;
}

export async function setProgress(uploadId: string, data: Record<string, unknown>) {
  await redis.set(getProgressKey(uploadId), JSON.stringify(data), "EX", PROGRESS_TTL_SECONDS);
}
