"use client";

import { useState } from "react";
import { MessageSquarePlus, Bug, Lightbulb, MessageCircle, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { toast } from "@/lib/toast";

const TYPES = [
  { value: "bug" as const, label: "Bug Report", icon: Bug },
  { value: "feature" as const, label: "Feature Request", icon: Lightbulb },
  { value: "general" as const, label: "General", icon: MessageCircle },
] as const;

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"bug" | "feature" | "general">("general");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pathname = usePathname();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 5) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message: message.trim(), page: pathname }),
      });

      if (res.ok) {
        toast.success("Feedback submitted — thank you!");
        setMessage("");
        setOpen(false);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to submit feedback");
      }
    } catch {
      toast.error("Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Send Feedback"
        className="flex w-full items-center gap-3 rounded-[20px] px-4 py-3 text-sm font-medium text-[color:var(--color-foreground)] opacity-60 transition-all hover:bg-black/5 dark:hover:bg-white/5 hover:opacity-100 group"
      >
        <MessageSquarePlus size={18} className="group-hover:scale-110 transition-transform" />
        Feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-[color:var(--color-surface)] border border-white/10 p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Send Feedback</h2>
              <button onClick={() => setOpen(false)} className="rounded-full p-1 hover:bg-white/10 transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-2">
                {TYPES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all border ${
                        type === t.value
                          ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)]"
                          : "border-white/10 opacity-60 hover:opacity-100"
                      }`}
                    >
                      <Icon size={14} />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your feedback..."
                rows={4}
                maxLength={5000}
                required
                minLength={5}
                className="w-full rounded-xl border border-white/10 bg-black/5 dark:bg-white/5 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)] resize-none"
              />

              <div className="flex items-center justify-between">
                <span className="text-xs opacity-40">{message.length}/5000</span>
                <button
                  type="submit"
                  disabled={submitting || message.trim().length < 5}
                  className="rounded-xl bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? "Sending..." : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
