import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockPrisma = {
  uploadHistory: { findMany: vi.fn(), findUnique: vi.fn() },
};

const mockRedis = {
  set: vi.fn(),
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/redis", () => ({ redis: mockRedis }));
vi.mock("../../lib/rbac", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("../../lib/queue", () => ({
  listDeadLetters: vi.fn(),
  getPayload: vi.fn(),
  getRetryCount: vi.fn(),
  getLockKey: vi.fn().mockReturnValue("lock:site-1"),
  removeDeadLetter: vi.fn(),
  removeDeadLetters: vi.fn(),
  resetRetry: vi.fn(),
  enqueueUpload: vi.fn(),
  deletePayload: vi.fn(),
}));

import { listDeadLetters, getPayload, getRetryCount, removeDeadLetter, resetRetry, enqueueUpload, deletePayload } from "../../lib/queue";

beforeEach(() => vi.clearAllMocks());

describe("/api/uploads/dead-letter GET", () => {
  it("returns enriched dead letter items", async () => {
    vi.mocked(listDeadLetters).mockResolvedValue(["u1", "u2"]);
    vi.mocked(getRetryCount).mockResolvedValue(3);
    mockPrisma.uploadHistory.findMany.mockResolvedValue([
      {
        id: "u1",
        status: "Failed",
        fileName: "scan.nessus",
        site: { name: "Production" },
        uploader: { name: "Admin" },
        uploadDate: new Date("2024-01-01"),
      },
    ]);

    const { GET } = await import("../../app/api/uploads/dead-letter/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toHaveLength(2);
    expect(data.items[0]).toMatchObject({
      id: "u1",
      retryCount: 3,
      status: "Failed",
      fileName: "scan.nessus",
      siteName: "Production",
    });
  });
});

describe("/api/uploads/dead-letter POST", () => {
  it("returns 400 when uploadId missing", async () => {
    const { POST } = await import("../../app/api/uploads/dead-letter/route");
    const req = new NextRequest("http://localhost/api/uploads/dead-letter", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 410 when payload expired", async () => {
    vi.mocked(getPayload).mockResolvedValue(null);

    const { POST } = await import("../../app/api/uploads/dead-letter/route");
    const req = new NextRequest("http://localhost/api/uploads/dead-letter", {
      method: "POST",
      body: JSON.stringify({ uploadId: "u1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(410);
  });

  it("returns 404 when upload not found", async () => {
    vi.mocked(getPayload).mockResolvedValue("payload-data");
    mockPrisma.uploadHistory.findUnique.mockResolvedValue(null);

    const { POST } = await import("../../app/api/uploads/dead-letter/route");
    const req = new NextRequest("http://localhost/api/uploads/dead-letter", {
      method: "POST",
      body: JSON.stringify({ uploadId: "u1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 409 when site is locked", async () => {
    vi.mocked(getPayload).mockResolvedValue("payload-data");
    mockPrisma.uploadHistory.findUnique.mockResolvedValue({ id: "u1", siteId: "site-1" });
    mockRedis.set.mockResolvedValue(null); // NX returns null when key exists

    const { POST } = await import("../../app/api/uploads/dead-letter/route");
    const req = new NextRequest("http://localhost/api/uploads/dead-letter", {
      method: "POST",
      body: JSON.stringify({ uploadId: "u1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("successfully retries a dead letter", async () => {
    vi.mocked(getPayload).mockResolvedValue("payload-data");
    mockPrisma.uploadHistory.findUnique.mockResolvedValue({ id: "u1", siteId: "site-1" });
    mockRedis.set.mockResolvedValue("OK");

    const { POST } = await import("../../app/api/uploads/dead-letter/route");
    const req = new NextRequest("http://localhost/api/uploads/dead-letter", {
      method: "POST",
      body: JSON.stringify({ uploadId: "u1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(removeDeadLetter).toHaveBeenCalledWith("u1");
    expect(resetRetry).toHaveBeenCalledWith("u1");
    expect(enqueueUpload).toHaveBeenCalledWith("u1", "payload-data");
  });
});

describe("/api/uploads/dead-letter PUT", () => {
  it("returns requeued 0 when no dead letters", async () => {
    vi.mocked(listDeadLetters).mockResolvedValue([]);
    const { PUT } = await import("../../app/api/uploads/dead-letter/route");
    const res = await PUT();
    const data = await res.json();
    expect(data.requeued).toBe(0);
    expect(data.skipped).toBe(0);
  });

  it("retries all eligible dead letters", async () => {
    vi.mocked(listDeadLetters).mockResolvedValue(["u1"]);
    mockPrisma.uploadHistory.findMany.mockResolvedValue([
      { id: "u1", siteId: "site-1" },
    ]);
    vi.mocked(getPayload).mockResolvedValue("payload");
    mockRedis.set.mockResolvedValue("OK");

    const { PUT } = await import("../../app/api/uploads/dead-letter/route");
    const res = await PUT();
    const data = await res.json();
    expect(data.requeued).toBe(1);
    expect(data.skipped).toBe(0);
  });

  it("skips dead letter when upload not found", async () => {
    vi.mocked(listDeadLetters).mockResolvedValue(["u1"]);
    mockPrisma.uploadHistory.findMany.mockResolvedValue([]); // no matching upload
    vi.mocked(getPayload).mockResolvedValue("payload");

    const { PUT } = await import("../../app/api/uploads/dead-letter/route");
    const res = await PUT();
    const data = await res.json();
    expect(data.requeued).toBe(0);
    expect(data.skipped).toBe(1);
  });

  it("skips dead letter when payload expired", async () => {
    vi.mocked(listDeadLetters).mockResolvedValue(["u1"]);
    mockPrisma.uploadHistory.findMany.mockResolvedValue([{ id: "u1", siteId: "site-1" }]);
    vi.mocked(getPayload).mockResolvedValue(null);

    const { PUT } = await import("../../app/api/uploads/dead-letter/route");
    const res = await PUT();
    const data = await res.json();
    expect(data.skipped).toBe(1);
  });

  it("skips dead letter when site is locked", async () => {
    vi.mocked(listDeadLetters).mockResolvedValue(["u1"]);
    mockPrisma.uploadHistory.findMany.mockResolvedValue([{ id: "u1", siteId: "site-1" }]);
    vi.mocked(getPayload).mockResolvedValue("payload");
    mockRedis.set.mockResolvedValue(null); // NX returns null when key exists

    const { PUT } = await import("../../app/api/uploads/dead-letter/route");
    const res = await PUT();
    const data = await res.json();
    expect(data.skipped).toBe(1);
  });
});

describe("/api/uploads/dead-letter DELETE", () => {
  it("purges old dead letters", async () => {
    vi.mocked(listDeadLetters).mockResolvedValue(["u1", "u2"]);
    mockPrisma.uploadHistory.findMany.mockResolvedValue([
      { id: "u1", uploadDate: new Date("2020-01-01") }, // old, should be purged
      { id: "u2", uploadDate: new Date() },             // recent, should survive
    ]);

    const { DELETE } = await import("../../app/api/uploads/dead-letter/route");
    const req = new NextRequest("http://localhost/api/uploads/dead-letter", {
      method: "DELETE",
      body: JSON.stringify({ days: 7 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await DELETE(req);
    const data = await res.json();
    expect(data.purged).toBe(1);
    expect(deletePayload).toHaveBeenCalledWith("u1");
  });

  it("returns 0 purged when no dead letters", async () => {
    vi.mocked(listDeadLetters).mockResolvedValue([]);
    const { DELETE } = await import("../../app/api/uploads/dead-letter/route");
    const req = new NextRequest("http://localhost/api/uploads/dead-letter", {
      method: "DELETE",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await DELETE(req);
    const data = await res.json();
    expect(data.purged).toBe(0);
  });

  it("purges dead letters whose upload is not found in DB", async () => {
    vi.mocked(listDeadLetters).mockResolvedValue(["u-missing"]);
    mockPrisma.uploadHistory.findMany.mockResolvedValue([]); // no matching upload

    const { DELETE } = await import("../../app/api/uploads/dead-letter/route");
    const req = new NextRequest("http://localhost/api/uploads/dead-letter", {
      method: "DELETE",
      body: JSON.stringify({ days: 7 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await DELETE(req);
    const data = await res.json();
    expect(data.purged).toBe(1);
    expect(deletePayload).toHaveBeenCalledWith("u-missing");
  });
});
