import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../lib/rbac", () => {
  const guard = vi.fn();
  return { requireAdmin: guard, requireSiteAdmin: guard };
});
vi.mock("../../lib/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { enforceRateLimit } from "../../lib/rate-limit";

beforeEach(() => vi.clearAllMocks());

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/oidc/test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/oidc/test POST", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
    const { POST } = await import("../../app/api/oidc/test/route");
    const res = await POST(makeRequest({ issuerUrl: "https://idp.example.com" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid URL", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    const { POST } = await import("../../app/api/oidc/test/route");
    const res = await POST(makeRequest({ issuerUrl: "not-a-url" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when discovery doc is not found", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    const { POST } = await import("../../app/api/oidc/test/route");
    const res = await POST(makeRequest({ issuerUrl: "https://idp.example.com" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("404");
  });

  it("returns 400 when discovery doc is invalid format", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ something: "else" }),
    });

    const { POST } = await import("../../app/api/oidc/test/route");
    const res = await POST(makeRequest({ issuerUrl: "https://idp.example.com" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid OIDC discovery document");
  });

  it("returns ok when discovery doc is valid", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        issuer: "https://idp.example.com",
        authorization_endpoint: "https://idp.example.com/authorize",
      }),
    });

    const { POST } = await import("../../app/api/oidc/test/route");
    const res = await POST(makeRequest({ issuerUrl: "https://idp.example.com" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.issuer).toBe("https://idp.example.com");
  });

  it("returns 500 for non-ZodError exceptions (e.g. network error)", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    mockFetch.mockRejectedValue(new Error("Network timeout"));

    const { POST } = await import("../../app/api/oidc/test/route");
    const res = await POST(makeRequest({ issuerUrl: "https://idp.example.com" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Network timeout");
  });
});
