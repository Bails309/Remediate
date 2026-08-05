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
    // TCP keepalive so managed-Redis idle-timeout drops don't leave us with a
    // half-open socket. 30s is well below the 10-minute default idle window
    // on Azure Cache for Redis / most managed providers.
    keepAlive: 30_000,
    ...(isTls && {
      tls: {
        rejectUnauthorized: tlsReject,
      },
    }),
  });
  globalForRedis.redisMap[cacheKey] = inst;
  return inst;
}

/**
 * Create a fresh, dedicated (non-cached) Redis client using the same
 * URL / TLS / cluster handling as the shared client, but with caller-provided
 * option overrides.
 *
 * Unlike the shared `redis` proxy (which uses `maxRetriesPerRequest: null` for
 * BullMQ and therefore lets commands queue forever while disconnected), this is
 * intended for fail-fast side channels such as the worker heartbeat: pass a
 * finite `commandTimeout` / `maxRetriesPerRequest` so a dropped socket surfaces
 * an error quickly instead of silently hanging.
 */
export function createDedicatedRedis(overrides: RedisOptions = {}): Redis {
  const url = process.env.REDIS_URL || DEFAULT_REDIS_URL;
  const isTls = url.startsWith("rediss://");
  const tlsReject = isTls
    ? process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== "false"
    : undefined;

  return createRedisInstance(url, {
    keepAlive: 30_000,
    retryStrategy: (times: number) => Math.min(times * 200, 5_000),
    reconnectOnError: (err: Error) =>
      /READONLY|ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND/i.test(err.message),
    ...(isTls && {
      tls: {
        rejectUnauthorized: tlsReject,
      },
    }),
    ...overrides,
  });
}

/**
 * Build a connection descriptor for BullMQ Queue/Worker instances.
 *
 * BullMQ v5 strongly recommends that each Queue/Worker own its own Redis
 * connections rather than sharing a client — the internal `bclient` used for
 * `BRPOPLPUSH` needs its own reconnect lifecycle, and sharing a client can
 * leave workers silently unable to pull jobs when the blocking socket dies.
 *
 * For standard mode we return a plain RedisOptions object so BullMQ can
 * construct (and later `duplicate()`) its own dedicated clients. For cluster
 * mode we build a fresh `Redis.Cluster` instance per caller for the same
 * reason — never shared with the general `redis` client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBullmqConnection(): any {
  const rawUrl = process.env.REDIS_URL || DEFAULT_REDIS_URL;
  const isTls = rawUrl.startsWith("rediss://");
  const tlsReject = isTls
    ? process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== "false"
    : undefined;

  if (isCluster) {
    // Cluster mode: BullMQ requires an actual Cluster instance; build a
    // dedicated one so BullMQ owns its lifecycle end-to-end.
    // NOTE: TLS options must be forwarded here so `Redis.Cluster` applies
    // them to every discovered shard. Without this, connecting to
    // `rediss://` cluster endpoints closes the socket during handshake
    // and surfaces as `ClusterAllFailedError: Failed to refresh slots cache`.
    return createRedisInstance(rawUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      keepAlive: 30_000,
      ...(isTls && {
        tls: {
          rejectUnauthorized: tlsReject,
        },
      }),
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    parsed = new URL(DEFAULT_REDIS_URL);
  }

  const port = Number(parsed.port) || (isTls ? 6380 : 6379);

  return {
    host: parsed.hostname,
    port,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    // Required by BullMQ so `add()` can still queue while ioredis reconnects.
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    keepAlive: 30_000,
    retryStrategy: (times: number) => Math.min(times * 200, 5_000),
    reconnectOnError: (err: Error) =>
      /READONLY|ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND/i.test(err.message),
    ...(isTls && {
      tls: {
        rejectUnauthorized: tlsReject,
      },
    }),
  };
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
