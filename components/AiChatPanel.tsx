"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Search, Package, Loader2 } from "lucide-react";
import { cn } from "@/components/cn";
import { Button } from "@/components/Button";
import { toast } from "@/lib/toast";

type Role = "user" | "assistant";

type ToolInvocation = { name: string; ok: boolean };

type Message = {
  role: Role;
  content: string;
  tools?: ToolInvocation[];
};

const SUGGESTIONS = [
  "Summarise my open vulnerabilities and tell me what to fix first.",
  "Which critical findings already have a fix available?",
  "For my container packages, check if newer versions are released.",
  "What are my most urgent internet-facing issues right now?",
];

const FOCUS_SUGGESTIONS = [
  "Explain this finding in plain English — what's the actual risk?",
  "What are the exact steps to remediate this?",
  "Is there a newer, fixed version of the affected package?",
  "How urgent is this compared to a typical finding?",
  "Generate a ticket to an external supplier.",
];

type Focus = { id: string; title: string; subtitle?: string };

// Mirrors DEFAULT_ASSISTANT_NAME in lib/ai/config; not imported because that
// module pulls in Prisma and must stay out of the client bundle.
const FALLBACK_NAME = "Ask AI";

function toolLabel(name: string): string {
  if (name === "search_vulnerabilities") return "Searched vulnerabilities";
  if (name === "get_latest_version") return "Checked package registry";
  return name;
}

function toolIcon(name: string) {
  if (name === "get_latest_version") return Package;
  return Search;
}

/**
 * Render assistant text. We only ever place strings into React children (which
 * auto-escapes), so there is no HTML-injection surface. Fenced code blocks are
 * shown in a mono block; everything else is whitespace-preserved prose.
 */
function AssistantContent({ text }: { text: string }) {
  const parts = text.split(/```/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            className="my-2 overflow-x-auto rounded-lg bg-slate-900/90 p-3 text-xs text-slate-100 dark:bg-black/50"
          >
            {part.replace(/^\w*\n/, "")}
          </pre>
        ) : (
          <span key={i} className="whitespace-pre-wrap break-words">
            {part}
          </span>
        ),
      )}
    </>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** When set, the conversation is scoped to a single finding. */
  focus?: Focus;
  /** Configured display name; falls back to the product default. */
  name?: string;
};

export function AiChatPanel({ open, onClose, focus, name = FALLBACK_NAME }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Start a fresh conversation whenever the focused finding changes (or when
  // switching between focused and general chat).
  useEffect(() => {
    setMessages([]);
    setInput("");
  }, [focus?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Close on Escape while the panel is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/vulnerabilities/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          ...(focus ? { focusId: focus.id } : {}),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error || "AI chat failed");
        setMessages((prev) => prev.slice(0, -1));
        setInput(question);
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: payload.reply ?? "", tools: payload.tools ?? [] },
      ]);
    } catch {
      toast.error("Network error during AI chat");
      setMessages((prev) => prev.slice(0, -1));
      setInput(question);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const suggestions = focus ? FOCUS_SUGGESTIONS : SUGGESTIONS;

  return (
    <div
      className={cn(
        "group fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-[400px] flex-col overflow-hidden rounded-2xl",
        "h-[min(620px,calc(100vh-6rem))]",
        "border border-white/40 bg-white/90 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/90",
        "shadow-[0_20px_70px_-15px_rgba(2,6,23,0.55)] animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out",
      )}
      role="dialog"
      aria-label={focus ? `${name} about ${focus.title}` : name}
    >
        {/* Accent top edge + ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-accent/15 blur-3xl"
        />

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between border-b border-slate-200/70 px-4 py-3 dark:border-white/10">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-lg shadow-accent/30">
              <Sparkles size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold tracking-tight">
                {focus ? `${name} — ${focus.title}` : name}
              </h3>
              <p className="truncate text-xs opacity-60">
                {focus
                  ? focus.subtitle ?? "Questions about this specific finding."
                  : "Reads your findings and checks for newer releases."}
              </p>
            </div>
          </div>
          <button
            className="rounded-full p-1.5 opacity-60 transition-all hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
            onClick={onClose}
            aria-label={`Close ${name}`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="relative z-10 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm opacity-70">
                {focus ? (
                  <>Ask anything about this finding. The assistant already has its details and can look
                  up whether the affected package has a newer, fixed release.</>
                ) : (
                  <>Ask about your vulnerabilities in plain English. The assistant can search your findings
                  (only what you&apos;re allowed to see) and look up whether packages have newer versions.</>
                )}
              </p>
              <div className="flex flex-col gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-xl border border-slate-200/80 bg-white/40 px-3 py-2 text-left text-sm transition-all hover:-translate-y-px hover:border-accent hover:bg-accent/5 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                  m.role === "user"
                    ? "bg-accent text-white"
                    : "bg-slate-100 text-slate-900 dark:bg-white/5 dark:text-slate-100",
                )}
              >
                {m.role === "assistant" ? <AssistantContent text={m.content} /> : m.content}
                {m.role === "assistant" && m.tools && m.tools.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2 border-t border-black/5 pt-2 dark:border-white/10">
                    {m.tools.map((t, ti) => {
                      const Icon = toolIcon(t.name);
                      return (
                        <span
                          key={ti}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                            t.ok
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                          )}
                        >
                          <Icon size={11} />
                          {toolLabel(t.name)}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm dark:bg-white/5">
                <Loader2 size={14} className="animate-spin text-accent" />
                <span className="opacity-70">Thinking…</span>
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="relative z-10 border-t border-slate-200/70 px-6 py-4 dark:border-white/10">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Ask about your vulnerabilities…"
              className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-white/10 dark:bg-white/[0.04]"
            />
            <Button onClick={() => send(input)} disabled={loading || !input.trim()} title="Send">
              <Send size={16} />
            </Button>
          </div>
          <p className="mt-2 text-[11px] opacity-50">
            AI can make mistakes — verify critical remediation steps. Queries are rate-limited and audited.
          </p>
        </div>
    </div>
  );
}
