import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";

// Mocks used by multiple scenarios
const mockCreateIfNotExists = vi.fn();
const mockUpload = vi.fn();
const mockDownload = vi.fn(async () => ({ readableStreamBody: Readable.from([Buffer.from("ok")]) }));
const mockDelete = vi.fn();
const mockGetBlockBlobClient = vi.fn(() => ({ upload: mockUpload, download: mockDownload, delete: mockDelete }));
const mockGetContainerClient = vi.fn(() => ({ createIfNotExists: mockCreateIfNotExists, getBlockBlobClient: mockGetBlockBlobClient }));

vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn((enc: string) => {
    if (enc === "enc:acctkey") return "supersecretkey";
    if (enc === "enc:sastoken") return "?sv=sastoken";
    return "DefaultEndpointsProtocol=https;AccountName=acct;";
  }),
  fingerprintSecret: vi.fn(() => "fp"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    storageConfig: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@azure/storage-blob", () => {
  const BlobServiceClient = function (this: any, urlOrConn: string, cred?: unknown) {
    return { getContainerClient: mockGetContainerClient };
  } as unknown as { fromConnectionString: Function } & Function;
  (BlobServiceClient as any).fromConnectionString = vi.fn(() => ({ getContainerClient: mockGetContainerClient }));

  // Provide a real constructor for StorageSharedKeyCredential so `new` works
  function StorageSharedKeyCredential(accountName: string, accountKey: string) {
    this.accountName = accountName;
    this.accountKey = accountKey;
  }

  return {
    BlobServiceClient,
    StorageSharedKeyCredential,
  };
});

describe("Azure storage branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "production";
  });

  it("ACCOUNT_KEY path uses StorageSharedKeyCredential and returns provider", async () => {
    const { prisma } = await import("@/lib/prisma");
    (prisma.storageConfig.findUnique as any).mockResolvedValue({
      id: "singleton",
      provider: "AZURE",
      azureAuthMethod: "ACCOUNT_KEY",
      azureAccountName: "acct",
      azureAccountKeyEnc: "enc:acctkey",
      azureContainerName: "uploads",
    });

    const { getStorageProvider } = await import("@/lib/storage");
    const provider = await getStorageProvider();

    await provider.save("k", "v");
    expect(mockCreateIfNotExists).toHaveBeenCalled();
    expect(mockUpload).toHaveBeenCalled();

    const txt = await provider.read("k");
    expect(txt).toBe("ok");
  });

  it("SAS_TOKEN path constructs URL and returns provider", async () => {
    const { prisma } = await import("@/lib/prisma");
    (prisma.storageConfig.findUnique as any).mockResolvedValue({
      id: "singleton",
      provider: "AZURE",
      azureAuthMethod: "SAS_TOKEN",
      azureAccountName: "acct",
      azureSasTokenEnc: "enc:sastoken",
      azureContainerName: "uploads",
    });

    const { getStorageProvider } = await import("@/lib/storage");
    const provider = await getStorageProvider();
    const txt = await provider.read("k");
    expect(txt).toBe("ok");
  });

  it("falls back to Redis when Azure initialization throws with WWW-Authenticate header", async () => {
    const { prisma } = await import("@/lib/prisma");
    (prisma.storageConfig.findUnique as any).mockResolvedValue({
      id: "singleton",
      provider: "AZURE",
      azureAuthMethod: "CONNECTION_STRING",
      azureConnectionStringEnc: "enc:conn",
      azureContainerName: "uploads",
    });

    // make BlobServiceClient.fromConnectionString throw an object with response.headers
    const azure = await import("@azure/storage-blob");
    (azure.BlobServiceClient.fromConnectionString as any).mockImplementationOnce(() => { throw { response: { headers: { 'WWW-Authenticate': 'Bearer realm="example"' } } }; });

    const { getStorageProvider } = await import("@/lib/storage");
    const provider = await getStorageProvider();
    // Redis provider supports save/read/delete; calling save should not throw
    await expect(provider.save("x", "y")).resolves.not.toThrow();
  });
});
