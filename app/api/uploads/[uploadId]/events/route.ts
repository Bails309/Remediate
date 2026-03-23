import { redis } from "@/lib/redis";
import { requireUser } from "@/lib/rbac";
import { canAccessUpload } from "@/lib/upload-access";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getProgressKey(uploadId: string) {
  return `upload:progress:${uploadId}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ uploadId: string }> }) {
  const session = await requireUser();
  const { uploadId } = await params;

  if (!(await canAccessUpload(session, uploadId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: string) => {
        controller.enqueue(encoder.encode(data));
      };

      const sendProgress = async () => {
        const payload = await redis.get(getProgressKey(uploadId));
        if (!payload) {
          return false;
        }
        send(`event: progress\n`);
        send(`data: ${payload}\n\n`);
        return payload.includes("Completed") || payload.includes("Failed");
      };

      send("retry: 2000\n\n");

      const shouldClose = await sendProgress();
      if (shouldClose) {
        controller.close();
        return;
      }

      const interval = setInterval(async () => {
        const completed = await sendProgress();
        if (completed) {
          clearInterval(interval);
          controller.close();
          return;
        }
        send(": ping\n\n");
      }, 1500);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
