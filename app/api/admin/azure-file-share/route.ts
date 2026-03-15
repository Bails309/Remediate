import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { encrypt } from "@/lib/crypto";

export async function GET() {
  await requireAdmin();

  const config = await prisma.azureFileShareConfig.findUnique({
    where: { id: "singleton" },
  });

  if (!config) {
    return NextResponse.json({
      enabled: false,
      shareName: "security-scans",
      directoryPath: "/",
      pollIntervalMinutes: 60,
      deleteAfterImport: true,
    });
  }

  // Strip sensitive fields for the UI (just return presence)
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

  const updateData: any = {
    enabled: data.enabled,
    accountName: data.accountName,
    shareName: data.shareName,
    directoryPath: data.directoryPath,
    pollIntervalMinutes: parseInt(data.pollIntervalMinutes) || 60,
    deleteAfterImport: data.deleteAfterImport,
  };

  if (data.connectionString && data.connectionString !== "****") {
    updateData.connectionStringEnc = encrypt(data.connectionString);
  }
  if (data.accountKey && data.accountKey !== "****") {
    updateData.accountKeyEnc = encrypt(data.accountKey);
  }
  if (data.sasToken && data.sasToken !== "****") {
    updateData.sasTokenEnc = encrypt(data.sasToken);
  }

  const config = await prisma.azureFileShareConfig.upsert({
    where: { id: "singleton" },
    update: updateData,
    create: {
      id: "singleton",
      ...updateData,
    },
  });

  return NextResponse.json(config);
}
