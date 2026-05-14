import { 
  ShareServiceClient, 
  StorageSharedKeyCredential, 
  ShareDirectoryClient,
} from "@azure/storage-file-share";
import { prisma } from "./prisma";
import { decrypt } from "./crypto";
import { enqueueUpload } from "./queue";
import { getStorageProvider } from "./storage";

export class AzureFileShareService {
  private static normalize(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  static async pollAndIngest() {
    const config = await prisma.azureFileShareConfig.findUnique({
      where: { id: "singleton" },
    });

    if (!config || !config.enabled) {
      return;
    }

    try {
      const shareClient = await this.getShareClient(config);
      await this.ensureShareExists(shareClient);

      const targetPath = (config.directoryPath || "").replace(/^\/+|\/+$/g, "");
      const directoryClient = targetPath
        ? shareClient.getDirectoryClient(targetPath)
        : shareClient.rootDirectoryClient;

      if (targetPath) {
        await directoryClient.createIfNotExists();
      }
      
      const sites = await prisma.site.findMany({
        where: { autoImportEnabled: true }
      });
      const files = directoryClient.listFilesAndDirectories();

      for await (const item of files) {
        if (item.kind === "file" && item.name.toLowerCase().endsWith(".csv")) {
          const site = this.matchSite(item.name, sites);
          
          if (site) {
            console.log(`[AzureFileShare] Matching file ${item.name} to site ${site.name}`);
            await this.processFile(item.name, site.id, directoryClient, config.deleteAfterImport);
          } else {
            console.warn(`[AzureFileShare] No matching site found for file: ${item.name}`);
          }
        }
      }
      
      // Record last poll time
      await prisma.azureFileShareConfig.update({
        where: { id: "singleton" },
        data: { lastPollAt: new Date() }
      });
    } catch (error) {
      if (this.isShareNotFoundError(error)) {
        console.error(
          `[AzureFileShare] Share \"${config.shareName || "security-scans"}\" was not found and could not be auto-created. Check Azure File Share configuration and permissions.`,
        );
      } else {
        console.error("[AzureFileShare] Error during polling:", error);
      }
    }
  }

  private static async ensureShareExists(shareClient: ReturnType<ShareServiceClient["getShareClient"]>) {
    try {
      await shareClient.createIfNotExists();
    } catch (error) {
      if (this.isShareNotFoundError(error)) {
        throw error;
      }

      throw error;
    }
  }

  private static matchSite(filename: string, sites: Array<{ id: string; name: string; importAliases: string[]; importPattern?: string | null; autoImportEnabled: boolean }>) {
    const cleanFilename = this.normalize(filename.replace(/\.csv$/i, ""));

    // 1. Exact Match (Normalized)
    const exactMatch = sites.find(s => this.normalize(s.name) === cleanFilename);
    if (exactMatch) return exactMatch;

    // 2. Alias Match
    const aliasMatch = sites.find(s => 
      s.importAliases.some((alias: string) => this.normalize(alias) === cleanFilename)
    );
    if (aliasMatch) return aliasMatch;

    // 3. Regex Match (with safety timeout to prevent ReDoS)
    const regexMatch = sites.find(s => {
      if (!s.importPattern) return false;
      try {
        const regex = new RegExp(s.importPattern, "i");
        // Test with a short string length limit to mitigate catastrophic backtracking
        const testStr = filename.slice(0, 500);
        // nosemgrep: ajinabraham.njsscan.dos.regex_dos.regex_dos -- input is admin-defined importPattern, tested against a 500-char-capped string
        return regex.test(testStr);
      } catch {
        return false;
      }
    });
    if (regexMatch) return regexMatch;

    return null;
  }

  private static async processFile(
    filename: string,
    siteId: string,
    directoryClient: ShareDirectoryClient,
    deleteAfter: boolean
  ) {
    const fileClient = directoryClient.getFileClient(filename);
    const downloadResponse = await fileClient.download();
    const content = await this.streamToString(downloadResponse.readableStreamBody!);

    // Create upload history record
    const uploadId = crypto.randomUUID();
    await prisma.uploadHistory.create({
      data: {
        id: uploadId,
        siteId,
        uploadedBy: null,
        status: "Processing",
        fileName: filename,
      },
    });

    // Save to intermediate storage (Redis/Blob) for worker to pick up
    const storage = await getStorageProvider();
    const storageKey = `nessus-${uploadId}.csv`;
    await storage.save(storageKey, content);

    // Enqueue for processing
    await enqueueUpload(uploadId, storageKey);

    if (deleteAfter) {
      await fileClient.delete();
      console.log(`[AzureFileShare] Deleted file ${filename} after import`);
    }
  }

  static async validateConfig(config: unknown) {
    try {
      const shareClient = await this.getShareClient(config);
      await shareClient.createIfNotExists();
      const cfg = config as Record<string, unknown> | null;

      // Also check directory if specified
      if (cfg?.directoryPath && typeof cfg.directoryPath === "string" && cfg.directoryPath !== "/") {
        const directoryClient = shareClient.getDirectoryClient(String(cfg.directoryPath));
        await directoryClient.createIfNotExists();
      }
      
      return { success: true };
    } catch (error: unknown) {
      if (error instanceof Error) return { success: false, error: error.message };
      return { success: false, error: String(error) };
    }
  }

  private static async getShareClient(config: unknown) {
    let serviceClient: ShareServiceClient;

    // Support both encrypted (DB) and raw (test API) credentials
    const cfg = config as Record<string, unknown> | null;
    let connectionString: string | null = null;
    if (cfg && typeof cfg.connectionString === "string" && cfg.connectionString.trim() !== "") {
      connectionString = cfg.connectionString;
    } else if (cfg?.connectionStringEnc) {
      connectionString = decrypt(String(cfg.connectionStringEnc));
    }

    let accountKey: string | null = null;
    if (cfg && typeof cfg.accountKey === "string" && cfg.accountKey.trim() !== "") {
      accountKey = cfg.accountKey;
    } else if (cfg?.accountKeyEnc) {
      accountKey = decrypt(String(cfg.accountKeyEnc));
    }

    let sasToken: string | null = null;
    if (cfg && typeof cfg.sasToken === "string" && cfg.sasToken.trim() !== "") {
      sasToken = cfg.sasToken;
    } else if (cfg?.sasTokenEnc) {
      sasToken = decrypt(String(cfg.sasTokenEnc));
    }

    if (connectionString) {
      serviceClient = ShareServiceClient.fromConnectionString(String(connectionString));
    } else if (cfg?.accountName && accountKey) {
      const credential = new StorageSharedKeyCredential(String(cfg.accountName), String(accountKey));
      serviceClient = new ShareServiceClient(
        `https://${String(cfg.accountName)}.file.core.windows.net`,
        credential
      );
    } else if (cfg?.accountName && sasToken) {
      const url = `https://${String(cfg.accountName)}.file.core.windows.net?${String(sasToken)}`;
      serviceClient = new ShareServiceClient(url);
    } else {
      throw new Error("Missing Azure File Share credentials");
    }

    return serviceClient.getShareClient(String(cfg?.shareName || "security-scans"));
  }

  private static async streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      readableStream.on("data", (data: Buffer | Uint8Array | string) => {
        chunks.push(data instanceof Buffer ? data : Buffer.from(data));
      });
      readableStream.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
      readableStream.on("error", reject);
    });
  }

  private static isShareNotFoundError(error: unknown): boolean {
    return Boolean(
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ShareNotFound",
    );
  }
}
