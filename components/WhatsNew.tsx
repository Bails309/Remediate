"use client";

import { useState } from "react";
import { cn } from "@/components/cn";
import { Button } from "@/components/Button";
import { Sparkles, MessageSquareText, ShieldCheck, Plug, SlidersHorizontal } from "lucide-react";

const TOUR_ID = "whats-new-aug-2026-v290";

const features = [
  {
    icon: MessageSquareText,
    accent: "text-purple-500 dark:text-purple-400",
    bg: "bg-purple-100 dark:bg-purple-500/15",
    title: "Ask AI in Plain English",
    description:
      "A new ‘Ask AI’ bar on the Vulnerabilities page lets you skip the manual filters. Ask ‘show me the most critical vulnerabilities that already have fixes available’ or ‘which packages should I prioritise updating first?’ and get a focused, sorted result set instantly.",
  },
  {
    icon: ShieldCheck,
    accent: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-500/15",
    title: "Privacy-First by Design",
    description:
      "The AI never sees your vulnerability data. It only turns your question into a strict, schema-validated query plan that Remediate runs itself — under the exact same RBAC and group-visibility rules as the normal list. Prompt-injection can’t widen what you’re allowed to see.",
  },
  {
    icon: Plug,
    accent: "text-cyan-500 dark:text-cyan-400",
    bg: "bg-cyan-100 dark:bg-cyan-500/15",
    title: "Bring Your Own Provider",
    description:
      "Works with Azure OpenAI, Azure AI Foundry, or any OpenAI-compatible /v1 endpoint — including self-hosted models like Ollama for fully air-gapped estates. Endpoint and API key are AES-256-GCM encrypted at rest, just like your OIDC and SMTP secrets.",
  },
  {
    icon: SlidersHorizontal,
    accent: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-500/15",
    title: "Enable It in Settings",
    description:
      "AI Insights is optional and off by default. Admins configure a provider under Settings > AI Insights, use Test Connection to verify credentials, and flip it on. Every AI query is rate-limited and written to the audit log for full reviewability.",
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
          <h2 className="text-2xl font-bold tracking-tight">August 2026 Update — v2.9.0</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            AI-Powered Insights: ask about your vulnerabilities in plain English. Privacy-first, provider-agnostic, and admin-gated.
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
