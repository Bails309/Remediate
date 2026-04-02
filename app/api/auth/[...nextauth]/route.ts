import { handlers } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { redis } from "@/lib/redis";

const AUTH_WINDOW_SECONDS = 60;
const AUTH_MAX_REQUESTS = 10;

const LUA_INCR_EXPIRE = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return current
`;

async function enforceAuthRateLimit(request: NextRequest) {
  const clientIp =
    (request as { ip?: string }).ip ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const key = `ratelimit:auth:${clientIp}`;

  const current = (await redis.eval(
    LUA_INCR_EXPIRE,
    1,
    key,
    AUTH_WINDOW_SECONDS
  )) as number;

  if (current > AUTH_MAX_REQUESTS) {
    const retryAfter = await redis.ttl(key);
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      }
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  return handlers.GET(request);
}

export async function POST(request: NextRequest) {
  // Rate-limit POST (login attempts) — GET is used for session/CSRF
  const blocked = await enforceAuthRateLimit(request);
  if (blocked) return blocked;
  return handlers.POST(request);
}
