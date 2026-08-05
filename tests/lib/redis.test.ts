import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock ioredis BEFORE importing lib/redis
vi.mock("ioredis", () => {
    const RedisMock: any = vi.fn(function (url, options) {
        return { url, options };
    });
    RedisMock.Cluster = vi.fn(function (nodes, options) {
        return { nodes, options, isCluster: true };
    });
    return {
        default: RedisMock,
    };
});

describe("Redis client initialization", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("should initialize without TLS options for redis:// URL", async () => {
        process.env.REDIS_URL = "redis://localhost:6379";
        const { redis } = await import("@/lib/redis");
        void (redis as any).options; // Trigger lazy initialization
        const RedisMock = (await import("ioredis")).default;

        expect(RedisMock).toHaveBeenCalledWith("redis://localhost:6379", {
            maxRetriesPerRequest: null,
            keepAlive: 30_000,
        });
    });

    it("should initialize with default TLS options for rediss:// URL", async () => {
        process.env.REDIS_URL = "rediss://external-redis:6379";
        const { redis } = await import("@/lib/redis");
        void (redis as any).options; // Trigger lazy initialization
        const RedisMock = (await import("ioredis")).default;

        expect(RedisMock).toHaveBeenCalledWith("rediss://external-redis:6379", {
            maxRetriesPerRequest: null,
            keepAlive: 30_000,
            tls: {
                rejectUnauthorized: true,
            },
        });
    });

    it("should allow disabling rejectUnauthorized for rediss:// URL", async () => {
        process.env.REDIS_URL = "rediss://external-redis:6379";
        process.env.REDIS_TLS_REJECT_UNAUTHORIZED = "false";
        const { redis } = await import("@/lib/redis");
        void (redis as any).options; // Trigger lazy initialization
        const RedisMock = (await import("ioredis")).default;

        expect(RedisMock).toHaveBeenCalledWith("rediss://external-redis:6379", {
            maxRetriesPerRequest: null,
            keepAlive: 30_000,
            tls: {
                rejectUnauthorized: false,
            },
        });
    });
});

describe("Redis proxy handler methods", () => {
    const origEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...origEnv, REDIS_URL: "redis://localhost:6379" };
    });

    afterEach(() => {
        process.env = origEnv;
    });

    it("set handler sets a property on the underlying instance", async () => {
        const { redis } = await import("@/lib/redis");
        (redis as any).customProp = "test-value";
        expect((redis as any).customProp).toBe("test-value");
    });

    it("has handler checks property existence", async () => {
        const { redis } = await import("@/lib/redis");
        void (redis as any).url; // trigger lazy init
        expect("url" in redis).toBe(true);
        expect("nonExistentProp" in redis).toBe(false);
    });

    it("ownKeys handler returns keys of the underlying instance", async () => {
        const { redis } = await import("@/lib/redis");
        void (redis as any).url; // trigger lazy init
        const keys = Reflect.ownKeys(redis);
        expect(keys).toContain("url");
    });

    it("getOwnPropertyDescriptor returns descriptor for known props", async () => {
        const { redis } = await import("@/lib/redis");
        void (redis as any).url; // trigger lazy init
        const desc = Object.getOwnPropertyDescriptor(redis, "url");
        expect(desc).toBeDefined();
        expect(desc!.value).toBe("redis://localhost:6379");
    });
});

describe("getBullmqConnection", () => {
    const origEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...origEnv };
        delete process.env.REDIS_CLUSTER_MODE;
    });

    afterEach(() => {
        process.env = origEnv;
    });

    it("returns plain RedisOptions for a redis:// URL", async () => {
        process.env.REDIS_URL = "redis://redis-host:6379";
        const { getBullmqConnection } = await import("@/lib/redis");
        const conn = getBullmqConnection();
        expect(conn).toMatchObject({
            host: "redis-host",
            port: 6379,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            keepAlive: 30_000,
        });
        // No TLS block for plaintext URL
        expect(conn.tls).toBeUndefined();
        // Retry strategy must be a function so ioredis reconnects
        expect(typeof conn.retryStrategy).toBe("function");
        // Exercise the reconnect callbacks: backoff caps at 5s and only the
        // recoverable socket errors trigger a reconnect-on-error.
        expect((conn.retryStrategy as (t: number) => number)(1)).toBe(200);
        expect((conn.retryStrategy as (t: number) => number)(1000)).toBe(5_000);
        const reconnect = conn.reconnectOnError as (e: Error) => boolean;
        expect(reconnect(new Error("ETIMEDOUT"))).toBe(true);
        expect(reconnect(new Error("nope"))).toBe(false);
    });

    it("adds TLS options for rediss:// URL and honours REDIS_TLS_REJECT_UNAUTHORIZED=false", async () => {
        process.env.REDIS_URL = "rediss://secure-host:6380";
        process.env.REDIS_TLS_REJECT_UNAUTHORIZED = "false";
        const { getBullmqConnection } = await import("@/lib/redis");
        const conn = getBullmqConnection();
        expect(conn.tls).toEqual({ rejectUnauthorized: false });
        expect(conn.port).toBe(6380);
    });

    it("decodes URL-encoded credentials from the connection string", async () => {
        process.env.REDIS_URL = "rediss://user:p%40ss%2Fw%3Fd@secure-host:6380";
        const { getBullmqConnection } = await import("@/lib/redis");
        const conn = getBullmqConnection();
        expect(conn.username).toBe("user");
        expect(conn.password).toBe("p@ss/w?d");
    });

    it("falls back to localhost when REDIS_URL is unset", async () => {
        delete process.env.REDIS_URL;
        const { getBullmqConnection } = await import("@/lib/redis");
        const conn = getBullmqConnection();
        expect(conn.host).toBe("localhost");
        expect(conn.port).toBe(6379);
    });
});

describe("createDedicatedRedis", () => {
    const origEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...origEnv };
        delete process.env.REDIS_CLUSTER_MODE;
        delete process.env.REDIS_TLS_REJECT_UNAUTHORIZED;
    });

    afterEach(() => {
        process.env = origEnv;
    });

    it("builds a plaintext client with fail-fast overrides applied", async () => {
        process.env.REDIS_URL = "redis://redis-host:6379";
        const { createDedicatedRedis } = await import("@/lib/redis");
        const client = createDedicatedRedis({ commandTimeout: 5_000, maxRetriesPerRequest: 3 }) as any;

        expect(client.url).toBe("redis://redis-host:6379");
        expect(client.options).toMatchObject({
            keepAlive: 30_000,
            commandTimeout: 5_000,
            maxRetriesPerRequest: 3,
        });
        expect(client.options.tls).toBeUndefined();
        expect(typeof client.options.retryStrategy).toBe("function");
        expect(typeof client.options.reconnectOnError).toBe("function");

        // Invoke the callbacks so their behaviour (not just their presence) is
        // exercised: backoff grows then caps at 5s, and reconnectOnError only
        // triggers for the recoverable socket errors.
        expect(client.options.retryStrategy(1)).toBe(200);
        expect(client.options.retryStrategy(100)).toBe(5_000);
        expect(client.options.reconnectOnError(new Error("READONLY You can't write"))).toBe(true);
        expect(client.options.reconnectOnError(new Error("ECONNRESET"))).toBe(true);
        expect(client.options.reconnectOnError(new Error("some unrelated failure"))).toBe(false);
    });

    it("adds TLS options for a rediss:// URL", async () => {
        process.env.REDIS_URL = "rediss://secure-host:6380";
        const { createDedicatedRedis } = await import("@/lib/redis");
        const client = createDedicatedRedis() as any;

        expect(client.options.tls).toEqual({ rejectUnauthorized: true });
    });

    it("honours REDIS_TLS_REJECT_UNAUTHORIZED=false for a rediss:// URL", async () => {
        process.env.REDIS_URL = "rediss://secure-host:6380";
        process.env.REDIS_TLS_REJECT_UNAUTHORIZED = "false";
        const { createDedicatedRedis } = await import("@/lib/redis");
        const client = createDedicatedRedis() as any;

        expect(client.options.tls).toEqual({ rejectUnauthorized: false });
    });

    it("lets caller overrides win over the defaults", async () => {
        process.env.REDIS_URL = "redis://redis-host:6379";
        const { createDedicatedRedis } = await import("@/lib/redis");
        const client = createDedicatedRedis({ keepAlive: 1_234 }) as any;

        expect(client.options.keepAlive).toBe(1_234);
    });

    it("falls back to localhost when REDIS_URL is unset", async () => {
        delete process.env.REDIS_URL;
        const { createDedicatedRedis } = await import("@/lib/redis");
        const client = createDedicatedRedis() as any;

        expect(client.url).toBe("redis://localhost:6379");
    });
});

describe("cluster mode", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        // The lib caches clients on globalThis keyed by URL; clear it so each
        // test builds a fresh Cluster instead of reusing a cached one.
        delete (globalThis as any).redisMap;
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("builds a Redis.Cluster with generous slots-refresh timeout and SNI over TLS", async () => {
        process.env.REDIS_CLUSTER_MODE = "true";
        process.env.REDIS_URL = "rediss://:secret@remediate.uksouth.redis.azure.net:10000";
        delete process.env.REDIS_SLOTS_REFRESH_TIMEOUT_MS;

        const { redis } = await import("@/lib/redis");
        void (redis as any).options; // trigger lazy init

        const ClusterMock = ((await import("ioredis")).default as any).Cluster;
        expect(ClusterMock).toHaveBeenCalled();

        const [nodes, options] = ClusterMock.mock.calls[0];
        expect(nodes).toEqual([{ host: "remediate.uksouth.redis.azure.net", port: 10000 }]);
        // The default 1s slots-refresh timeout is the cause of the
        // "Failed to refresh slots cache" errors; ensure we raised it well past it.
        expect(options.slotsRefreshTimeout).toBeGreaterThanOrEqual(10_000);
        // SNI must be pinned to the endpoint host so per-shard TLS validates.
        expect(options.redisOptions.tls.servername).toBe("remediate.uksouth.redis.azure.net");
        expect(options.redisOptions.password).toBe("secret");

        // Exercise the callbacks so their behaviour is covered, not just present.
        expect(options.clusterRetryStrategy(1)).toBe(100);
        expect(options.clusterRetryStrategy(1000)).toBe(2000);
        const seen: string[] = [];
        options.dnsLookup("shard-1.internal", (_e: Error | null, addr: string) => seen.push(addr));
        expect(seen).toEqual(["shard-1.internal"]);
    });

    it("honours REDIS_SLOTS_REFRESH_TIMEOUT_MS override", async () => {
        process.env.REDIS_CLUSTER_MODE = "true";
        process.env.REDIS_URL = "rediss://:secret@remediate.uksouth.redis.azure.net:10000";
        process.env.REDIS_SLOTS_REFRESH_TIMEOUT_MS = "22000";

        const { redis } = await import("@/lib/redis");
        void (redis as any).options; // trigger lazy init

        const ClusterMock = ((await import("ioredis")).default as any).Cluster;
        const [, options] = ClusterMock.mock.calls[0];
        expect(options.slotsRefreshTimeout).toBe(22_000);
    });
});

