import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, WEB_APP_ADMIN_ROLES } from "@/lib/rbac";
import { getGroupContext } from "@/lib/group-rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit-log";
import { getAiConfig } from "@/lib/ai/config";
import { runChat, AiChatError, type ChatTurn } from "@/lib/ai/chat";
import { AiProviderError } from "@/lib/ai/provider";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(24),
});

/** GET reports whether the AI chat should be offered in the UI. */
export async function GET(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  await requireUser();
  const config = await getAiConfig();
  return NextResponse.json({ available: Boolean(config?.enabled) });
}

export async function POST(request: NextRequest) {
  const session = await requireUser();
  const userId = session.user.id!;

  const rate = await enforceRateLimit(request, userId);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const config = await getAiConfig();
  if (!config || !config.enabled) {
    return NextResponse.json(
      { error: "AI chat is not configured. Ask an administrator to enable it in Settings." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid conversation payload." }, { status: 400 });
  }
  const history = parsed.data.messages as ChatTurn[];
  if (history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "The last message must be from the user." }, { status: 400 });
  }

  const isAdmin = (session.user.roles || []).some((r) =>
    (WEB_APP_ADMIN_ROLES as readonly string[]).includes(r),
  );
  const ctx = await getGroupContext(userId);

  let result;
  try {
    result = await runChat(history, config, { isAdmin, memberOf: ctx.memberOf });
  } catch (error) {
    if (error instanceof AiChatError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if (error instanceof AiProviderError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "The AI request failed." }, { status: 500 });
  }

  writeAuditLog({
    userId,
    userEmail: session.user.email!,
    action: "ai_insight_chat",
    entityType: "Vulnerability",
    newValue: {
      question: history[history.length - 1].content,
      tools: result.tools.map((t) => ({ name: t.name, ok: t.ok })),
    },
    ipAddress:
      request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      undefined,
  });

  return NextResponse.json({ reply: result.reply, tools: result.tools });
}
