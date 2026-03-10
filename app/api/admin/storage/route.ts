import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { decrypt, encrypt, fingerprintSecret } from "@/lib/crypto";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

export async function GET() {
    await requireAdmin();

    const config = await prisma.storageConfig.findUnique({
        where: { id: "singleton" },
    });

    let azureAccountKeyFingerprint = "";
    let azureSasTokenFingerprint = "";

    try {
        if (config?.azureAccountKeyEnc) {
            azureAccountKeyFingerprint = fingerprintSecret(decrypt(config.azureAccountKeyEnc));
        }
        if (config?.azureSasTokenEnc) {
            const sasToken = decrypt(config.azureSasTokenEnc);
            azureSasTokenFingerprint = fingerprintSecret(sasToken.startsWith("?") ? sasToken.slice(1) : sasToken);
        }
    } catch (error) {
        console.error("[Storage Config] Failed to compute stored credential fingerprint", error);
    }

    return NextResponse.json({
        provider: config?.provider || "REDIS",
        azureAuthMethod: config?.azureAuthMethod || "CONNECTION_STRING",
        azureConnectionStringMasked: config?.azureConnectionStringEnc ? "********" : "",
        azureAccountName: config?.azureAccountName || "",
        azureAccountKeyMasked: config?.azureAccountKeyEnc ? "********" : "",
        azureAccountKeyFingerprint,
        azureSasTokenMasked: config?.azureSasTokenEnc ? "********" : "",
        azureSasTokenFingerprint,
        azureContainerName: config?.azureContainerName || "uploads",
    });
}

export async function POST(request: NextRequest) {
    const rate = await enforceRateLimit(request);
    if (!rate.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await requireAdmin();

    try {
        const data = await request.json();
        const { provider, azureConnectionString, azureContainerName, azureAuthMethod, azureAccountName, azureAccountKey, azureSasToken } = data;

        const existing = await prisma.storageConfig.findUnique({
            where: { id: "singleton" },
        });

        let encryptedConnString = existing?.azureConnectionStringEnc;
        let encryptedAccountKey = existing?.azureAccountKeyEnc;
        let encryptedSasToken = existing?.azureSasTokenEnc;

        if (azureConnectionString && azureConnectionString !== "********") {
            encryptedConnString = encrypt(azureConnectionString);
        }

        if (azureAccountKey && azureAccountKey !== "********") {
            console.info("[Storage Config] Saving Azure account key fingerprint:", fingerprintSecret(azureAccountKey));
            encryptedAccountKey = encrypt(azureAccountKey);
        }

        if (azureSasToken && azureSasToken !== "********") {
            console.info("[Storage Config] Saving Azure SAS fingerprint:", fingerprintSecret(azureSasToken));
            encryptedSasToken = encrypt(azureSasToken);
        }

        let config;
        try {
            config = await prisma.storageConfig.upsert({
                where: { id: "singleton" },
                create: {
                    id: "singleton",
                    provider,
                    azureAuthMethod: azureAuthMethod || "CONNECTION_STRING",
                    azureConnectionStringEnc: encryptedConnString,
                    azureAccountName: azureAccountName || existing?.azureAccountName,
                    azureAccountKeyEnc: encryptedAccountKey,
                    azureSasTokenEnc: encryptedSasToken,
                    azureContainerName,
                },
                update: {
                    provider,
                    azureAuthMethod: azureAuthMethod || existing?.azureAuthMethod,
                    azureConnectionStringEnc: encryptedConnString,
                    azureAccountName: azureAccountName || existing?.azureAccountName,
                    azureAccountKeyEnc: encryptedAccountKey,
                    azureSasTokenEnc: encryptedSasToken,
                    azureContainerName,
                },
            });
        } catch (err: unknown) {
            // Prisma client may not have been regenerated/migrated to include azureAuthMethod.
            // If so, retry without the field to remain backward compatible.
            const msg = err instanceof Error ? err.message : String(err ?? "");
            if (msg.includes("Unknown argument `azureAuthMethod`") || msg.includes("Unknown arg `azureAuthMethod`")) {
                // Fallback for older Prisma client/schema: only update fields that definitely exist.
                config = await prisma.storageConfig.upsert({
                    where: { id: "singleton" },
                    create: {
                        id: "singleton",
                        provider,
                        azureConnectionStringEnc: encryptedConnString,
                        azureContainerName,
                    },
                    update: {
                        provider,
                        azureConnectionStringEnc: encryptedConnString,
                        azureContainerName,
                    },
                });
            } else {
                throw err;
            }
        }

        return NextResponse.json({
            provider: config.provider,
            azureContainerName: config.azureContainerName,
            azureAccountKeyFingerprint: encryptedAccountKey && azureAccountKey && azureAccountKey !== "********"
                ? fingerprintSecret(azureAccountKey)
                : undefined,
            azureSasTokenFingerprint: encryptedSasToken && azureSasToken && azureSasToken !== "********"
                ? fingerprintSecret(azureSasToken.startsWith("?") ? azureSasToken.slice(1) : azureSasToken)
                : undefined,
        });
    } catch (error) {
        console.error("Failed to save storage config", error);
        return NextResponse.json({ error: "Failed to save configuration" }, { status: 500 });
    }
}
