import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rbac", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ encrypt: vi.fn((s: string) => `enc:${s}`) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    azureBlobIngestConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { GET, POST } from "@/app/api/admin/azure-blob-ingest/route";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { requireAdmin } from "@/lib/rbac";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "u1" } } as any);
});

describe("GET /api/admin/azure-blob-ingest", () => {
  it("returns defaults when no config exists", async () => {
    (prisma.azureBlobIngestConfig.findUnique as any).mockResolvedValue(null);
    const res = await GET();
    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(body.containerName).toBe("acr-vulnerabilities");
    expect(body.authMethod).toBe("CONNECTION_STRING");
    expect(body.connectionStringEnc).toBeNull();
  });

  it("redacts secrets to '****' when config exists", async () => {
    (prisma.azureBlobIngestConfig.findUnique as any).mockResolvedValue({
      id: "singleton",
      enabled: true,
      authMethod: "CONNECTION_STRING",
      accountName: "acct",
      containerName: "acr",
      prefix: "",
      defaultSiteId: "s1",
      pollIntervalMinutes: 30,
      deleteAfterImport: true,
      connectionStringEnc: "some-encrypted-cs",
      accountKeyEnc: "some-key",
      sasTokenEnc: null,
    });
    const res = await GET();
    const body = await res.json();
    expect(body.connectionStringEnc).toBe("****");
    expect(body.accountKeyEnc).toBe("****");
    expect(body.sasTokenEnc).toBeNull();
    expect(body.enabled).toBe(true);
  });
});

function makeReq(body: unknown) {
  return { json: async () => body } as unknown as Request;
}

describe("POST /api/admin/azure-blob-ingest", () => {
  it("encrypts a newly submitted connection string and returns '****'", async () => {
    (prisma.azureBlobIngestConfig.upsert as any).mockImplementation(async ({ update }: any) => ({
      id: "singleton",
      ...update,
    }));

    const res = await POST(
      makeReq({
        enabled: true,
        authMethod: "CONNECTION_STRING",
        connectionString: "DefaultEndpointsProtocol=https;AccountName=a;",
        containerName: "acr",
        pollIntervalMinutes: "15",
      }),
    );
    const body = await res.json();

    expect(encrypt).toHaveBeenCalledWith("DefaultEndpointsProtocol=https;AccountName=a;");
    expect(body.connectionStringEnc).toBe("****");
  });

  it("keeps existing encrypted value when client sends the '****' sentinel", async () => {
    (prisma.azureBlobIngestConfig.upsert as any).mockImplementation(async () => ({
      id: "singleton",
      connectionStringEnc: "existing-encrypted",
      accountKeyEnc: null,
      sasTokenEnc: null,
    }));

    await POST(
      makeReq({
        enabled: true,
        authMethod: "CONNECTION_STRING",
        connectionString: "****",
        containerName: "acr",
      }),
    );

    // encrypt() must NOT be called with the sentinel
    expect(encrypt).not.toHaveBeenCalled();
  });

  it("normalizes invalid auth method to CONNECTION_STRING", async () => {
    (prisma.azureBlobIngestConfig.upsert as any).mockResolvedValue({
      id: "singleton",
      connectionStringEnc: null,
      accountKeyEnc: null,
      sasTokenEnc: null,
    });

    await POST(makeReq({ enabled: false, authMethod: "BOGUS", containerName: "acr" }));

    const call = (prisma.azureBlobIngestConfig.upsert as any).mock.calls[0][0];
    expect(call.update.authMethod).toBe("CONNECTION_STRING");
  });

  it("parses pollIntervalMinutes as int and defaults to 60 when invalid", async () => {
    (prisma.azureBlobIngestConfig.upsert as any).mockResolvedValue({
      id: "singleton",
      connectionStringEnc: null,
      accountKeyEnc: null,
      sasTokenEnc: null,
    });

    await POST(
      makeReq({
        enabled: true,
        authMethod: "CONNECTION_STRING",
        containerName: "acr",
        pollIntervalMinutes: "not-a-number",
      }),
    );

    const call = (prisma.azureBlobIngestConfig.upsert as any).mock.calls[0][0];
    expect(call.update.pollIntervalMinutes).toBe(60);
  });
});
