import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/pentest", () => ({ getPentestBackendUrl: vi.fn(), signPentestToken: vi.fn() }));
vi.mock("../../lib/rbac", () => ({ requirePentestAdmin: vi.fn() }));

import { getPentestBackendUrl, signPentestToken } from "../../lib/pentest";
import { requirePentestAdmin } from "../../lib/rbac";

beforeEach(() => {
  vi.clearAllMocks();
  // reset fetch
  vi.unstubAllGlobals?.();
});

describe("/api/tools/config handlers", () => {
  it("GET forwards request and returns payload", async () => {
    vi.mocked(requirePentestAdmin).mockResolvedValue({ user: { id: "u" } } as any);
    vi.mocked(signPentestToken).mockReturnValue("tok");
    vi.mocked(getPentestBackendUrl).mockReturnValue("http://backend");

    // stub fetch
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) } as any);

    const { GET } = await import("../../app/api/tools/config/route");
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalled();
  });

  it("GET handles fetch error and returns 500", async () => {
    vi.mocked(requirePentestAdmin).mockResolvedValue({ user: { id: "u" } } as any);
    vi.mocked(signPentestToken).mockReturnValue("tok");
    vi.mocked(getPentestBackendUrl).mockReturnValue("http://backend");

    global.fetch = vi.fn().mockRejectedValue(new Error("boom"));

    const { GET } = await import("../../app/api/tools/config/route");
    const res = await GET();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/boom/);
  });

  it("PUT forwards body and returns backend payload", async () => {
    vi.mocked(requirePentestAdmin).mockResolvedValue({ user: { id: "u" } } as any);
    vi.mocked(signPentestToken).mockReturnValue("tok");
    vi.mocked(getPentestBackendUrl).mockReturnValue("http://backend");

    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as any);

    const { PUT } = await import("../../app/api/tools/config/route");
    const req = new Request("http://localhost", { method: "PUT", body: JSON.stringify({ a: 1 }) });
    const res = await PUT(req as any);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalled();
  });
});
