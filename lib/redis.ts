import Redis, { RedisOptions } from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis?: Redis;
};

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const isTls = redisUrl.startsWith("rediss://");

type RedisLike = {
  new (url: string, options?: RedisOptions): Redis;
  (url: string, options?: RedisOptions): Redis;
};

const RedisCtor = Redis as unknown as RedisLike;

function createRedisInstance(url: string, options?: RedisOptions) {
  try {
    return new RedisCtor(url, options);
  } catch {
    return RedisCtor(url, options);
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
