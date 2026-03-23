import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/oidc", () => ({
  getOidcConfigFromDb: vi.fn(),
}));

import { getOidcConfigFromDb } from "../../lib/oidc";

beforeEach(() => vi.clearAllMocks());

describe("/api/oidc/enabled GET", () => {
  it("returns ssoEnabled true when OIDC config exists", async () => {
    process.env.LOCAL_AUTH_ENABLED = "true";
    vi.mocked(getOidcConfigFromDb).mockResolvedValue({
      clientId: "abc",
      clientSecret: "secret123",
      issuerUrl: "https://example.com",
    } as any);

    const { GET } = await import("../../app/api/oidc/enabled/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ssoEnabled).toBe(true);
    expect(data.localEnabled).toBe(true);
  });

  it("returns ssoEnabled false when no OIDC config", async () => {
    process.env.LOCAL_AUTH_ENABLED = "false";
    vi.mocked(getOidcConfigFromDb).mockResolvedValue(null as any);

    const { GET } = await import("../../app/api/oidc/enabled/route");
    const res = await GET();
    const data = await res.json();
    expect(data.ssoEnabled).toBe(false);
    expect(data.localEnabled).toBe(false);
  });

  it("returns ssoEnabled false on error", async () => {
    process.env.LOCAL_AUTH_ENABLED = "true";
    vi.mocked(getOidcConfigFromDb).mockRejectedValue(new Error("DB down"));

    const { GET } = await import("../../app/api/oidc/enabled/route");
    const res = await GET();
    const data = await res.json();
    expect(data.ssoEnabled).toBe(false);
    expect(data.localEnabled).toBe(true);
  });
});
