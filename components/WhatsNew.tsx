"use client";

import { useState } from "react";
import { cn } from "@/components/cn";
import { Button } from "@/components/Button";
import { Sparkles, ShieldCheck, PackageCheck, Cog, BookOpen } from "lucide-react";

const TOUR_ID = "whats-new-may-2026";

const features = [
  {
    icon: ShieldCheck,
    accent: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-500/15",
    title: "Platform Hardening",
    description:
      "Dependency hygiene release: bullmq, fast-xml-builder, and the wider ioredis runtime have been bumped to their latest patched versions to keep the queue and Azure Blob pipelines current.",
  },
  {
    icon: PackageCheck,
    accent: "text-cyan-500 dark:text-cyan-400",
    bg: "bg-cyan-100 dark:bg-cyan-500/15",
    title: "Deterministic Builds",
    description:
      "package-lock.json has been regenerated and pinned overrides re-asserted so every container build resolves to the exact same dependency tree as CI.",
  },
  {
    icon: Cog,
    accent: "text-violet-500 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-500/15",
    title: "Background Worker Refresh",
    description:
      "The BullMQ worker now runs on 5.76.0, bringing upstream stability fixes for delayed jobs, repeatable schedules, and Redis cluster failover handling.",
  },
  {
    icon: BookOpen,
    accent: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-500/15",
    title: "Refreshed Documentation",
    description:
      "Every top-level doc — README, Architecture, Security, Deployment, and a brand-new API reference — has been updated to match the 2.5.2 release.",
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
          <h2 className="text-2xl font-bold tracking-tight">May 2026 Update — v2.5.2</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            A focused platform-hardening release covering dependencies, build determinism, and documentation.
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
