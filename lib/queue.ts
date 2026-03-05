import { redis } from "@/lib/redis";

const QUEUE_KEY = "upload:queue";
const DELAYED_KEY = "upload:queue:delayed";
const DEAD_LETTER_KEY = "upload:queue:dead";
const PAYLOAD_TTL_SECONDS = 60 * 60 * 2;

export function getPayloadKey(uploadId: string) {
  return `upload:payload:${uploadId}`;
}

export function getRetryKey(uploadId: string) {
  return `upload:retry:${uploadId}`;
}

export function getLockKey(siteId: string) {
  return `upload:lock:${siteId}`;
}

export async function enqueueUpload(uploadId: string, payload: string) {
  await redis.set(getPayloadKey(uploadId), payload, "EX", PAYLOAD_TTL_SECONDS);
  await redis.lpush(QUEUE_KEY, uploadId);
}

export async function scheduleRetry(uploadId: string, delaySeconds: number) {
  const score = Date.now() + delaySeconds * 1000;
  await redis.zadd(DELAYED_KEY, String(score), uploadId);
}

export async function incrementRetry(uploadId: string) {
  return redis.incr(getRetryKey(uploadId));
}

export async function resetRetry(uploadId: string) {
  return redis.del(getRetryKey(uploadId));
}

export async function sendToDeadLetter(uploadId: string) {
  await redis.lpush(DEAD_LETTER_KEY, uploadId);
}

export async function listDeadLetters(limit = 50) {
  return redis.lrange(DEAD_LETTER_KEY, 0, limit - 1);
}

export async function removeDeadLetter(uploadId: string) {
  return redis.lrem(DEAD_LETTER_KEY, 0, uploadId);
}

export async function removeDeadLetters(uploadIds: string[]) {
  if (uploadIds.length === 0) {
    return 0;
  }
  const pipeline = redis.pipeline();
  for (const id of uploadIds) {
    pipeline.lrem(DEAD_LETTER_KEY, 0, id);
  }
  const results = await pipeline.exec();
  return results?.length ?? 0;
}

export async function getRetryCount(uploadId: string) {
  const value = await redis.get(getRetryKey(uploadId));
  return value ? Number(value) : 0;
}

async function promoteDueRetries() {
  const now = Date.now();
  const due = await redis.zrangebyscore(DELAYED_KEY, 0, now, "LIMIT", 0, 1);
  if (due.length === 0) {
    return;
  }
  const uploadId = due[0];
  await redis.multi().zrem(DELAYED_KEY, uploadId).lpush(QUEUE_KEY, uploadId).exec();
}

export async function dequeueUpload() {
  await promoteDueRetries();
  const result = await redis.brpop(QUEUE_KEY, 5);
  if (!result) {
    return null;
  }
  return result[1];
}

export async function getPayload(uploadId: string) {
  return redis.get(getPayloadKey(uploadId));
}

export async function deletePayload(uploadId: string) {
  return redis.del(getPayloadKey(uploadId));
}
