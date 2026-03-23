import { redis } from "@/lib/redis";
import type { NextRequest } from "next/server";

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 120;

function getClientId(request: NextRequest, userId?: string) {
  // Prefer authenticated user ID for accurate per-user rate limiting.
  if (userId) return `user:${userId}`;
  // Fall back to IP-based identification.
  return (request as { ip?: string }).ip ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
}

/**
 * Atomic Lua script to increment a key and set its expiration if it's the first hit.
 * Returns the current count.
 */
const LUA_INCR_EXPIRE = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return current
`;

export async function enforceRateLimit(request: NextRequest, userId?: string) {
  const clientId = getClientId(request, userId);
  const key = `ratelimit:${clientId}`;

  // Use Lua script for atomicity to prevent permanent lockout on crash between INCR and EXPIRE
  const current = await redis.eval(LUA_INCR_EXPIRE, 1, key, WINDOW_SECONDS) as number;

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
