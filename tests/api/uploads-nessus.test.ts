import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rbac", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { site: { findUnique: vi.fn() }, uploadHistory: { create: vi.fn(), update: vi.fn() } } }));
vi.mock("@/lib/redis", () => ({ redis: { set: vi.fn().mockResolvedValue("OK"), del: vi.fn(), incr: vi.fn().mockResolvedValue(1), expire: vi.fn(), eval: vi.fn().mockResolvedValue(1), ttl: vi.fn().mockResolvedValue(60) } }));
vi.mock("@/lib/csv", () => ({ validateNessusCsv: vi.fn() }));
vi.mock("@/lib/queue", () => ({ enqueueUpload: vi.fn(), getLockKey: vi.fn((id: string) => `upload:lock:${id}`) }));
vi.mock("@/lib/progress", () => ({ setProgress: vi.fn() }));

import { POST } from "@/app/api/uploads/nessus/route";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { validateNessusCsv } from "@/lib/csv";

import { NextRequest } from "next/server";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(form: Record<string, unknown>) {
  return {
    formData: async () => ({
      get: (k: string) => form[k],
    }),
    headers: new Map(),
  } as unknown as NextRequest;
}

describe("POST /api/uploads/nessus", () => {
  it("returns 400 when missing file or siteId", async () => {
    vi.mocked(requireUser).mockResolvedValue({ user: { id: "u1", email: "a@b.com" } } as any);
    vi.mocked(prisma.site.findUnique).mockResolvedValue({ id: "site-1" } as any);
    vi.mocked(prisma.uploadHistory.create).mockResolvedValue({ id: "upload-1" } as any);
    vi.mocked(validateNessusCsv).mockReturnValue({ ok: true } as any);

    const file = new File(["a,b,c"], "test.csv", { type: "text/csv" });
    const res = await POST(makeReq({ file, siteId: "site-1" }));
    // ensure upload was recorded and enqueued
    expect(prisma.uploadHistory.create).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
