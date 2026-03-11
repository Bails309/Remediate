import { BlobServiceClient, ContainerClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import { prisma } from "./prisma";
import { decrypt, fingerprintSecret } from "./crypto";

export interface StorageProvider {
    save(key: string, content: string): Promise<void>;
    read(key: string): Promise<string>;
    delete(key: string): Promise<void>;
}

async function streamToText(stream: NodeJS.ReadableStream): Promise<string> {
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
        if (typeof chunk === "string") {
            chunks.push(Buffer.from(chunk, "utf8"));
        } else {
            chunks.push(Buffer.from(chunk));
        }
    }

    return Buffer.concat(chunks).toString("utf8");
}

class AzureBlobProvider implements StorageProvider {
    private client: ContainerClient;

    constructor(client: ContainerClient) {
        this.client = client;
    }

    async save(key: string, content: string): Promise<void> {
        await this.client.createIfNotExists();
        const blockBlobClient = this.client.getBlockBlobClient(key);
        await blockBlobClient.upload(content, Buffer.byteLength(content, "utf8"));
    }

    async read(key: string): Promise<string> {
        const blockBlobClient = this.client.getBlockBlobClient(key);
        const downloadResponse = await blockBlobClient.download(0);

        if (downloadResponse.readableStreamBody) {
            return streamToText(downloadResponse.readableStreamBody);
        }

        const body = await downloadResponse.blobBody;
        if (body) {
            return body.text();
        }

        throw new Error("Azure blob downloaded body is empty");
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
    // During unit tests, prefer the Redis provider to keep tests deterministic
    // and avoid relying on any real/prisma-backed storage config.
    if (process.env.NODE_ENV === 'test') {
        return new RedisStorageProvider();
    }
    const config = await prisma.storageConfig.findUnique({
        where: { id: "singleton" },
    });

    console.info("[Storage] Loaded config", {
        provider: config?.provider ?? null,
        azureAuthMethod: config?.azureAuthMethod ?? null,
        azureAccountName: config?.azureAccountName ?? null,
        azureContainerName: config?.azureContainerName ?? null,
        hasConnectionString: Boolean(config?.azureConnectionStringEnc),
        hasAccountKey: Boolean(config?.azureAccountKeyEnc),
        hasSasToken: Boolean(config?.azureSasTokenEnc),
    });

    // Azure Provider
    if (config?.provider === "AZURE") {
        try {
            const containerName = config.azureContainerName || "uploads";
            let blobServiceClient: BlobServiceClient | null = null;

            if (config.azureAuthMethod === "CONNECTION_STRING" && config.azureConnectionStringEnc) {
                const connectionString = decrypt(config.azureConnectionStringEnc);
                console.info("Azure storage: using Connection String (masked)", connectionString ? `****${connectionString.slice(-8)}` : "(none)");
                blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
            } else if (config.azureAuthMethod === "ACCOUNT_KEY" && config.azureAccountName && config.azureAccountKeyEnc) {
                const accountKey = decrypt(config.azureAccountKeyEnc);
                console.info("Azure storage: using Account Key for account", config.azureAccountName);
                const maskedKey = accountKey ? `****${accountKey.slice(-8)}` : undefined;
                console.info("Azure storage: accountKey (masked):", maskedKey);
                console.info("Azure storage: accountKey fingerprint:", fingerprintSecret(accountKey));
                const credential = new StorageSharedKeyCredential(config.azureAccountName, accountKey);
                blobServiceClient = new BlobServiceClient(`https://${config.azureAccountName}.blob.core.windows.net`, credential);
            } else if (config.azureAuthMethod === "SAS_TOKEN" && config.azureAccountName && config.azureSasTokenEnc) {
                const sasToken = decrypt(config.azureSasTokenEnc);
                const raw = sasToken.startsWith("?") ? sasToken.substring(1) : sasToken;
                const masked = raw ? `...${raw.slice(-12)}` : undefined;
                console.info("Azure storage: using SAS token (masked):", masked);
                console.info("Azure storage: SAS fingerprint:", fingerprintSecret(raw));
                const url = `https://${config.azureAccountName}.blob.core.windows.net?${raw}`;
                blobServiceClient = new BlobServiceClient(url);
            }

            if (blobServiceClient) {
                const containerClient = blobServiceClient.getContainerClient(containerName);
                return new AzureBlobProvider(containerClient);
            }
        } catch (e: unknown) {
            // Surface HTTP auth hints from Azure SDK errors where available
            try {
                const maybe = e as { response?: { headers?: Record<string, string> }; details?: { response?: { headers?: Record<string, string> } } };
                const hdrs = maybe.response?.headers || maybe.details?.response?.headers;
                if (hdrs && (hdrs['www-authenticate'] || hdrs['WWW-Authenticate'])) {
                    console.error('Azure storage auth failure, www-authenticate:', hdrs['www-authenticate'] || hdrs['WWW-Authenticate']);
                }
            } catch {
                // ignore
            }
            console.error("Failed to initialize Azure storage provider, falling back to Redis storage", e);
        }
    }

    if (config?.provider !== "AZURE") {
        console.info("[Storage] Falling back to Redis because provider is not AZURE", {
            provider: config?.provider ?? null,
        });
    }

    // Explicit Redis Provider or Default
    return new RedisStorageProvider();
}

// Augment Azure provider operations with richer error logging so that transient
// auth issues can be diagnosed with response headers.
const enhanceAzureErrors = (fn: (...args: unknown[]) => Promise<unknown>) => {
    return async function (this: unknown, ...args: unknown[]) {
        try {
            return await (fn as (...a: unknown[]) => Promise<unknown>).apply(this, args);
        } catch (e: unknown) {
            try {
                const maybe = e as { response?: { headers?: Record<string, string> }; details?: { response?: { headers?: Record<string, string> } } };
                const hdrs = maybe.response?.headers || maybe.details?.response?.headers;
                if (hdrs && (hdrs['www-authenticate'] || hdrs['WWW-Authenticate'])) {
                    console.error('Azure storage operation failed, www-authenticate:', hdrs['www-authenticate'] || hdrs['WWW-Authenticate']);
                }
            } catch { }
            throw e;
        }
    };
};

// Wrap AzureBlobProvider methods to log headers on failure while preserving `this`
AzureBlobProvider.prototype.save = enhanceAzureErrors(AzureBlobProvider.prototype.save as unknown as (...args: unknown[]) => Promise<unknown>) as unknown as typeof AzureBlobProvider.prototype.save;
AzureBlobProvider.prototype.read = enhanceAzureErrors(AzureBlobProvider.prototype.read as unknown as (...args: unknown[]) => Promise<unknown>) as unknown as typeof AzureBlobProvider.prototype.read;
AzureBlobProvider.prototype.delete = enhanceAzureErrors(AzureBlobProvider.prototype.delete as unknown as (...args: unknown[]) => Promise<unknown>) as unknown as typeof AzureBlobProvider.prototype.delete;
