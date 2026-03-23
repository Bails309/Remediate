import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  azureFileShareConfig: { findUnique: vi.fn(), upsert: vi.fn() },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/rbac", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("../../lib/crypto", () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
}));

beforeEach(() => vi.clearAllMocks());

describe("/api/admin/azure-file-share GET", () => {
  it("returns defaults when no config exists", async () => {
    mockPrisma.azureFileShareConfig.findUnique.mockResolvedValue(null);

    const { GET } = await import("../../app/api/admin/azure-file-share/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.enabled).toBe(false);
    expect(data.shareName).toBe("security-scans");
    expect(data.directoryPath).toBe("/");
  });

  it("returns masked config when exists", async () => {
    mockPrisma.azureFileShareConfig.findUnique.mockResolvedValue({
      id: "singleton",
      enabled: true,
      accountName: "myaccount",
      shareName: "scans",
      directoryPath: "/uploads",
      pollIntervalMinutes: 30,
      deleteAfterImport: false,
      connectionStringEnc: "enc:real-conn-string",
      accountKeyEnc: "enc:real-key",
      sasTokenEnc: null,
    });

    const { GET } = await import("../../app/api/admin/azure-file-share/route");
    const res = await GET();
    const data = await res.json();
    expect(data.connectionStringEnc).toBe("****");
    expect(data.accountKeyEnc).toBe("****");
    expect(data.sasTokenEnc).toBeNull();
    expect(data.enabled).toBe(true);
    expect(data.shareName).toBe("scans");
  });
});

describe("/api/admin/azure-file-share POST", () => {
  it("creates config with encrypted secrets", async () => {
    mockPrisma.azureFileShareConfig.upsert.mockResolvedValue({ id: "singleton" });

    const { POST } = await import("../../app/api/admin/azure-file-share/route");
    const req = new Request("http://localhost/api/admin/azure-file-share", {
      method: "POST",
      body: JSON.stringify({
        enabled: true,
        accountName: "myaccount",
        shareName: "scans",
        directoryPath: "/",
        pollIntervalMinutes: 60,
        deleteAfterImport: true,
        connectionString: "DefaultEndpointsProtocol=https;...",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockPrisma.azureFileShareConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          connectionStringEnc: "enc:DefaultEndpointsProtocol=https;...",
        }),
      })
    );
  });

  it("does not update secrets when placeholder sent", async () => {
    mockPrisma.azureFileShareConfig.upsert.mockResolvedValue({ id: "singleton" });

    const { POST } = await import("../../app/api/admin/azure-file-share/route");
    const req = new Request("http://localhost/api/admin/azure-file-share", {
      method: "POST",
      body: JSON.stringify({
        enabled: true,
        accountName: "myaccount",
        shareName: "scans",
        directoryPath: "/",
        pollIntervalMinutes: 30,
        deleteAfterImport: false,
        connectionString: "****",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockPrisma.azureFileShareConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({
          connectionStringEnc: expect.anything(),
        }),
      })
    );
  });
});
