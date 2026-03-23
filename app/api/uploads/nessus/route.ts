import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";
import { validateNessusCsv } from "@/lib/csv";
import { enqueueUpload, getLockKey } from "@/lib/queue";
import { setProgress } from "@/lib/progress";
import { UploadStatus } from "@prisma/client";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const LOCK_TTL_SECONDS = 60 * 30;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

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
    return NextResponse.json({ error: "Upload already in progress for this site" }, { status: 409 });
  }

  const upload = await prisma.uploadHistory.create({
    data: {
      id: uploadId,
      siteId,
      uploadedBy: session.user?.id as string,
      status: UploadStatus.Processing,
      fileName: file.name,
    },
  });

  await setProgress(upload.id, { step: "Uploading file", progress: 0 });
  const text = await file.text();

  const validation = validateNessusCsv(text);
  if (!validation.ok) {
    await prisma.uploadHistory.update({
      where: { id: upload.id },
      data: { status: UploadStatus.Failed },
    });
    await setProgress(upload.id, { step: "Failed", progress: 100 });
    await redis.del(lockKey);
    return NextResponse.json({ error: `Missing required headers: ${validation.missing?.join(", ")}` }, { status: 400 });
  }

  const { getStorageProvider } = await import("@/lib/storage");
  const storage = await getStorageProvider();
  const storageKey = `nessus-${upload.id}.csv`;
  await storage.save(storageKey, text);

  await setProgress(upload.id, { step: "Queued", progress: 5 });
  await enqueueUpload(upload.id, storageKey);

  return NextResponse.json({ uploadId: upload.id });
}
