"use client";

import { useState } from "react";
import { cn } from "@/components/cn";
import { Button } from "@/components/Button";
import { Sparkles, Sun, BarChart3, MessageSquare, MessageCircle } from "lucide-react";

const TOUR_ID = "whats-new-apr-2026";

const features = [
  {
    icon: Sun,
    accent: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-500/15",
    title: "Sunset Status",
    description:
      "Mark vulnerabilities as Sunset to keep them visible in your triage queue while excluding them from analytics metrics.",
  },
  {
    icon: BarChart3,
    accent: "text-violet-500 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-500/15",
    title: "Sunset Analytics",
    description:
      "A dedicated section in Analytics tracks all sunset items with risk breakdown and host distribution charts.",
  },
  {
    icon: MessageSquare,
    accent: "text-cyan-500 dark:text-cyan-400",
    bg: "bg-cyan-100 dark:bg-cyan-500/15",
    title: "Comments Revamp",
    description:
      "Add, edit, and delete comments on vulnerabilities. Admins, assignees, and collaborators can all participate.",
  },
  {
    icon: MessageCircle,
    accent: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-500/15",
    title: "Comment Indicators",
    description:
      "A comment count badge now appears on each issue row so you can see active discussions at a glance.",
  },
];

interface Props {
  completedTours: string[];
}

export function WhatsNew({ completedTours }: Props) {
  const alreadySeen = completedTours.includes(TOUR_ID);
  const [open, setOpen] = useState(!alreadySeen);

  if (!open) return null;

  const handleDismiss = async () => {
    setOpen(false);
    try {
      await fetch("/api/tours/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tourId: TOUR_ID }),
      });
    } catch {
      /* best-effort */
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={handleDismiss} />
      <div
        className={cn(
          "relative w-full max-w-lg overflow-hidden rounded-[28px] border border-white/10 shadow-2xl animate-in zoom-in-95 duration-300",
          "bg-white/95 backdrop-blur-xl dark:bg-slate-900/95 text-slate-900 dark:text-white"
        )}
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-2">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={18} className="text-cyan-500 dark:text-[#00C8FF]" />
            <span className="text-xs font-bold uppercase tracking-widest text-cyan-600 dark:text-[#00C8FF]">
              What&apos;s New
            </span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">April 2026 Update</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Here&apos;s what&apos;s been added since your last visit.
          </p>
        </div>

        {/* Feature list */}
        <div className="px-8 py-5 space-y-4">
          {features.map((f) => (
            <div key={f.title} className="flex items-start gap-4">
              <div className={cn("shrink-0 rounded-xl p-2.5", f.bg)}>
                <f.icon size={18} className={f.accent} />
              </div>
              <div>
                <p className="text-sm font-bold">{f.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">
                  {f.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-slate-200/60 dark:border-white/5 flex justify-end">
          <Button onClick={handleDismiss}>Got it</Button>
        </div>
      </div>
    </div>
  );
}
