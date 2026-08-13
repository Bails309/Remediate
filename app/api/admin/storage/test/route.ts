import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import type { NextRequest } from "next/server";

// Azure storage account names are 3-24 lowercase alphanumerics. Enforcing it
// matters beyond validation: the value is interpolated into the endpoint URL,
// so an unconstrained string (e.g. "evil.com#") would redirect the connection
// test at an attacker-chosen host.
const ACCOUNT_NAME_RE = /^[a-z0-9]{3,24}$/;

export async function POST(request: NextRequest) {
    const rate = await enforceRateLimit(request);
    if (!rate.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await requireSiteAdmin();

    try {
        const body = await request.json();
        const { connectionString, containerName, azureAuthMethod, accountName, accountKey, sasToken } = body;

        let blobServiceClient: BlobServiceClient;

        if (azureAuthMethod === "ACCOUNT_KEY") {
            if (!accountName || !ACCOUNT_NAME_RE.test(accountName) || !accountKey || accountKey === "********") {
                return NextResponse.json({ error: "Invalid account name or key" }, { status: 400 });
            }
            console.info("[Storage Test] Testing Azure account key for account: %s", accountName);
            const credential = new StorageSharedKeyCredential(accountName, accountKey);
            blobServiceClient = new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, credential);
        } else if (azureAuthMethod === "SAS_TOKEN") {
            if (!accountName || !ACCOUNT_NAME_RE.test(accountName) || !sasToken || sasToken === "********") {
                return NextResponse.json({ error: "Invalid account name or SAS token" }, { status: 400 });
            }
            console.info("[Storage Test] Testing Azure SAS for account: %s", accountName);
            const token = sasToken.startsWith("?") ? sasToken.substring(1) : sasToken;
            const url = `https://${accountName}.blob.core.windows.net?${token}`;
            blobServiceClient = new BlobServiceClient(url);
        } else {
            // Default: connection string
            if (!connectionString || connectionString === "********") {
                return NextResponse.json({ error: "Invalid connection string" }, { status: 400 });
            }
            blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        }

        const containerClient = blobServiceClient.getContainerClient(containerName || "uploads");

        // Attempt to list blobs with a tiny limit to verify access
        const iterator = containerClient.listBlobsFlat().byPage({ maxPageSize: 1 });
        await iterator.next();

        return NextResponse.json({ success: true, message: "Successfully connected to Azure Blob Storage" });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Azure connection test failed", error);
        return NextResponse.json({
            error: "Connection failed",
            details: message
        }, { status: 500 });
    }
}
