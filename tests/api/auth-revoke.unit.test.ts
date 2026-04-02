import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/redis", () => ({ redis: { set: vi.fn() } }));
vi.mock("next-auth/jwt", () => ({ decode: vi.fn() }));

// Mock next/headers cookies
const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: mockCookieGet }),
}));

import { auth } from "../../auth";
import { redis } from "../../lib/redis";
import { decode } from "next-auth/jwt";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/auth/revoke POST", () => {
  it("returns ok when no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const { POST } = await import("../../app/api/auth/revoke/route");
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns ok when no session cookie found", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    mockCookieGet.mockReturnValue(undefined);

    const { POST } = await import("../../app/api/auth/revoke/route");
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("adds jti to Redis blacklist on valid token", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    mockCookieGet.mockReturnValue({ name: "authjs.session-token", value: "token123" });
    vi.mocked(decode).mockResolvedValue({ jti: "jwt-id-123" } as any);

    const { POST } = await import("../../app/api/auth/revoke/route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(redis.set).toHaveBeenCalledWith("revoked:jwt-id-123", "1", "EX", 28800);
  });

  it("handles decode failure gracefully", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    mockCookieGet.mockReturnValue({ name: "authjs.session-token", value: "bad-token" });
    vi.mocked(decode).mockRejectedValue(new Error("Invalid token"));

    const { POST } = await import("../../app/api/auth/revoke/route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(redis.set).not.toHaveBeenCalled();
  });
});
