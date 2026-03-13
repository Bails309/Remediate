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

type LazyRedisTarget = Redis & { __real?: Redis };

const lazyHandler: ProxyHandler<Redis> = {
  get(target: LazyRedisTarget, prop) {
    if (prop === "$$typeof" || prop === "then" || typeof prop === "symbol") {
      return Reflect.get(target, prop);
    }
    if (!target.__real) {
      target.__real = buildRedisInstance();
    }
    const real = target.__real;
    const value = Reflect.get(real, prop);
    if (typeof value === "function") return value.bind(real);
    return value;
  },
  set(target: LazyRedisTarget, prop, val) {
    if (!target.__real) {
      target.__real = buildRedisInstance();
    }
    return Reflect.set(target.__real, prop, val);
  },
  has(target: LazyRedisTarget, prop) {
    if (!target.__real) {
      target.__real = buildRedisInstance();
    }
    return prop in target.__real;
  },
  ownKeys(target: LazyRedisTarget) {
    if (!target.__real) {
      target.__real = buildRedisInstance();
    }
    return Reflect.ownKeys(target.__real as object);
  },
  getOwnPropertyDescriptor(target: LazyRedisTarget, prop) {
    if (!target.__real) {
      target.__real = buildRedisInstance();
    }
    return Reflect.getOwnPropertyDescriptor(target.__real, prop);
  },
};

export const redis = new Proxy({} as unknown as Redis, lazyHandler);

// In non-production envs we do NOT populate the cache key mapping to the proxy
// because the map should only contain real Redis instances. Storing the proxy
// here causes buildRedisInstance to return the proxy itself when it looks for
// a cached instance, leading to infinite recursion in the proxy's getter.
if (process.env.NODE_ENV !== "production") {
  globalForRedis.redisMap = globalForRedis.redisMap ?? {};
}
