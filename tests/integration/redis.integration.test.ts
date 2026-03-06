import { describe, it, expect } from "vitest";
import { redis } from "@/lib/redis";

describe("redis integration", () => {
  it("connects to redis and can set/get a key", async () => {
    await redis.set("test:ci:key", "1", "EX", 10);
    const v = await redis.get("test:ci:key");
    expect(v).toBe("1");
    await redis.del("test:ci:key");
  });
});
