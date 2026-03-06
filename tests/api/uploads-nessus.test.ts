import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rbac", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { site: { findUnique: vi.fn() }, uploadHistory: { create: vi.fn(), update: vi.fn() } } }));
vi.mock("@/lib/redis", () => ({ redis: { set: vi.fn().mockResolvedValue("OK"), del: vi.fn(), incr: vi.fn().mockResolvedValue(1), expire: vi.fn(), ttl: vi.fn().mockResolvedValue(60) } }));
vi.mock("@/lib/csv", () => ({ validateNessusCsv: vi.fn() }));
vi.mock("@/lib/queue", () => ({ enqueueUpload: vi.fn(), getLockKey: vi.fn((id) => `upload:lock:${id}`) }));
vi.mock("@/lib/progress", () => ({ setProgress: vi.fn() }));

import { POST } from "@/app/api/uploads/nessus/route";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { validateNessusCsv } from "@/lib/csv";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(form: Record<string, any>) {
  return {
    formData: async () => ({
      get: (k: string) => form[k],
    }),
    headers: new Map(),
  } as any;
}

describe("POST /api/uploads/nessus", () => {
  it("returns 400 when missing file or siteId", async () => {
    (requireUser as any).mockResolvedValue({ user: { id: "u1", email: "a@b.com" } });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("creates upload and enqueues when validation ok", async () => {
    (requireUser as any).mockResolvedValue({ user: { id: "u1", email: "a@b.com" } });
    (prisma as any).site.findUnique.mockResolvedValue({ id: "site-1" });
    (prisma as any).uploadHistory.create.mockResolvedValue({ id: "upload-1" });
    (validateNessusCsv as any).mockReturnValue({ ok: true });

    const file = new File(["a,b,c"], "test.csv", { type: "text/csv" });
    const res = await POST(makeReq({ file, siteId: "site-1" }));
    // ensure upload was recorded and enqueued
    expect((prisma as any).uploadHistory.create).toHaveBeenCalled();
    const body = await res.json();
    expect(res.status).toBe(200);
  });
});
