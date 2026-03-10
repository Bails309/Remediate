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

    if (!config) {
        return NextResponse.json({
            provider: "LOCAL",
            azureContainerName: "uploads",
            localStoragePath: "/tmp/uploads",
        });
    }

    return NextResponse.json({
        provider: config.provider,
        azureConnectionStringMasked: config.azureConnectionStringEnc ? "********" : "",
        azureContainerName: config.azureContainerName,
        localStoragePath: config.localStoragePath,
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
        const { provider, azureConnectionString, azureContainerName, localStoragePath } = data;

        const existing = await prisma.storageConfig.findUnique({
            where: { id: "singleton" },
        });

        let encryptedConnString = existing?.azureConnectionStringEnc;
        if (azureConnectionString && azureConnectionString !== "********") {
            encryptedConnString = encrypt(azureConnectionString);
        }

        const config = await prisma.storageConfig.upsert({
            where: { id: "singleton" },
            create: {
                id: "singleton",
                provider,
                azureConnectionStringEnc: encryptedConnString,
                azureContainerName,
                localStoragePath,
            },
            update: {
                provider,
                azureConnectionStringEnc: encryptedConnString,
                azureContainerName,
                localStoragePath,
            },
        });

        return NextResponse.json({
            provider: config.provider,
            azureContainerName: config.azureContainerName,
            localStoragePath: config.localStoragePath,
        });
    } catch (error) {
        console.error("Failed to save storage config", error);
        return NextResponse.json({ error: "Failed to save configuration" }, { status: 500 });
    }
}
