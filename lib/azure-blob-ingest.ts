import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  ContainerClient,
} from "@azure/storage-blob";
import { prisma } from "./prisma";
import { decrypt } from "./crypto";
import { enqueueUpload } from "./queue";
import { getStorageProvider } from "./storage";
import { validateAcrCsv } from "./csv";
import { AzureAuthMethod, ScannerType, UploadStatus, UploadType } from "@prisma/client";

/**
 * Polls a configured Azure Blob container for ACR vulnerability CSV exports,
 * ingests any it finds, and (optionally) deletes them after successful queueing.
 *
 * This is completely independent from AzureFileShareService and StorageConfig \u2014
 * admins can configure a different storage account with its own credentials.
 *
 * Site mapping is intentionally simple in v1: all ingested CSVs are routed to
 * the `defaultSiteId` configured on the singleton row. If no default is set,
 * polling logs a warning and no ingest happens.
 */
export class AzureBlobIngestService {
  static async pollAndIngest() {
    const config = await prisma.azureBlobIngestConfig.findUnique({
      where: { id: "singleton" },
    });

    if (!config || !config.enabled) {
      return;
    }

    if (!config.defaultSiteId) {
      console.warn(
        "[AzureBlobIngest] No defaultSiteId configured \u2014 skipping poll. Set a default site in the admin UI.",
      );
      return;
    }

    let containerClient: ContainerClient;
    try {
      containerClient = await this.getContainerClient(config);
    } catch (error) {
      console.error("[AzureBlobIngest] Failed to build container client:", error);
      return;
    }

    try {
      // Fail fast if the container doesn't exist \u2014 we don't auto-create because
      // the destination is owned by the ACR export pipeline, not us.
      const exists = await containerClient.exists();
      if (!exists) {
        console.error(
          `[AzureBlobIngest] Container "${config.containerName}" does not exist. Aborting poll.`,
        );
        return;
      }

      const site = await prisma.site.findUnique({ where: { id: config.defaultSiteId } });
      if (!site) {
        console.error(
          `[AzureBlobIngest] defaultSiteId ${config.defaultSiteId} not found in Site table \u2014 clear or update the automation config.`,
        );
        return;
      }

      const prefix = config.prefix?.replace(/^\/+/, "") ?? "";
      const blobs = containerClient.listBlobsFlat({ prefix });

      let ingested = 0;
      for await (const blob of blobs) {
        if (!blob.name.toLowerCase().endsWith(".csv")) continue;

        try {
          await this.processBlob(blob.name, site.id, containerClient, config.deleteAfterImport);
          ingested += 1;
        } catch (error) {
          console.error(`[AzureBlobIngest] Failed to process ${blob.name}:`, error);
          // Continue to next blob; do NOT delete on failure.
        }
      }

      if (ingested > 0) {
        console.log(`[AzureBlobIngest] Ingested ${ingested} CSV file(s) from ${config.containerName}`);
      }

      await prisma.azureBlobIngestConfig.update({
        where: { id: "singleton" },
        data: { lastPollAt: new Date() },
      });
    } catch (error) {
      console.error("[AzureBlobIngest] Error during polling:", error);
    }
  }

  private static async processBlob(
    blobName: string,
    siteId: string,
    containerClient: ContainerClient,
    deleteAfter: boolean,
  ) {
    const blobClient = containerClient.getBlobClient(blobName);
    const buffer = await blobClient.downloadToBuffer();
    const content = buffer.toString("utf8");

    // Header sanity-check before we commit an UploadHistory record. If the file
    // isn't an ACR CSV, log and skip \u2014 do NOT delete (someone put a bad file
    // in the container and we shouldn't destroy the evidence).
    const validation = validateAcrCsv(content);
    if (!validation.ok) {
      console.warn(
        `[AzureBlobIngest] Skipping ${blobName} \u2014 missing required columns: ${validation.missing.join(", ")}`,
      );
      return;
    }

    const uploadId = crypto.randomUUID();
    await prisma.uploadHistory.create({
      data: {
        id: uploadId,
        siteId,
        uploadedBy: null,
        status: UploadStatus.Processing,
        uploadType: UploadType.CSV,
        scannerType: ScannerType.ACR,
        fileName: blobName,
      },
    });

    const storage = await getStorageProvider();
    const storageKey = `acr-${uploadId}.csv`;
    await storage.save(storageKey, content);

    await enqueueUpload(uploadId, storageKey);

    if (deleteAfter) {
      try {
        await blobClient.delete();
        console.log(`[AzureBlobIngest] Deleted blob ${blobName} after enqueue`);
      } catch (error) {
        console.error(`[AzureBlobIngest] Failed to delete ${blobName}:`, error);
      }
    }
  }

  static async validateConfig(config: unknown) {
    try {
      const containerClient = await this.getContainerClient(config);
      const exists = await containerClient.exists();
      if (!exists) {
        return { success: false as const, error: `Container "${containerClient.containerName}" does not exist` };
      }
      return { success: true as const };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false as const, error: message };
    }
  }

  private static async getContainerClient(config: unknown): Promise<ContainerClient> {
    const cfg = (config ?? {}) as Record<string, unknown>;

    const authMethod = (cfg.authMethod as AzureAuthMethod | undefined) ?? AzureAuthMethod.CONNECTION_STRING;
    const containerName = String(cfg.containerName || "acr-vulnerabilities");
    const accountName = cfg.accountName ? String(cfg.accountName) : "";

    // Support both encrypted (DB) and raw (test API) credentials, mirroring
    // AzureFileShareService.getShareClient.
    const readSecret = (raw: string, encName: string): string | null => {
      const rawVal = cfg[raw];
      if (typeof rawVal === "string" && rawVal.trim() !== "" && rawVal !== "****") {
        return rawVal;
      }
      const encVal = cfg[encName];
      if (typeof encVal === "string" && encVal.trim() !== "") {
        return decrypt(encVal);
      }
      return null;
    };

    let serviceClient: BlobServiceClient;

    if (authMethod === AzureAuthMethod.CONNECTION_STRING) {
      const cs = readSecret("connectionString", "connectionStringEnc");
      if (!cs) throw new Error("Missing connection string");
      serviceClient = BlobServiceClient.fromConnectionString(cs);
    } else if (authMethod === AzureAuthMethod.ACCOUNT_KEY) {
      const key = readSecret("accountKey", "accountKeyEnc");
      if (!accountName || !key) throw new Error("Missing account name or key");
      const credential = new StorageSharedKeyCredential(accountName, key);
      serviceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        credential,
      );
    } else if (authMethod === AzureAuthMethod.SAS_TOKEN) {
      const sas = readSecret("sasToken", "sasTokenEnc");
      if (!accountName || !sas) throw new Error("Missing account name or SAS token");
      const sasClean = sas.startsWith("?") ? sas : `?${sas}`;
      serviceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net${sasClean}`,
      );
    } else {
      throw new Error(`Unsupported auth method: ${authMethod}`);
    }

    return serviceClient.getContainerClient(containerName);
  }
}
