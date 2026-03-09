import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis?: Redis;
};

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const isTls = redisUrl.startsWith("rediss://");

export const redis =
  globalForRedis.redis ??
  new Redis(redisUrl, {
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
