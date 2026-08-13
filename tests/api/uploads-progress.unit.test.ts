import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/rbac", () => ({
  requireUser: vi.fn(),
}));

vi.mock("../../lib/upload-access", () => ({
  canAccessUpload: vi.fn(),
}));

vi.mock("../../lib/redis", () => ({
  redis: {
    get: vi.fn(),
  },
}));

const mockPrisma = {
  uploadHistory: { findUnique: vi.fn() },
};
vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));

import { requireUser } from "../../lib/rbac";
import { canAccessUpload } from "../../lib/upload-access";
import { redis } from "../../lib/redis";

// UploadHistory.id is @db.Uuid, so the tests must use a real UUID — a
// placeholder like "up-1" is now rejected before any lookup happens.
const ID = "11111111-2222-4333-8444-555555555555";
const url = (id?: string) =>
  `http://localhost/api/uploads/progress${id === undefined ? "" : `?uploadId=${id}`}`;

describe("/api/uploads/progress GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({ user: { id: "u-1", roles: ["web_app_user"] } } as any);
    mockPrisma.uploadHistory.findUnique.mockResolvedValue(null);
  });

  it("returns 404 when authenticated user cannot access upload", async () => {
    vi.mocked(canAccessUpload).mockResolvedValue(false);

    const { GET } = await import("../../app/api/uploads/progress/route");
    const res = await GET(new Request(url(ID)) as any);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ progress: null });
    expect(canAccessUpload).toHaveBeenCalledWith(expect.anything(), ID);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it("returns 400 when uploadId is missing", async () => {
    const { GET } = await import("../../app/api/uploads/progress/route");
    const res = await GET(new Request(url()) as any);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ progress: null });
    expect(canAccessUpload).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", "up-1", "%s%s", "a\nFAKE LOG LINE", "' OR 1=1--"])(
    "rejects a malformed uploadId (%j) before any lookup",
    async (bad) => {
      const { GET } = await import("../../app/api/uploads/progress/route");
      const res = await GET(new Request(url(encodeURIComponent(bad))) as any);

      // Rejecting at the boundary matters twice over: canAccessUpload passes
      // the value to a @db.Uuid lookup (which throws, not returns null, so a
      // non-admin previously got a 500), and admins skip that lookup entirely,
      // which let an arbitrary string reach the log line below.
      expect(res.status).toBe(400);
      expect(canAccessUpload).not.toHaveBeenCalled();
      expect(redis.get).not.toHaveBeenCalled();
    }
  );

  it("returns progress when access is allowed", async () => {
    vi.mocked(canAccessUpload).mockResolvedValue(true);
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ step: "Queued", progress: 5 }) as any);

    const { GET } = await import("../../app/api/uploads/progress/route");
    const res = await GET(new Request(url(ID)) as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ progress: { step: "Queued", progress: 5 } });
    expect(mockPrisma.uploadHistory.findUnique).not.toHaveBeenCalled();
  });

  it("returns null progress when redis returns null payload and no DB record", async () => {
    vi.mocked(canAccessUpload).mockResolvedValue(true);
    vi.mocked(redis.get).mockResolvedValue(null as any);

    const { GET } = await import("../../app/api/uploads/progress/route");
    const res = await GET(new Request(url(ID)) as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ progress: null });
  });

  it("returns null progress when payload is malformed JSON", async () => {
    vi.mocked(canAccessUpload).mockResolvedValue(true);
    vi.mocked(redis.get).mockResolvedValue("not-valid-json{{{" as any);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { GET } = await import("../../app/api/uploads/progress/route");
    const res = await GET(new Request(url(ID)) as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ progress: null });
    expect(consoleSpy).toHaveBeenCalledWith("Failed to parse progress payload", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("falls back to DB Completed status when the redis key is gone", async () => {
    vi.mocked(canAccessUpload).mockResolvedValue(true);
    vi.mocked(redis.get).mockResolvedValue(null as any);
    mockPrisma.uploadHistory.findUnique.mockResolvedValue({ status: "Completed", rowCount: 42 });

    const { GET } = await import("../../app/api/uploads/progress/route");
    const res = await GET(new Request(url(ID)) as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ progress: { step: "Completed", progress: 100, total: 42 } });
  });

  it("falls back to DB Failed status when the redis key is gone", async () => {
    vi.mocked(canAccessUpload).mockResolvedValue(true);
    vi.mocked(redis.get).mockResolvedValue(null as any);
    mockPrisma.uploadHistory.findUnique.mockResolvedValue({ status: "Failed", rowCount: null });

    const { GET } = await import("../../app/api/uploads/progress/route");
    const res = await GET(new Request(url(ID)) as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ progress: { step: "Failed", progress: 100 } });
  });

  it("falls back to the DB when the redis read fails/stalls", async () => {
    vi.mocked(canAccessUpload).mockResolvedValue(true);
    vi.mocked(redis.get).mockRejectedValue(new Error("Redis down") as any);
    mockPrisma.uploadHistory.findUnique.mockResolvedValue({ status: "Completed", rowCount: 7 });
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { GET } = await import("../../app/api/uploads/progress/route");
    const res = await GET(new Request(url(ID)) as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ progress: { step: "Completed", progress: 100, total: 7 } });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
