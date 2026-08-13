import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../lib/oidc", () => ({
  getOidcConfigFromDb: vi.fn(),
  upsertOidcConfig: vi.fn(),
}));
vi.mock("../../lib/rbac", () => {
  const guard = vi.fn();
  return { requireAdmin: guard, requireSiteAdmin: guard };
});
vi.mock("../../lib/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { getOidcConfigFromDb, upsertOidcConfig } from "../../lib/oidc";
import { enforceRateLimit } from "../../lib/rate-limit";

beforeEach(() => vi.clearAllMocks());

function makeRequest(body?: object) {
  return new NextRequest("http://localhost/api/oidc", {
    method: body ? "POST" : "GET",
    ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
}

describe("/api/oidc GET", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
    const { GET } = await import("../../app/api/oidc/route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns configured false when no config", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(getOidcConfigFromDb).mockResolvedValue(null as any);

    const { GET } = await import("../../app/api/oidc/route");
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.configured).toBe(false);
  });

  it("returns masked config when configured", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(getOidcConfigFromDb).mockResolvedValue({
      clientId: "my-client",
      clientSecret: "supersecret",
      issuerUrl: "https://idp.example.com",
    } as any);

    const { GET } = await import("../../app/api/oidc/route");
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.configured).toBe(true);
    expect(data.clientId).toBe("my-client");
    expect(data.issuerUrl).toBe("https://idp.example.com");
    expect(data.clientSecretMasked).toBe("********");
  });
});

describe("/api/oidc POST", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
    const { POST } = await import("../../app/api/oidc/route");
    const res = await POST(makeRequest({ clientId: "x", clientSecret: "y", issuerUrl: "http://a.com" }));
    expect(res.status).toBe(429);
  });

  it("saves valid OIDC config", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(upsertOidcConfig).mockResolvedValue(undefined as any);

    const { POST } = await import("../../app/api/oidc/route");
    const body = {
      clientId: "my-client",
      clientSecret: "12345678",
      issuerUrl: "https://idp.example.com",
    };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    expect(upsertOidcConfig).toHaveBeenCalledWith(body);
  });

  it("preserves existing secret when placeholder sent", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(getOidcConfigFromDb).mockResolvedValue({
      clientId: "my-client",
      clientSecret: "real-secret-value",
      issuerUrl: "https://idp.example.com",
    } as any);
    vi.mocked(upsertOidcConfig).mockResolvedValue(undefined as any);

    const { POST } = await import("../../app/api/oidc/route");
    const res = await POST(makeRequest({
      clientId: "my-client",
      clientSecret: "********",
      issuerUrl: "https://idp.example.com",
    }));
    expect(res.status).toBe(200);
    expect(upsertOidcConfig).toHaveBeenCalledWith(
      expect.objectContaining({ clientSecret: "real-secret-value" })
    );
  });

  it("rejects invalid Zod payload", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    const { POST } = await import("../../app/api/oidc/route");
    // Zod.parse throws on invalid input
    await expect(
      POST(makeRequest({
        clientId: "ab",       // too short (min 3)
        clientSecret: "short", // too short (min 8)
        issuerUrl: "not-a-url",
      }))
    ).rejects.toThrow();
  });
});
