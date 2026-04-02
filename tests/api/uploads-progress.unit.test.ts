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

import { requireUser } from "../../lib/rbac";
import { canAccessUpload } from "../../lib/upload-access";
import { redis } from "../../lib/redis";

describe("/api/uploads/progress GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({ user: { id: "u-1", roles: ["web_app_user"] } } as any);
  });

  it("returns 404 when authenticated user cannot access upload", async () => {
    vi.mocked(canAccessUpload).mockResolvedValue(false);

    const { GET } = await import("../../app/api/uploads/progress/route");
    const res = await GET(new Request("http://localhost/api/uploads/progress?uploadId=up-1") as any);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ progress: null });
    expect(canAccessUpload).toHaveBeenCalledWith(expect.anything(), "up-1");
    expect(redis.get).not.toHaveBeenCalled();
  });

  it("returns 400 when uploadId is missing", async () => {
    const { GET } = await import("../../app/api/uploads/progress/route");
    const res = await GET(new Request("http://localhost/api/uploads/progress") as any);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ progress: null });
    expect(canAccessUpload).not.toHaveBeenCalled();
  });

  it("returns progress when access is allowed", async () => {
    vi.mocked(canAccessUpload).mockResolvedValue(true);
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ step: "Queued", progress: 5 }) as any);

    const { GET } = await import("../../app/api/uploads/progress/route");
    const res = await GET(new Request("http://localhost/api/uploads/progress?uploadId=up-1") as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ progress: { step: "Queued", progress: 5 } });
  });

  it("returns null progress when redis returns null payload", async () => {
    vi.mocked(canAccessUpload).mockResolvedValue(true);
    vi.mocked(redis.get).mockResolvedValue(null as any);

    const { GET } = await import("../../app/api/uploads/progress/route");
    const res = await GET(new Request("http://localhost/api/uploads/progress?uploadId=up-1") as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ progress: null });
  });

  it("returns null progress when payload is malformed JSON", async () => {
    vi.mocked(canAccessUpload).mockResolvedValue(true);
    vi.mocked(redis.get).mockResolvedValue("not-valid-json{{{" as any);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { GET } = await import("../../app/api/uploads/progress/route");
    const res = await GET(new Request("http://localhost/api/uploads/progress?uploadId=up-1") as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ progress: null });
    expect(consoleSpy).toHaveBeenCalledWith("Failed to parse progress payload", expect.any(Error));
    consoleSpy.mockRestore();
  });
});
