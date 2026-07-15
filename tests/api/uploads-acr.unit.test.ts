import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rbac", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    site: { findUnique: vi.fn() },
    uploadHistory: { create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn(),
    del: vi.fn().mockResolvedValue(1),
  },
}));
vi.mock("@/lib/csv", () => ({ validateAcrCsv: vi.fn() }));
vi.mock("@/lib/queue", () => ({
  enqueueUpload: vi.fn().mockResolvedValue(undefined),
  getLockKey: vi.fn((siteId: string) => `upload:lock:${siteId}`),
}));
vi.mock("@/lib/progress", () => ({ setProgress: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  getStorageProvider: vi.fn().mockResolvedValue({
    save: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { POST } from "@/app/api/uploads/acr/route";
import { requireAdmin } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { validateAcrCsv } from "@/lib/csv";
import { enqueueUpload } from "@/lib/queue";

import type { NextRequest } from "next/server";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" } } as any);
});

function makeReq(form: Record<string, unknown>) {
  return {
    formData: async () => ({ get: (k: string) => form[k] }),
    headers: new Map(),
  } as unknown as NextRequest;
}

describe("POST /api/uploads/acr", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
    const res = await POST(makeReq({}));
    expect(res.status).toBe(429);
  });

  it("returns 400 when file or siteId missing", async () => {
    const res = await POST(makeReq({ siteId: "site-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 413 when file exceeds 50MB limit", async () => {
    const bigContent = new Uint8Array(51 * 1024 * 1024);
    const file = new File([bigContent], "big.csv", { type: "text/csv" });
    const res = await POST(makeReq({ file, siteId: "site-1" }));
    expect(res.status).toBe(413);
  });

  it("returns 404 when site not found", async () => {
    (prisma.site.findUnique as any).mockResolvedValue(null);
    const file = new File(["a,b,c"], "acr.csv", { type: "text/csv" });
    const res = await POST(makeReq({ file, siteId: "missing" }));
    expect(res.status).toBe(404);
  });

  it("returns 409 when another upload is already in progress for the site", async () => {
    (prisma.site.findUnique as any).mockResolvedValue({ id: "site-1" });
    (redis.set as any).mockResolvedValue(null); // NX failed -> lock held
    const file = new File(["a,b,c"], "acr.csv", { type: "text/csv" });
    const res = await POST(makeReq({ file, siteId: "site-1" }));
    expect(res.status).toBe(409);
  });

  it("returns 400 and releases lock when CSV headers are invalid", async () => {
    (prisma.site.findUnique as any).mockResolvedValue({ id: "site-1" });
    (redis.set as any).mockResolvedValue("OK");
    (prisma.uploadHistory.create as any).mockResolvedValue({ id: "upload-x" });
    vi.mocked(validateAcrCsv).mockReturnValue({ ok: false, missing: ["plugin_id"] } as any);

    const file = new File(["bad"], "acr.csv", { type: "text/csv" });
    const res = await POST(makeReq({ file, siteId: "site-1" }));

    expect(res.status).toBe(400);
    expect(prisma.uploadHistory.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "upload-x" }, data: { status: "Failed" } }),
    );
    expect(redis.del).toHaveBeenCalled();
    expect(enqueueUpload).not.toHaveBeenCalled();
  });

  it("enqueues the upload and returns the uploadId on success", async () => {
    (prisma.site.findUnique as any).mockResolvedValue({ id: "site-1" });
    (redis.set as any).mockResolvedValue("OK");
    (prisma.uploadHistory.create as any).mockResolvedValue({ id: "upload-ok" });
    vi.mocked(validateAcrCsv).mockReturnValue({ ok: true } as any);

    const file = new File(["plugin_id,host,port,severity\n1,h,80,High"], "acr.csv", { type: "text/csv" });
    const res = await POST(makeReq({ file, siteId: "site-1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.uploadId).toBe("upload-ok");
    expect(prisma.uploadHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          siteId: "site-1",
          scannerType: "ACR",
          fileName: "acr.csv",
        }),
      }),
    );
    expect(enqueueUpload).toHaveBeenCalled();
  });
});
