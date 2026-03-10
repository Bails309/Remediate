import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { prisma } from "./prisma";
import { decrypt } from "./crypto";

export interface StorageProvider {
    save(key: string, content: string): Promise<void>;
    read(key: string): Promise<string>;
    delete(key: string): Promise<void>;
}

class AzureBlobProvider implements StorageProvider {
    private client: ContainerClient;

    constructor(client: ContainerClient) {
        this.client = client;
    }

    async save(key: string, content: string): Promise<void> {
        await this.client.createIfNotExists();
        const blockBlobClient = this.client.getBlockBlobClient(key);
        await blockBlobClient.upload(content, content.length);
    }

    async read(key: string): Promise<string> {
        const blockBlobClient = this.client.getBlockBlobClient(key);
        const downloadResponse = await blockBlobClient.download(0);
        const body = await downloadResponse.blobBody;
        if (!body) throw new Error("Azure blob downloaded body is empty");
        return body.text();
    }

    async delete(key: string): Promise<void> {
        try {
            const blockBlobClient = this.client.getBlockBlobClient(key);
            await blockBlobClient.delete();
        } catch (e) {
            console.warn(`Failed to delete Azure blob ${key}:`, e);
        }
    }
}

class RedisStorageProvider implements StorageProvider {
    // TTL of 2 hours for ephemeral storage
    private static readonly TTL_SECONDS = 7200;

    async save(key: string, content: string): Promise<void> {
        const { redis } = await import("./redis");
        await redis.set(key, content, "EX", RedisStorageProvider.TTL_SECONDS);
    }

    async read(key: string): Promise<string> {
        const { redis } = await import("./redis");
        const content = await redis.get(key);
        if (content === null) {
            throw new Error(`File not found in Redis: ${key}`);
        }
        return content;
    }

    async delete(key: string): Promise<void> {
        const { redis } = await import("./redis");
        await redis.del(key);
    }
}

export async function getStorageProvider(): Promise<StorageProvider> {
    const config = await prisma.storageConfig.findUnique({
        where: { id: "singleton" },
    });

    // Azure Provider
    if (config?.provider === "AZURE") {
        try {
            const containerName = config.azureContainerName || "uploads";
            let blobServiceClient: BlobServiceClient | null = null;

            if (config.azureAuthMethod === "CONNECTION_STRING" && config.azureConnectionStringEnc) {
                const connectionString = decrypt(config.azureConnectionStringEnc);
                blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
            } else if (config.azureAuthMethod === "ACCOUNT_KEY" && config.azureAccountName && config.azureAccountKeyEnc) {
                const { StorageSharedKeyCredential } = await import("@azure/storage-blob");
                const accountKey = decrypt(config.azureAccountKeyEnc);
                const credential = new StorageSharedKeyCredential(config.azureAccountName, accountKey);
                blobServiceClient = new BlobServiceClient(`https://${config.azureAccountName}.blob.core.windows.net`, credential);
            } else if (config.azureAuthMethod === "SAS_TOKEN" && config.azureAccountName && config.azureSasTokenEnc) {
                const sasToken = decrypt(config.azureSasTokenEnc);
                const url = `https://${config.azureAccountName}.blob.core.windows.net?${sasToken.startsWith("?") ? sasToken.substring(1) : sasToken}`;
                blobServiceClient = new BlobServiceClient(url);
            }

            if (blobServiceClient) {
                const containerClient = blobServiceClient.getContainerClient(containerName);
                return new AzureBlobProvider(containerClient);
            }
        } catch (e) {
            console.error("Failed to initialize Azure storage provider, falling back to Redis storage", e);
        }
    }

    // Explicit Redis Provider or Default
    return new RedisStorageProvider();
}
