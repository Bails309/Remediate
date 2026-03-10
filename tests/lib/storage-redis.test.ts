import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/redis", () => ({
    redis: {
        set: vi.fn().mockResolvedValue("OK"),
        get: vi.fn(),
        del: vi.fn().mockResolvedValue(1),
    },
}));

import { getStorageProvider } from "@/lib/storage";

describe("RedisStorageProvider", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("saves content to redis with TTL", async () => {
        const provider = await getStorageProvider();
        // Since we explicitly want to test Redis, we'd normally mock the prisma config
        // but getStorageProvider falls back to Redis if no config is found.

        const { redis } = await import("@/lib/redis");
        await provider.save("test-key", "test-content");

        expect(redis.set).toHaveBeenCalledWith("test-key", "test-content", "EX", 7200);
    });

    it("reads content from redis", async () => {
        const provider = await getStorageProvider();
        const { redis } = await import("@/lib/redis");

        vi.mocked(redis.get).mockResolvedValue("test-content");
        const content = await provider.read("test-key");

        expect(content).toBe("test-content");
        expect(redis.get).toHaveBeenCalledWith("test-key");
    });

    it("throws error when file not found in redis", async () => {
        const provider = await getStorageProvider();
        const { redis } = await import("@/lib/redis");

        vi.mocked(redis.get).mockResolvedValue(null);
        await expect(provider.read("missing-key")).rejects.toThrow("File not found in Redis: missing-key");
    });

    it("deletes content from redis", async () => {
        const provider = await getStorageProvider();
        const { redis } = await import("@/lib/redis");

        await provider.delete("test-key");
        expect(redis.del).toHaveBeenCalledWith("test-key");
    });
});
