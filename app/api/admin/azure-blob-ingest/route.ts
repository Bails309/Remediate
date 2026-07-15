import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { encrypt } from "@/lib/crypto";
import { AzureAuthMethod } from "@prisma/client";

const VALID_AUTH_METHODS: AzureAuthMethod[] = [
  AzureAuthMethod.CONNECTION_STRING,
  AzureAuthMethod.ACCOUNT_KEY,
  AzureAuthMethod.SAS_TOKEN,
];

export async function GET() {
  await requireAdmin();

  const config = await prisma.azureBlobIngestConfig.findUnique({
    where: { id: "singleton" },
  });

  if (!config) {
    return NextResponse.json({
      enabled: false,
      authMethod: AzureAuthMethod.CONNECTION_STRING,
      accountName: null,
      containerName: "acr-vulnerabilities",
      prefix: "",
      defaultSiteId: null,
      pollIntervalMinutes: 60,
      deleteAfterImport: true,
      connectionStringEnc: null,
      accountKeyEnc: null,
      sasTokenEnc: null,
      lastPollAt: null,
      updatedAt: null,
    });
  }

  // Redact secrets: expose only their presence to the client.
  return NextResponse.json({
    ...config,
    connectionStringEnc: config.connectionStringEnc ? "****" : null,
    accountKeyEnc: config.accountKeyEnc ? "****" : null,
    sasTokenEnc: config.sasTokenEnc ? "****" : null,
  });
}

export async function POST(request: Request) {
  await requireAdmin();
  const data = await request.json();

  const authMethod: AzureAuthMethod = VALID_AUTH_METHODS.includes(data.authMethod)
    ? data.authMethod
    : AzureAuthMethod.CONNECTION_STRING;

  type UpdateData = Partial<{
    enabled: boolean;
    authMethod: AzureAuthMethod;
    accountName: string | null;
    containerName: string | null;
    prefix: string | null;
    defaultSiteId: string | null;
    pollIntervalMinutes: number;
    deleteAfterImport: boolean;
    connectionStringEnc: string | null;
    accountKeyEnc: string | null;
    sasTokenEnc: string | null;
  }>;

  const updateData: UpdateData = {
    enabled: Boolean(data.enabled),
    authMethod,
    accountName: data.accountName || null,
    containerName: data.containerName || "acr-vulnerabilities",
    prefix: typeof data.prefix === "string" ? data.prefix : "",
    defaultSiteId: data.defaultSiteId || null,
    pollIntervalMinutes: parseInt(data.pollIntervalMinutes) || 60,
    deleteAfterImport: data.deleteAfterImport !== false,
  };

  // Only overwrite secrets when the client submits a real value \u2014 "****"
  // is our sentinel that means "leave the existing encrypted value alone".
  if (data.connectionString && data.connectionString !== "****") {
    updateData.connectionStringEnc = encrypt(String(data.connectionString));
  }
  if (data.accountKey && data.accountKey !== "****") {
    updateData.accountKeyEnc = encrypt(String(data.accountKey));
  }
  if (data.sasToken && data.sasToken !== "****") {
    updateData.sasTokenEnc = encrypt(String(data.sasToken));
  }

  const config = await prisma.azureBlobIngestConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      ...updateData,
      enabled: updateData.enabled ?? false,
      authMethod: updateData.authMethod ?? AzureAuthMethod.CONNECTION_STRING,
      pollIntervalMinutes: updateData.pollIntervalMinutes ?? 60,
      deleteAfterImport: updateData.deleteAfterImport ?? true,
    },
    update: updateData,
  });

  return NextResponse.json({
    ...config,
    connectionStringEnc: config.connectionStringEnc ? "****" : null,
    accountKeyEnc: config.accountKeyEnc ? "****" : null,
    sasTokenEnc: config.sasTokenEnc ? "****" : null,
  });
}
