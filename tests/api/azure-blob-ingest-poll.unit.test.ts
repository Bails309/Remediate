import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rbac", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/azure-blob-ingest", () => ({
  AzureBlobIngestService: {
    pollAndIngest: vi.fn(),
  },
}));

import { POST } from "@/app/api/admin/azure-blob-ingest/poll/route";
import { requireAdmin } from "@/lib/rbac";
import { AzureBlobIngestService } from "@/lib/azure-blob-ingest";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "u1" } } as any);
});

describe("POST /api/admin/azure-blob-ingest/poll", () => {
  it("returns 200 success:true when poll succeeds", async () => {
    (AzureBlobIngestService.pollAndIngest as any).mockResolvedValue(undefined);
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(AzureBlobIngestService.pollAndIngest).toHaveBeenCalled();
  });

  it("returns 500 with error message on failure", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    (AzureBlobIngestService.pollAndIngest as any).mockRejectedValue(new Error("network"));
    const res = await POST();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("network");
    err.mockRestore();
  });
});
