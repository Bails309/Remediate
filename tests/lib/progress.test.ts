import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn(),
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
});
