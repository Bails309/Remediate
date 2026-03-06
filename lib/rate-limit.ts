import { redis } from "@/lib/redis";
import type { NextRequest } from "next/server";

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 120;

function getClientId(request: NextRequest) {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function enforceRateLimit(request: NextRequest) {
  const clientId = getClientId(request);
  const key = `ratelimit:${clientId}`;
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }
  if (current > MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetSeconds: await redis.ttl(key),
    };
  }
  return {
    allowed: true,
    remaining: Math.max(0, MAX_REQUESTS - current),
    resetSeconds: await redis.ttl(key),
  };
}
