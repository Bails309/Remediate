import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  enqueueUpload,
  getLockKey,
  getPayload,
  getRetryCount,
  listDeadLetters,
  removeDeadLetter,
  removeDeadLetters,
  resetRetry,
  deletePayload,
} from "@/lib/queue";
import { redis } from "@/lib/redis";
import type { NextRequest } from "next/server";

const LOCK_TTL_SECONDS = 60 * 30;

export async function GET() {
  await requireAdmin();
  const ids = await listDeadLetters(50);

  const uploads = await prisma.uploadHistory.findMany({
    where: { id: { in: ids } },
    include: { site: true, uploader: true },
  });

  const map = new Map(uploads.map((upload) => [upload.id, upload]));
  const items = await Promise.all(
    ids.map(async (id) => {
      const upload = map.get(id);
      const retryCount = await getRetryCount(id);
      return {
        id,
        retryCount,
        status: upload?.status ?? "Unknown",
        fileName: upload?.fileName ?? null,
        siteName: upload?.site?.name ?? null,
        uploadedBy: upload?.uploader?.name ?? null,
        uploadDate: upload?.uploadDate?.toISOString() ?? null,
      };
    })
  );

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  await requireAdmin();
  const body = (await request.json()) as { uploadId?: string };
  if (!body.uploadId) {
    return NextResponse.json({ error: "Missing uploadId" }, { status: 400 });
  }

  const payload = await getPayload(body.uploadId);
  if (!payload) {
    return NextResponse.json({ error: "Payload expired" }, { status: 410 });
  }

  const upload = await prisma.uploadHistory.findUnique({ where: { id: body.uploadId } });
  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  const lockKey = getLockKey(upload.siteId);
  const lock = await redis.set(lockKey, "admin", "EX", LOCK_TTL_SECONDS, "NX");
  if (!lock) {
    return NextResponse.json({ error: "Upload already in progress for this site" }, { status: 409 });
  }

  await removeDeadLetter(body.uploadId);
  await resetRetry(body.uploadId);
  await enqueueUpload(body.uploadId, payload);

  return NextResponse.json({ ok: true });
}

export async function PUT() {
  await requireAdmin();
  const ids = await listDeadLetters(200);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, requeued: 0, skipped: 0 });
  }

  const uploads = await prisma.uploadHistory.findMany({ where: { id: { in: ids } } });
  const uploadMap = new Map(uploads.map((upload) => [upload.id, upload]));

  let requeued = 0;
  let skipped = 0;
  for (const id of ids) {
    const upload = uploadMap.get(id);
    if (!upload) {
      skipped += 1;
      continue;
    }

    const payload = await getPayload(id);
    if (!payload) {
      skipped += 1;
      continue;
    }

    const lockKey = getLockKey(upload.siteId);
    const lock = await redis.set(lockKey, "admin", "EX", LOCK_TTL_SECONDS, "NX");
    if (!lock) {
      skipped += 1;
      continue;
    }

    await removeDeadLetter(id);
    await resetRetry(id);
    await enqueueUpload(id, payload);
    requeued += 1;
  }

  return NextResponse.json({ ok: true, requeued, skipped });
}

export async function DELETE(request: NextRequest) {
  await requireAdmin();
  const body = (await request.json().catch(() => ({}))) as { days?: number };
  const days = body.days ?? 7;
  const threshold = Date.now() - days * 24 * 60 * 60 * 1000;

  const ids = await listDeadLetters(500);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, purged: 0 });
  }

  const uploads = await prisma.uploadHistory.findMany({
    where: { id: { in: ids } },
  });
  const uploadMap = new Map(uploads.map((upload) => [upload.id, upload]));

  const purgeIds: string[] = [];
  for (const id of ids) {
    const upload = uploadMap.get(id);
    if (!upload) {
      purgeIds.push(id);
      continue;
    }
    if (upload.uploadDate.getTime() < threshold) {
      purgeIds.push(id);
    }
  }

  await removeDeadLetters(purgeIds);
  for (const id of purgeIds) {
    await deletePayload(id);
    await resetRetry(id);
  }

  return NextResponse.json({ ok: true, purged: purgeIds.length });
}
