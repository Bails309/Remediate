import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { BlobServiceClient } from "@azure/storage-blob";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
    const rate = await enforceRateLimit(request);
    if (!rate.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await requireAdmin();

    try {
        const { connectionString, containerName } = await request.json();

        if (!connectionString || connectionString === "********") {
            return NextResponse.json({ error: "Invalid connection string" }, { status: 400 });
        }

        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient(containerName || "uploads");

        // Attempt to list blobs with a tiny limit to verify access
        const iterator = containerClient.listBlobsFlat().byPage({ maxPageSize: 1 });
        await iterator.next();

        return NextResponse.json({ success: true, message: "Successfully connected to Azure Blob Storage" });
    } catch (error: any) {
        console.error("Azure connection test failed", error);
        return NextResponse.json({
            error: "Connection failed",
            details: error.message || "Unknown error"
        }, { status: 500 });
    }
}
