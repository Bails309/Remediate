import Redis, { RedisOptions } from "ioredis";

const globalForRedis = globalThis as unknown as {
  // map of url -> Redis instance so tests can create different instances
  // when `process.env.REDIS_URL` changes without being affected by a
  // previously cached client.
  redisMap?: Record<string, Redis>;
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
  (() => {
    const url = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
    const isTls = url.startsWith("rediss://");
    const tlsReject = isTls ? (process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== "false") : undefined;

    // Ensure a per-URL+tls cache on globalThis so tests that reload modules and
    // change `process.env.REDIS_URL` or `REDIS_TLS_REJECT_UNAUTHORIZED` get
    // their own client instance and don't accidentally reuse an instance
    // created with different TLS options.
    globalForRedis.redisMap = globalForRedis.redisMap ?? {};
    const cacheKey = isTls ? `${url}|tls:${String(tlsReject)}` : url;
    if (globalForRedis.redisMap[cacheKey]) return globalForRedis.redisMap[cacheKey];

    const inst = createRedisInstance(url, {
      maxRetriesPerRequest: process.env.REDIS_MAX_RETRIES === "null" ? null : 1,
      ...(isTls && {
        tls: {
          rejectUnauthorized: tlsReject,
        },
      }),
    });
    globalForRedis.redisMap[cacheKey] = inst;
    return inst;
  })();

if (process.env.NODE_ENV !== "production") {
  const _url = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
  const _isTls = _url.startsWith("rediss://");
  const _tlsReject = _isTls ? (process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== "false") : undefined;
  const devKey = _isTls ? `${_url}|tls:${String(_tlsReject)}` : _url;
  globalForRedis.redisMap = globalForRedis.redisMap ?? {};
  globalForRedis.redisMap[devKey] = redis;
}
