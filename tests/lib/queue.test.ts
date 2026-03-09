import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn(),
    lpush: vi.fn(),
    zadd: vi.fn(),
    incr: vi.fn(),
    del: vi.fn(),
    lrange: vi.fn(),
    lrem: vi.fn(),
    pipeline: vi.fn(() => ({ exec: vi.fn().mockResolvedValue([]) })),
    get: vi.fn(),
    zrangebyscore: vi.fn(),
    multi: vi.fn(() => ({ zrem: vi.fn(), lpush: vi.fn(), exec: vi.fn() })),
    brpop: vi.fn(),
    eval: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(60),
  },
}));

import * as queue from "@/lib/queue";
import { redis } from "@/lib/redis";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("queue operations", () => {
  it("enqueueUpload stores payload and pushes to list", async () => {
    await queue.enqueueUpload("u1", "payload");
    expect(redis.set).toHaveBeenCalledWith(queue.getPayloadKey("u1"), "payload", "EX", expect.any(Number));
    expect(redis.lpush).toHaveBeenCalled();
  });

  it("getPayload returns redis.get", async () => {
    vi.mocked(redis.get).mockResolvedValue("payload");
    const val = await queue.getPayload("u1");
    expect(val).toBe("payload");
  });

  it("dequeueUpload returns id when brpop returns tuple", async () => {
    vi.mocked(redis.zrangebyscore).mockResolvedValue([]);
    vi.mocked(redis.brpop).mockResolvedValue(["upload:queue", "u1"]);
    const id = await queue.dequeueUpload();
    expect(id).toBe("u1");
  });
});
