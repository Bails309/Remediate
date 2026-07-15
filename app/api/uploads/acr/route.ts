import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";
import { validateAcrCsv } from "@/lib/csv";
import { enqueueUpload, getLockKey } from "@/lib/queue";
import { setProgress } from "@/lib/progress";
import { getStorageProvider } from "@/lib/storage";
import { ScannerType, UploadStatus, UploadType } from "@prisma/client";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const LOCK_TTL_SECONDS = 60 * 30;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * Manual upload endpoint for Azure Container Registry (ACR) vulnerability CSV
 * exports. Mirrors POST /api/uploads/nessus in shape so the client can share
 * error-handling / progress patterns.
 */
export async function POST(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await requireAdmin();
  const formData = await request.formData();
  const file = formData.get("file");
  const siteId = formData.get("siteId")?.toString();

  if (!file || !(file instanceof File) || !siteId) {
    return NextResponse.json({ error: "Missing file or siteId" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds 50MB limit" }, { status: 413 });
  }

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const uploadId = crypto.randomUUID();
  const lockKey = getLockKey(siteId);
  const lock = await redis.set(lockKey, uploadId, "EX", LOCK_TTL_SECONDS, "NX");
  if (!lock) {
    return NextResponse.json(
      { error: "Upload already in progress for this site" },
      { status: 409 },
    );
  }

  const upload = await prisma.uploadHistory.create({
    data: {
      id: uploadId,
      siteId,
      uploadedBy: session.user?.id as string,
      status: UploadStatus.Processing,
      uploadType: UploadType.CSV,
      scannerType: ScannerType.ACR,
      fileName: file.name,
    },
  });

  await setProgress(upload.id, { step: "Uploading file", progress: 0 });

  const text = await file.text();
  const validation = validateAcrCsv(text);
  if (!validation.ok) {
    await prisma.uploadHistory.update({
      where: { id: upload.id },
      data: { status: UploadStatus.Failed },
    });
    await setProgress(upload.id, { step: "Failed", progress: 100 });
    // Release the lock so the user can retry.
    await redis.del(lockKey);
    return NextResponse.json(
      { error: `CSV missing required columns: ${validation.missing.join(", ")}` },
      { status: 400 },
    );
  }

  const storage = await getStorageProvider();
  const storageKey = `acr-${upload.id}.csv`;
  await storage.save(storageKey, text);

  await enqueueUpload(upload.id, storageKey);

  return NextResponse.json({ uploadId: upload.id });
}
