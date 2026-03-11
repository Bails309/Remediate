import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/pentest", () => ({ getPentestBackendUrl: vi.fn(), signPentestToken: vi.fn() }));
vi.mock("../../lib/rbac", () => ({ requirePentestUser: vi.fn() }));

import { getPentestBackendUrl, signPentestToken } from "../../lib/pentest";
import { requirePentestUser } from "../../lib/rbac";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals?.();
});

describe("/api/tools/list GET", () => {
  it("returns list on success", async () => {
    vi.mocked(requirePentestUser).mockResolvedValue({ user: { id: "u" } } as any);
    vi.mocked(signPentestToken).mockReturnValue("tok");
    vi.mocked(getPentestBackendUrl).mockReturnValue("http://backend");

    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ([{ id: 't1' }]) } as any);

    const { GET } = await import("../../app/api/tools/list/route");
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("returns backend error when res not ok with JSON body", async () => {
    vi.mocked(requirePentestUser).mockResolvedValue({ user: { id: "u" } } as any);
    vi.mocked(signPentestToken).mockReturnValue("tok");
    vi.mocked(getPentestBackendUrl).mockReturnValue("http://backend");

    const err = JSON.stringify({ error: "Bad" });
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => err } as any);

    const { GET } = await import("../../app/api/tools/list/route");
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Backend Error/);
  });

  it("returns 502 on connectivity errors", async () => {
    vi.mocked(requirePentestUser).mockRejectedValue(new Error("Network"));
    const { GET } = await import("../../app/api/tools/list/route");
    const res = await GET();
    expect(res.status).toBe(502);
  });
});
