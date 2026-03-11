import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";

// Mocks for Azure path
const mockCreateIfNotExists = vi.fn();
const mockUpload = vi.fn();
const mockDelete = vi.fn();
const mockGetBlockBlobClient = vi.fn(() => ({
  upload: mockUpload,
  download: async () => ({ readableStreamBody: Readable.from([Buffer.from("hello")]) }),
  delete: mockDelete,
}));

const mockGetContainerClient = vi.fn(() => ({
  createIfNotExists: mockCreateIfNotExists,
  getBlockBlobClient: mockGetBlockBlobClient,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    storageConfig: {
      findUnique: vi.fn().mockResolvedValue({
        id: "singleton",
        provider: "AZURE",
        azureAuthMethod: "CONNECTION_STRING",
        azureConnectionStringEnc: "enc:conn",
        azureAccountName: "acct",
      }),
    },
  },
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn(() => "DefaultEndpointsProtocol=https;AccountName=acct;"),
  fingerprintSecret: vi.fn(() => "fingerprint"),
}));

vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: {
    fromConnectionString: vi.fn(() => ({ getContainerClient: mockGetContainerClient })),
  },
  StorageSharedKeyCredential: vi.fn(),
}));

// In-memory redis mock for test env
const redisStore = new Map<string, string>();
vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn(async (_k: string, _v: string): Promise<"OK"> => {
      redisStore.set(_k, _v);
      return "OK";
    }),
    get: vi.fn(async (k: string) => (redisStore.has(k) ? redisStore.get(k) : null)),
    del: vi.fn(async (k: string) => redisStore.delete(k)),
  },
}));

describe("storage provider (azure)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "production";
  });

  it("returns an Azure-backed provider and can save/read/delete", async () => {
    const { getStorageProvider } = await import("@/lib/storage");
    const provider = await getStorageProvider();

    await provider.save("k1", "content1");
    expect(mockCreateIfNotExists).toHaveBeenCalled();
    expect(mockUpload).toHaveBeenCalled();

    const text = await provider.read("k1");
    expect(text).toBe("hello");

    // make delete throw to exercise catch path
    mockDelete.mockImplementationOnce(() => { throw new Error("boom"); });
    await expect(provider.delete("k1")).resolves.toBeUndefined();
  });
});

describe("storage provider (redis fallback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "test"; // should force Redis provider
  });

  it("returns Redis provider in test env and its methods interact with redis client", async () => {
    // use the in-memory redisStore mocked at top-level

    const { getStorageProvider } = await import("@/lib/storage");
    const provider = await getStorageProvider();
    await provider.save("k2", "v2");
    const v = await provider.read("k2");
    expect(v).toBe("v2");
    await provider.delete("k2");
    await expect(provider.read("k2")).rejects.toThrow();
  });
});
