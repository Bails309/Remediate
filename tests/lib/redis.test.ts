import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock ioredis BEFORE importing lib/redis
vi.mock("ioredis", () => {
    return {
        default: vi.fn(function (url, options) {
            return { url, options };
        }),
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

