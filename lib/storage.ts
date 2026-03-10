import * as fs from "fs/promises";
import * as path from "path";
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { prisma } from "./prisma";
import { decrypt } from "./crypto";

export interface StorageProvider {
    save(key: string, content: string): Promise<void>;
    read(key: string): Promise<string>;
    delete(key: string): Promise<void>;
}

class LocalFileProvider implements StorageProvider {
    constructor(private storagePath: string) { }

    private getPath(key: string) {
        return path.join(this.storagePath, key);
    }

    async save(key: string, content: string): Promise<void> {
        await fs.mkdir(this.storagePath, { recursive: true });
        await fs.writeFile(this.getPath(key), content, "utf8");
    }

    async read(key: string): Promise<string> {
        return fs.readFile(this.getPath(key), "utf8");
    }

    async delete(key: string): Promise<void> {
        try {
            await fs.unlink(this.getPath(key));
        } catch (e) {
            console.warn(`Failed to delete local file ${key}:`, e);
        }
    }
}

class AzureBlobProvider implements StorageProvider {
    private client: ContainerClient;

    constructor(connectionString: string, containerName: string) {
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        this.client = blobServiceClient.getContainerClient(containerName);
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

export async function getStorageProvider(): Promise<StorageProvider> {
    const config = await prisma.storageConfig.findUnique({
        where: { id: "singleton" },
    });

    if (config?.provider === "AZURE" && config.azureConnectionStringEnc) {
        try {
            const connectionString = decrypt(config.azureConnectionStringEnc);
            return new AzureBlobProvider(connectionString, config.azureContainerName || "uploads");
        } catch (e) {
            console.error("Failed to decrypt Azure connection string, falling back to local storage", e);
        }
    }

    return new LocalFileProvider(config?.localStoragePath || process.env.STORAGE_PATH || "/tmp/uploads");
}
