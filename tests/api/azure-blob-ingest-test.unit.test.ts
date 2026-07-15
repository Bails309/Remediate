import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rbac", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/azure-blob-ingest", () => ({
  AzureBlobIngestService: {
    validateConfig: vi.fn(),
  },
}));

import { POST } from "@/app/api/admin/azure-blob-ingest/test/route";
import { requireAdmin } from "@/lib/rbac";
import { AzureBlobIngestService } from "@/lib/azure-blob-ingest";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "u1" } } as any);
});

function makeReq(body: unknown) {
  return { json: async () => body } as unknown as Request;
}

describe("POST /api/admin/azure-blob-ingest/test", () => {
  it("returns 200 success:true when validation succeeds", async () => {
    (AzureBlobIngestService.validateConfig as any).mockResolvedValue({ success: true });
    const res = await POST(makeReq({ authMethod: "CONNECTION_STRING" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 400 when validation fails", async () => {
    (AzureBlobIngestService.validateConfig as any).mockResolvedValue({
      success: false,
      error: "Container missing",
    });
    const res = await POST(makeReq({ authMethod: "CONNECTION_STRING" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Container missing");
  });

  it("returns 500 on unexpected error", async () => {
    (AzureBlobIngestService.validateConfig as any).mockRejectedValue(new Error("boom"));
    const res = await POST(makeReq({}));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("boom");
  });
});
