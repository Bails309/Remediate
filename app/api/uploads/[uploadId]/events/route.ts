import { redis } from "@/lib/redis";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getProgressKey(uploadId: string) {
  return `upload:progress:${uploadId}`;
}

export async function GET(request: NextRequest, context: { params: { uploadId: string } }) {
  const uploadId = context.params.uploadId;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: string) => {
        controller.enqueue(encoder.encode(data));
      };

      send("retry: 2000\n\n");

      const interval = setInterval(async () => {
        const payload = await redis.get(getProgressKey(uploadId));
        if (!payload) {
          return;
        }
        send(`event: progress\n`);
        send(`data: ${payload}\n\n`);
        if (payload.includes("Completed") || payload.includes("Failed")) {
          clearInterval(interval);
          controller.close();
        }
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
