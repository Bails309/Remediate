import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted shared mock state so vi.mock factories (hoisted above imports) can
// safely reference it.
const H = vi.hoisted(() => {
  const state = {
    containerExists: true,
    blobList: [] as Array<{ name: string }>,
  };
  const mocks = {
    downloadToBuffer: vi.fn(),
    getProperties: vi.fn().mockResolvedValue({ contentLength: 1024 }),
    blobDelete: vi.fn(),
    storageSave: vi.fn().mockResolvedValue(undefined),
  };
  const listBlobsFlat = vi.fn(() => {
    const items = [...state.blobList];
    return {
      async *[Symbol.asyncIterator]() {
        for (const b of items) yield b;
      },
    };
  });
  const getBlobClient = vi.fn(() => ({
    downloadToBuffer: mocks.downloadToBuffer,
    getProperties: mocks.getProperties,
    delete: mocks.blobDelete,
  }));
  const getContainerClient = vi.fn((name: string) => ({
    containerName: name,
    exists: vi.fn(async () => state.containerExists),
    listBlobsFlat,
    getBlobClient,
  }));
  return { state, mocks, listBlobsFlat, getBlobClient, getContainerClient };
});

vi.mock("@azure/storage-blob", () => {
  function BlobServiceClient(this: Record<string, unknown>) {
    return { getContainerClient: H.getContainerClient };
  }
  (BlobServiceClient as any).fromConnectionString = vi.fn(() => ({
    getContainerClient: H.getContainerClient,
  }));
  function StorageSharedKeyCredential(
    this: Record<string, unknown>,
    accountName: string,
    accountKey: string,
  ) {
    this.accountName = accountName;
    this.accountKey = accountKey;
  }
  return { BlobServiceClient, StorageSharedKeyCredential };
});

vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn((enc: string) => `decrypted:${enc}`),
  encrypt: vi.fn((raw: string) => `enc:${raw}`),
  fingerprintSecret: vi.fn(() => "fp"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    azureBlobIngestConfig: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    site: { findUnique: vi.fn() },
    uploadHistory: { create: vi.fn() },
  },
}));

vi.mock("@/lib/queue", () => ({
  enqueueUpload: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/storage", () => ({
  getStorageProvider: vi.fn().mockResolvedValue({
    save: H.mocks.storageSave,
    read: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock("@/lib/csv", () => ({
  validateAcrCsv: vi.fn(() => ({ ok: true })),
}));

import { AzureBlobIngestService } from "@/lib/azure-blob-ingest";
import { prisma } from "@/lib/prisma";
import { validateAcrCsv } from "@/lib/csv";
import { enqueueUpload } from "@/lib/queue";

beforeEach(() => {
  vi.clearAllMocks();
  H.state.containerExists = true;
  H.state.blobList = [];
  H.mocks.downloadToBuffer.mockResolvedValue(Buffer.from("plugin_id,host,port,severity\n1,h,80,High"));
  H.mocks.getProperties.mockResolvedValue({ contentLength: 1024 });
  H.mocks.storageSave.mockResolvedValue(undefined);
  (validateAcrCsv as any).mockReturnValue({ ok: true });
});

describe("AzureBlobIngestService.pollAndIngest", () => {
  it("skips oversized blobs without downloading or deleting them", async () => {
    // Converting a blob larger than Node's ~512MB string limit throws
    // ERR_STRING_TOO_LONG from `toString()`, which previously killed the worker.
    (prisma.azureBlobIngestConfig.findUnique as any).mockResolvedValue({
      enabled: true,
      defaultSiteId: "site-1",
      containerName: "acr",
      deleteAfterImport: true,
      authMethod: "CONNECTION_STRING",
      connectionStringEnc: "enc",
    });
    H.state.blobList = [{ name: "huge.csv" }];
    H.mocks.getProperties.mockResolvedValue({ contentLength: 600 * 1024 * 1024 });

    await AzureBlobIngestService.pollAndIngest();

    expect(H.mocks.downloadToBuffer).not.toHaveBeenCalled();
    expect(H.mocks.blobDelete).not.toHaveBeenCalled();
  });

  it("returns silently when no config exists", async () => {
    (prisma.azureBlobIngestConfig.findUnique as any).mockResolvedValue(null);
    await AzureBlobIngestService.pollAndIngest();
    expect(H.getContainerClient).not.toHaveBeenCalled();
  });

  it("returns silently when disabled", async () => {
    (prisma.azureBlobIngestConfig.findUnique as any).mockResolvedValue({
      enabled: false,
      defaultSiteId: "site-1",
    });
    await AzureBlobIngestService.pollAndIngest();
    expect(H.getContainerClient).not.toHaveBeenCalled();
  });

  it("warns and returns when no defaultSiteId configured", async () => {
    (prisma.azureBlobIngestConfig.findUnique as any).mockResolvedValue({
      enabled: true,
      defaultSiteId: null,
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await AzureBlobIngestService.pollAndIngest();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("logs and returns when container does not exist", async () => {
    (prisma.azureBlobIngestConfig.findUnique as any).mockResolvedValue({
      enabled: true,
      defaultSiteId: "site-1",
      authMethod: "CONNECTION_STRING",
      connectionStringEnc: "enc:cs",
      containerName: "acr-vulnerabilities",
      prefix: "",
    });
    H.state.containerExists = false;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await AzureBlobIngestService.pollAndIngest();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("skips when defaultSiteId does not resolve to a Site", async () => {
    (prisma.azureBlobIngestConfig.findUnique as any).mockResolvedValue({
      enabled: true,
      defaultSiteId: "missing-site",
      authMethod: "CONNECTION_STRING",
      connectionStringEnc: "enc:cs",
      containerName: "acr-vulnerabilities",
      prefix: "",
    });
    (prisma.site.findUnique as any).mockResolvedValue(null);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await AzureBlobIngestService.pollAndIngest();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("processes a valid CSV blob, enqueues, and deletes when deleteAfterImport=true", async () => {
    (prisma.azureBlobIngestConfig.findUnique as any).mockResolvedValue({
      enabled: true,
      defaultSiteId: "site-1",
      authMethod: "CONNECTION_STRING",
      connectionStringEnc: "enc:cs",
      containerName: "acr-vulnerabilities",
      prefix: "reports/",
      deleteAfterImport: true,
    });
    (prisma.site.findUnique as any).mockResolvedValue({ id: "site-1" });
    (prisma.uploadHistory.create as any).mockResolvedValue({ id: "upload-1" });
    (prisma.azureBlobIngestConfig.update as any).mockResolvedValue({});
    H.state.blobList = [{ name: "reports/2026-01.csv" }];

    await AzureBlobIngestService.pollAndIngest();

    expect(prisma.uploadHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          siteId: "site-1",
          scannerType: "ACR",
          fileName: "reports/2026-01.csv",
        }),
      }),
    );
    expect(H.mocks.storageSave).toHaveBeenCalled();
    expect(enqueueUpload).toHaveBeenCalled();
    expect(H.mocks.blobDelete).toHaveBeenCalled();
    expect(prisma.azureBlobIngestConfig.update).toHaveBeenCalled();
  });

  it("does NOT delete when deleteAfterImport=false", async () => {
    (prisma.azureBlobIngestConfig.findUnique as any).mockResolvedValue({
      enabled: true,
      defaultSiteId: "site-1",
      authMethod: "CONNECTION_STRING",
      connectionStringEnc: "enc:cs",
      containerName: "acr-vulnerabilities",
      prefix: "",
      deleteAfterImport: false,
    });
    (prisma.site.findUnique as any).mockResolvedValue({ id: "site-1" });
    (prisma.uploadHistory.create as any).mockResolvedValue({ id: "upload-2" });
    H.state.blobList = [{ name: "a.csv" }];

    await AzureBlobIngestService.pollAndIngest();

    expect(enqueueUpload).toHaveBeenCalled();
    expect(H.mocks.blobDelete).not.toHaveBeenCalled();
  });

  it("skips non-CSV blobs", async () => {
    (prisma.azureBlobIngestConfig.findUnique as any).mockResolvedValue({
      enabled: true,
      defaultSiteId: "site-1",
      authMethod: "CONNECTION_STRING",
      connectionStringEnc: "enc:cs",
      containerName: "c",
      prefix: "",
      deleteAfterImport: true,
    });
    (prisma.site.findUnique as any).mockResolvedValue({ id: "site-1" });
    H.state.blobList = [{ name: "a.txt" }, { name: "b.zip" }];

    await AzureBlobIngestService.pollAndIngest();

    expect(prisma.uploadHistory.create).not.toHaveBeenCalled();
    expect(enqueueUpload).not.toHaveBeenCalled();
  });

  it("skips (does not delete) blobs that fail CSV header validation", async () => {
    (prisma.azureBlobIngestConfig.findUnique as any).mockResolvedValue({
      enabled: true,
      defaultSiteId: "site-1",
      authMethod: "CONNECTION_STRING",
      connectionStringEnc: "enc:cs",
      containerName: "c",
      prefix: "",
      deleteAfterImport: true,
    });
    (prisma.site.findUnique as any).mockResolvedValue({ id: "site-1" });
    (validateAcrCsv as any).mockReturnValue({ ok: false, missing: ["plugin_id"] });
    H.state.blobList = [{ name: "bad.csv" }];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await AzureBlobIngestService.pollAndIngest();

    expect(prisma.uploadHistory.create).not.toHaveBeenCalled();
    expect(H.mocks.blobDelete).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("continues past a failing blob and processes the next one", async () => {
    (prisma.azureBlobIngestConfig.findUnique as any).mockResolvedValue({
      enabled: true,
      defaultSiteId: "site-1",
      authMethod: "CONNECTION_STRING",
      connectionStringEnc: "enc:cs",
      containerName: "c",
      prefix: "",
      deleteAfterImport: false,
    });
    (prisma.site.findUnique as any).mockResolvedValue({ id: "site-1" });
    (prisma.uploadHistory.create as any).mockResolvedValue({ id: "u" });
    H.state.blobList = [{ name: "a.csv" }, { name: "b.csv" }];
    H.mocks.downloadToBuffer
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(Buffer.from("plugin_id,host,port,severity\n1,h,80,High"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await AzureBlobIngestService.pollAndIngest();

    expect(enqueueUpload).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("AzureBlobIngestService.validateConfig", () => {
  it("returns success:true when container exists (CONNECTION_STRING)", async () => {
    H.state.containerExists = true;
    const result = await AzureBlobIngestService.validateConfig({
      authMethod: "CONNECTION_STRING",
      connectionString: "DefaultEndpointsProtocol=https;AccountName=a;",
      containerName: "acr-vulnerabilities",
    });
    expect(result.success).toBe(true);
  });

  it("returns success:false when container does not exist", async () => {
    H.state.containerExists = false;
    const result = await AzureBlobIngestService.validateConfig({
      authMethod: "CONNECTION_STRING",
      connectionString: "DefaultEndpointsProtocol=https;AccountName=a;",
      containerName: "missing",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/does not exist/);
  });

  it("returns error when connection string is missing", async () => {
    const result = await AzureBlobIngestService.validateConfig({
      authMethod: "CONNECTION_STRING",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/connection string/i);
  });

  it("supports ACCOUNT_KEY auth", async () => {
    H.state.containerExists = true;
    const result = await AzureBlobIngestService.validateConfig({
      authMethod: "ACCOUNT_KEY",
      accountName: "myacct",
      accountKey: "supersecretkey",
      containerName: "c",
    });
    expect(result.success).toBe(true);
  });

  it("ACCOUNT_KEY without account name or key errors", async () => {
    const result = await AzureBlobIngestService.validateConfig({
      authMethod: "ACCOUNT_KEY",
    });
    expect(result.success).toBe(false);
  });

  it("supports SAS_TOKEN auth (leading ? optional)", async () => {
    H.state.containerExists = true;
    const result = await AzureBlobIngestService.validateConfig({
      authMethod: "SAS_TOKEN",
      accountName: "acct",
      sasToken: "sv=2021&sig=x",
      containerName: "c",
    });
    expect(result.success).toBe(true);
  });

  it("SAS_TOKEN without account name or token errors", async () => {
    const result = await AzureBlobIngestService.validateConfig({
      authMethod: "SAS_TOKEN",
    });
    expect(result.success).toBe(false);
  });

  it("uses encrypted secret from *Enc field via decrypt() when raw not provided", async () => {
    H.state.containerExists = true;
    const result = await AzureBlobIngestService.validateConfig({
      authMethod: "CONNECTION_STRING",
      connectionStringEnc: "enc-blob",
      containerName: "c",
    });
    expect(result.success).toBe(true);
  });

  it("treats '****' sentinel as absent (falls back to encrypted value)", async () => {
    H.state.containerExists = true;
    const result = await AzureBlobIngestService.validateConfig({
      authMethod: "CONNECTION_STRING",
      connectionString: "****",
      connectionStringEnc: "enc-value",
      containerName: "c",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unsupported auth method", async () => {
    const result = await AzureBlobIngestService.validateConfig({
      authMethod: "OTHER",
      containerName: "c",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unsupported/i);
  });
});
