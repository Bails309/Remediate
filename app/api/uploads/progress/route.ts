import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { canAccessUpload } from "@/lib/upload-access";
import { forLog } from "@/lib/log-safe";
import { UploadStatus } from "@prisma/client";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROGRESS_READ_TIMEOUT_MS = 2_000;

function getProgressKey(uploadId: string) {
  return `upload:progress:${uploadId}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Redis read timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function GET(request: NextRequest) {
  const session = await requireUser();
  const { searchParams } = new URL(request.url);
  const uploadId = searchParams.get("uploadId");

  if (!uploadId) {
    return NextResponse.json({ progress: null }, { status: 400 });
  }

  if (!(await canAccessUpload(session, uploadId))) {
    return NextResponse.json({ progress: null }, { status: 404 });
  }

  // Live progress lives in Redis. Cap the read so a degraded Redis (whose
  // commands can queue indefinitely) can't hang the polling request.
  let payload: string | null = null;
  try {
    payload = await withTimeout(redis.get(getProgressKey(uploadId)), PROGRESS_READ_TIMEOUT_MS);
  } catch (error) {
    // uploadId is caller-supplied and admins skip the existence check, so it
    // must not land in the format-string position.
    console.warn("[Progress] Redis read failed, falling back to DB. uploadId=%s", forLog(uploadId), error);
  }

  if (payload) {
    try {
      const progress = JSON.parse(payload) as { step?: string; progress?: number };
      return NextResponse.json({ progress });
    } catch (error) {
      console.error("Failed to parse progress payload", error);
    }
  }

  // Fallback: the Redis key is missing/expired or Redis is unavailable. Derive
  // a terminal state from the authoritative upload status in Postgres so the
  // client can still resolve a finished upload even if the final progress write
  // never landed in Redis.
  const upload = await prisma.uploadHistory.findUnique({
    where: { id: uploadId },
    select: { status: true, rowCount: true },
  });

  if (upload?.status === UploadStatus.Completed) {
    return NextResponse.json({
      progress: { step: "Completed", progress: 100, total: upload.rowCount ?? undefined },
    });
  }

  if (upload?.status === UploadStatus.Failed) {
    return NextResponse.json({ progress: { step: "Failed", progress: 100 } });
  }

  return NextResponse.json({ progress: null });
}
