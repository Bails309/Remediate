import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/pentest", () => ({ getPentestBackendUrl: vi.fn(), signPentestToken: vi.fn() }));
vi.mock("../../lib/rbac", () => ({ requireToolkitUser: vi.fn() }));

import { getPentestBackendUrl, signPentestToken } from "../../lib/pentest";
import { requireToolkitUser } from "../../lib/rbac";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals?.();
});

describe("/api/tools/execute POST", () => {
  it("returns backend payload on success", async () => {
    vi.mocked(requireToolkitUser).mockResolvedValue({ user: { id: "u" } } as any);
    vi.mocked(signPentestToken).mockReturnValue("tok");
    vi.mocked(getPentestBackendUrl).mockReturnValue("http://backend");

    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ job: "ok" }) } as any);

    const { POST } = await import("../../app/api/tools/execute/route");
    const req = new Request("http://localhost", { method: "POST", body: JSON.stringify({ tool: "t" }) });
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ job: "ok" });
  });

  it("returns backend error when non-ok response with JSON error", async () => {
    vi.mocked(requireToolkitUser).mockResolvedValue({ user: { id: "u" } } as any);
    vi.mocked(signPentestToken).mockReturnValue("tok");
    vi.mocked(getPentestBackendUrl).mockReturnValue("http://backend");

    const errBody = JSON.stringify({ error: "Not Found" });
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => errBody } as any);

    const { POST } = await import("../../app/api/tools/execute/route");
    const req = new Request("http://localhost", { method: "POST", body: JSON.stringify({}) });
    const res = await POST(req as any);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Backend Error/);
  });

  it("returns 401 when requireToolkitUser throws Unauthorized", async () => {
    vi.mocked(requireToolkitUser).mockRejectedValue(new Error("Unauthorized"));

    const { POST } = await import("../../app/api/tools/execute/route");
    const req = new Request("http://localhost", { method: "POST", body: JSON.stringify({}) });
    const res = await POST(req as any);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 502 on connectivity errors", async () => {
    vi.mocked(requireToolkitUser).mockResolvedValue({ user: { id: "u" } } as any);
    vi.mocked(signPentestToken).mockReturnValue("tok");
    vi.mocked(getPentestBackendUrl).mockReturnValue("http://backend");

    global.fetch = vi.fn().mockRejectedValue(new Error("network fail"));

    const { POST } = await import("../../app/api/tools/execute/route");
    const req = new Request("http://localhost", { method: "POST", body: JSON.stringify({}) });
    const res = await POST(req as any);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Connectivity Error/);
  });
});
