"use client";

import { useState } from "react";
import { cn } from "@/components/cn";
import { Button } from "@/components/Button";
import { Sparkles, MessageSquareText, ShieldCheck, Plug, SlidersHorizontal } from "lucide-react";

const TOUR_ID = "whats-new-aug-2026-v2100";

const features = [
  {
    icon: MessageSquareText,
    accent: "text-purple-500 dark:text-purple-400",
    bg: "bg-purple-100 dark:bg-purple-500/15",
    title: "Chat With Your Vulnerabilities",
    description:
      "The ‘Ask AI’ bar on the Vulnerabilities page is now a full multi-turn assistant. Ask it to ‘summarise my open issues and tell me what to fix first’, then follow up — it reads your actual findings and answers in plain English so you can prioritise hundreds of items without scrolling through them.",
  },
  {
    icon: ShieldCheck,
    accent: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-500/15",
    title: "Only What You're Allowed To See",
    description:
      "The assistant reads findings through an RBAC-scoped search tool: it can only ever see the rows you could already see under the same group-visibility rules as the normal list. Searches are schema-validated with no raw SQL, so a manipulated prompt can’t widen your access.",
  },
  {
    icon: Plug,
    accent: "text-cyan-500 dark:text-cyan-400",
    bg: "bg-cyan-100 dark:bg-cyan-500/15",
    title: "Live ‘Is There A Newer Version?’ Checks",
    description:
      "Ask about upgrades and the assistant queries public package registries — npm, PyPI, NuGet, Maven, RubyGems, crates.io, Packagist and Go — to tell you whether a fixed release exists and how far behind you are.",
  },
  {
    icon: SlidersHorizontal,
    accent: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-500/15",
    title: "Admin-Gated & Auditable",
    description:
      "Still optional and off by default. Admins configure a tool-calling provider (Azure OpenAI, Azure AI Foundry, or any OpenAI-compatible endpoint — including self-hosted) under Settings > AI Insights. Every turn is rate-limited and written to the audit log. Note: enabling it shares the findings you can see with your chosen model.",
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
          <h2 className="text-2xl font-bold tracking-tight">August 2026 Update — v2.10.0</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            The AI Assistant: chat about your findings, get a prioritised plan, and check for newer package versions. RBAC-scoped and admin-gated.
          </p>
        </div>

        {/* Feature list */}
        <div className="px-8 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
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
