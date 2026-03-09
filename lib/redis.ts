import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis?: Redis;
};

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const isTls = redisUrl.startsWith("rediss://");

function createRedisInstance(url: string, options: Record<string, unknown>) {
  try {
    // Prefer constructing (normal runtime with ioredis class)
    // eslint-disable-next-line new-cap
    return new (Redis as any)(url, options);
  } catch (err) {
    // Fallback for test mocks that provide a factory (arrow) function
    return (Redis as any)(url, options);
  }
}

export const redis =
  globalForRedis.redis ??
  createRedisInstance(redisUrl, {
    maxRetriesPerRequest: 1,
    ...(isTls && {
      tls: {
        rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== "false",
      },
    }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
