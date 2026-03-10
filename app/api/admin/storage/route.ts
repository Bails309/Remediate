import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { encrypt } from "@/lib/crypto";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

export async function GET() {
    await requireAdmin();

    const config = await prisma.storageConfig.findUnique({
        where: { id: "singleton" },
    });

    return NextResponse.json({
        provider: config?.provider || "REDIS",
        azureAuthMethod: config?.azureAuthMethod || "CONNECTION_STRING",
        azureConnectionStringMasked: config?.azureConnectionStringEnc ? "********" : "",
        azureAccountName: config?.azureAccountName || "",
        azureAccountKeyMasked: config?.azureAccountKeyEnc ? "********" : "",
        azureSasTokenMasked: config?.azureSasTokenEnc ? "********" : "",
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
            encryptedAccountKey = encrypt(azureAccountKey);
        }

        if (azureSasToken && azureSasToken !== "********") {
            encryptedSasToken = encrypt(azureSasToken);
        }

        const config = await prisma.storageConfig.upsert({
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

        return NextResponse.json({
            provider: config.provider,
            azureContainerName: config.azureContainerName,
        });
    } catch (error) {
        console.error("Failed to save storage config", error);
        return NextResponse.json({ error: "Failed to save configuration" }, { status: 500 });
    }
}
