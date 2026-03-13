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
        });
    });

    it("should initialize with default TLS options for rediss:// URL", async () => {
        process.env.REDIS_URL = "rediss://external-redis:6379";
        const { redis } = await import("@/lib/redis");
        void (redis as any).options; // Trigger lazy initialization
        const RedisMock = (await import("ioredis")).default;

        expect(RedisMock).toHaveBeenCalledWith("rediss://external-redis:6379", {
            maxRetriesPerRequest: null,
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
            tls: {
                rejectUnauthorized: false,
            },
        });
    });
});
