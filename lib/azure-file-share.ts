import { 
  ShareServiceClient, 
  StorageSharedKeyCredential, 
  ShareFileClient 
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
      const targetPath = (config.directoryPath || "").replace(/^\/+|\/+$/g, "");
      const directoryClient = shareClient.getDirectoryClient(targetPath);
      
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
      console.error("[AzureFileShare] Error during polling:", error);
    }
  }

  private static matchSite(filename: string, sites: any[]) {
    const cleanFilename = this.normalize(filename.replace(/\.csv$/i, ""));

    // 1. Exact Match (Normalized)
    const exactMatch = sites.find(s => this.normalize(s.name) === cleanFilename);
    if (exactMatch) return exactMatch;

    // 2. Alias Match
    const aliasMatch = sites.find(s => 
      s.importAliases.some((alias: string) => this.normalize(alias) === cleanFilename)
    );
    if (aliasMatch) return aliasMatch;

    // 3. Regex Match
    const regexMatch = sites.find(s => {
      if (!s.importPattern) return false;
      try {
        const regex = new RegExp(s.importPattern, "i");
        return regex.test(filename);
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
    directoryClient: any, 
    deleteAfter: boolean
  ) {
    const fileClient = directoryClient.getFileClient(filename);
    const downloadResponse = await fileClient.download();
    const content = await this.streamToString(downloadResponse.readableStreamBody!);

    // Create upload history record
    const uploadId = crypto.randomUUID();
    const upload = await prisma.uploadHistory.create({
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

  static async validateConfig(config: any) {
    try {
      const shareClient = await this.getShareClient(config);
      await shareClient.getProperties();
      
      // Also check directory if specified
      if (config.directoryPath && config.directoryPath !== "/") {
        const directoryClient = shareClient.getDirectoryClient(config.directoryPath);
        await directoryClient.getProperties();
      }
      
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private static async getShareClient(config: any) {
    let serviceClient: ShareServiceClient;

    // Support both encrypted (DB) and raw (test API) credentials
    const connectionString = config.connectionString || (config.connectionStringEnc ? decrypt(config.connectionStringEnc) : null);
    const accountKey = config.accountKey || (config.accountKeyEnc ? decrypt(config.accountKeyEnc) : null);
    const sasToken = config.sasToken || (config.sasTokenEnc ? decrypt(config.sasTokenEnc) : null);

    if (connectionString) {
      serviceClient = ShareServiceClient.fromConnectionString(connectionString);
    } else if (config.accountName && accountKey) {
      const credential = new StorageSharedKeyCredential(config.accountName, accountKey);
      serviceClient = new ShareServiceClient(
        `https://${config.accountName}.file.core.windows.net`,
        credential
      );
    } else if (config.accountName && sasToken) {
      const url = `https://${config.accountName}.file.core.windows.net?${sasToken}`;
      serviceClient = new ShareServiceClient(url);
    } else {
      throw new Error("Missing Azure File Share credentials");
    }

    return serviceClient.getShareClient(config.shareName || "security-scans");
  }

  private static async streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: any[] = [];
      readableStream.on("data", (data) => {
        chunks.push(data instanceof Buffer ? data : Buffer.from(data));
      });
      readableStream.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
      readableStream.on("error", reject);
    });
  }
}
