import Redis, { RedisOptions } from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis?: Redis;
};

// Note: compute the URL/`isTls` at creation time to respect changes to
// `process.env.REDIS_URL` during tests (modules may be reloaded by vitest).
const DEFAULT_REDIS_URL = "redis://localhost:6379";

type RedisLike = {
  new(url: string, options?: RedisOptions): Redis;
  (url: string, options?: RedisOptions): Redis;
};

const RedisCtor = Redis as unknown as RedisLike;

const isCluster = process.env.REDIS_CLUSTER_MODE === "true";

function createRedisInstance(url: string, options?: RedisOptions) {
  if (isCluster) {
    // For Cluster mode, we pass the URL as the seed node
    return new Redis.Cluster([url], {
      redisOptions: options,
      clusterRetryStrategy: (times) => Math.min(times * 100, 2000),
      dnsLookup: (address, callback) => callback(null, address), // Use provided address
    }) as unknown as Redis;
  }

  try {
    return new RedisCtor(url, options);
  } catch {
    return RedisCtor(url, options);
  }
}

export const redis =
  globalForRedis.redis ??
  (() => {
    const url = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
    const isTls = url.startsWith("rediss://");
    return createRedisInstance(url, {
      maxRetriesPerRequest: 1,
      ...(isTls && {
        tls: {
          rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== "false",
        },
      }),
    });
  })();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
