import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn().mockResolvedValue("OK"),
    eval: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(60),
  },
}));

import { setProgress, getProgressKey } from "@/lib/progress";

describe("progress.setProgress", () => {
  it("writes JSON to redis with EX TTL", async () => {
    const { redis } = await import("@/lib/redis");
    const uploadId = "u-123";
    const data = { step: "Testing", progress: 42 };

    await setProgress(uploadId, data);

    expect(redis.set).toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalledWith(
      getProgressKey(uploadId),
      JSON.stringify(data),
      "EX",
      expect.any(Number)
    );
  });

  it("never throws when the redis write rejects", async () => {
    const { redis } = await import("@/lib/redis");
    (redis.set as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Redis down"));

    await expect(
      setProgress("u-err", { step: "Comparing diffs", progress: 40 })
    ).resolves.toBeUndefined();
  });

  it("does not hang when the redis write stalls (fails fast via timeout)", async () => {
    vi.useFakeTimers();
    const { redis } = await import("@/lib/redis");
    // Simulate a stalled connection: the SET never settles.
    (redis.set as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(() => {}));

    const pending = setProgress("u-stall", { step: "Comparing diffs", progress: 40 });
    // Advance past the internal write timeout so the guard fires.
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
