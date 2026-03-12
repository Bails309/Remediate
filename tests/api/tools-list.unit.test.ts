import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/pentest", () => ({ getPentestBackendUrl: vi.fn(), signPentestToken: vi.fn() }));
vi.mock("../../lib/rbac", () => ({ requireToolkitUser: vi.fn() }));

import { getPentestBackendUrl, signPentestToken } from "../../lib/pentest";
import { requireToolkitUser } from "../../lib/rbac";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals?.();
});

describe("/api/tools/list GET", () => {
  it("returns list on success", async () => {
    vi.mocked(requireToolkitUser).mockResolvedValue({ user: { id: "u" } } as any);
    vi.mocked(signPentestToken).mockReturnValue("tok");
    vi.mocked(getPentestBackendUrl).mockReturnValue("http://backend");

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ([{ id: 't1' }]) } as any) as unknown as typeof fetch);

    const { GET } = await import("../../app/api/tools/list/route");
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("returns backend error when res not ok with JSON body", async () => {
    vi.mocked(requireToolkitUser).mockResolvedValue({ user: { id: "u" } } as any);
    vi.mocked(signPentestToken).mockReturnValue("tok");
    vi.mocked(getPentestBackendUrl).mockReturnValue("http://backend");

    const err = JSON.stringify({ error: "Bad" });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => err } as any) as unknown as typeof fetch);

    const { GET } = await import("../../app/api/tools/list/route");
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Backend Error/);
  });

  it("returns 502 on connectivity errors", async () => {
    vi.mocked(requireToolkitUser).mockRejectedValue(new Error("Network"));
    const { GET } = await import("../../app/api/tools/list/route");
    const res = await GET();
    expect(res.status).toBe(502);
  });
});
