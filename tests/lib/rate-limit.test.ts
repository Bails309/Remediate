import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/redis", () => ({
  redis: {
    eval: vi.fn(),
    ttl: vi.fn(),
  },
}));

import { redis } from "../../lib/redis";

beforeEach(() => vi.clearAllMocks());

describe("enforceRateLimit", () => {
  it("allows requests under the limit", async () => {
    vi.mocked(redis.eval).mockResolvedValue(1 as never);
    vi.mocked(redis.ttl).mockResolvedValue(55 as never);

    const { enforceRateLimit } = await import("../../lib/rate-limit");
    const req = new Request("http://localhost/api/test") as any;
    req.ip = "1.2.3.4";
    const result = await enforceRateLimit(req);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(119);
  });

  it("blocks requests over the limit", async () => {
    vi.mocked(redis.eval).mockResolvedValue(121 as never);
    vi.mocked(redis.ttl).mockResolvedValue(30 as never);

    const { enforceRateLimit } = await import("../../lib/rate-limit");
    const req = new Request("http://localhost/api/test") as any;
    req.ip = "1.2.3.4";
    const result = await enforceRateLimit(req);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("uses userId when provided instead of IP", async () => {
    vi.mocked(redis.eval).mockResolvedValue(1 as never);
    vi.mocked(redis.ttl).mockResolvedValue(60 as never);

    const { enforceRateLimit } = await import("../../lib/rate-limit");
    const req = new Request("http://localhost/api/test") as any;
    req.ip = "1.2.3.4";
    const result = await enforceRateLimit(req, "user-123");

    expect(result.allowed).toBe(true);
    // Verify Lua script was called with the user-based key
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "ratelimit:user:user-123",
      60
    );
  });

  it("falls back to x-forwarded-for when ip is not available", async () => {
    vi.mocked(redis.eval).mockResolvedValue(1 as never);
    vi.mocked(redis.ttl).mockResolvedValue(60 as never);

    const { enforceRateLimit } = await import("../../lib/rate-limit");
    const req = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2" },
    }) as any;
    const result = await enforceRateLimit(req);

    expect(result.allowed).toBe(true);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "ratelimit:10.0.0.1",
      60
    );
  });
});
