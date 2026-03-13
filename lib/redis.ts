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
    // For Cluster mode, parse the URL to extract a safe seed node {host, port}
    try {
      const parsed = new URL(url);
      const isRediss = parsed.protocol === "rediss:";
      const seedNodes = [{
        host: parsed.hostname,
        port: Number(parsed.port) || (isRediss ? 6380 : 6379),
      }];

      return new Redis.Cluster(seedNodes, {
        redisOptions: {
          ...options,
          password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        },
        clusterRetryStrategy: (times) => Math.min(times * 100, 2000),
        // Ensure TLS is enabled for all discovered shards in clustered mode
        ...(isRediss && {
          dnsLookup: (address: string, callback: (err: Error | null, address: string) => void) => callback(null, address),
        }),
      }) as unknown as Redis;
    } catch (err) {
      console.error("[Redis] Failed to parse Redis URL for Cluster seed. Falling back to simple array.", err);
      return new Redis.Cluster([url], {
        redisOptions: options,
        clusterRetryStrategy: (times) => Math.min(times * 100, 2000),
      }) as unknown as Redis;
    }
  }

  try {
    return new RedisCtor(url, options);
  } catch {
    return RedisCtor(url, options);
  }
}

// Lazy initialization: avoid creating a live Redis connection at module-import time
// (this prevents `next build` from attempting to connect to Redis while it
// analyzes server modules). We expose a proxy that initializes the real
// client on first property access or method call.
function buildRedisInstance() {
  const rawUrl = process.env.REDIS_URL;

  if (!rawUrl) {
    console.error(`[Redis] CRITICAL: REDIS_URL is MISSING or EMPTY. Falling back to localhost.`);
  }

  const url = rawUrl || DEFAULT_REDIS_URL;
  const isTls = url.startsWith("rediss://");
  const tlsReject = isTls ? (process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== "false") : undefined;

  // Ensure a per-URL+tls cache on globalThis
  globalForRedis.redisMap = globalForRedis.redisMap ?? {};
  const cacheKey = isTls ? `${url}|tls:${String(tlsReject)}` : url;
  if (globalForRedis.redisMap[cacheKey]) return globalForRedis.redisMap[cacheKey];

  const logUrl = url.replace(/:([^:@]+)@/, ":****@");
  console.error(`[Redis] Connecting (Mode: ${isCluster ? "Cluster" : "Standard"}, URL: ${logUrl}, TLS: ${isTls}, RejectUnauthorized: ${tlsReject})`);

  const inst = createRedisInstance(url, {
    maxRetriesPerRequest: null, // Required for BullMQ
    ...(isTls && {
      tls: {
        rejectUnauthorized: tlsReject,
      },
    }),
  });
  globalForRedis.redisMap[cacheKey] = inst;
  return inst;
}

const lazyHandler: ProxyHandler<Redis> = {
  get(_, prop) {
    let real = (globalForRedis as typeof globalForRedis & { __realRedis?: Redis }).__realRedis;
    if (!real) {
      real = (globalForRedis as typeof globalForRedis & { __realRedis?: Redis }).__realRedis = buildRedisInstance();
    }
    const value = Reflect.get(real, prop);
    if (typeof value === "function") return value.bind(real);
    return value;
  },
  set(_, prop, val) {
    let real = (globalForRedis as typeof globalForRedis & { __realRedis?: Redis }).__realRedis;
    if (!real) {
      real = (globalForRedis as typeof globalForRedis & { __realRedis?: Redis }).__realRedis = buildRedisInstance();
    }
    return Reflect.set(real, prop, val);
  },
  has(_, prop) {
    let real = (globalForRedis as typeof globalForRedis & { __realRedis?: Redis }).__realRedis;
    if (!real) {
      real = (globalForRedis as typeof globalForRedis & { __realRedis?: Redis }).__realRedis = buildRedisInstance();
    }
    return prop in real;
  },
  ownKeys() {
    let real = (globalForRedis as typeof globalForRedis & { __realRedis?: Redis }).__realRedis;
    if (!real) {
      real = (globalForRedis as typeof globalForRedis & { __realRedis?: Redis }).__realRedis = buildRedisInstance();
    }
    return Reflect.ownKeys(real as object);
  },
  getOwnPropertyDescriptor(_, prop) {
    let real = (globalForRedis as typeof globalForRedis & { __realRedis?: Redis }).__realRedis;
    if (!real) {
      real = (globalForRedis as typeof globalForRedis & { __realRedis?: Redis }).__realRedis = buildRedisInstance();
    }
    return Object.getOwnPropertyDescriptor(real, prop as PropertyKey) || undefined;
  },
};

export const redis = new Proxy({}, lazyHandler) as unknown as Redis;

// In non-production envs we still populate the cache key mapping to the proxy so
// tests that inspect `globalForRedis.redisMap` see a value (the real client will
// be created lazily on first use).
if (process.env.NODE_ENV !== "production") {
  const _url = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
  const _isTls = _url.startsWith("rediss://");
  const _tlsReject = _isTls ? (process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== "false") : undefined;
  const devKey = _isTls ? `${_url}|tls:${String(_tlsReject)}` : _url;
  globalForRedis.redisMap = globalForRedis.redisMap ?? {};
  globalForRedis.redisMap[devKey] = redis;
}
