"use client";

import { useState } from "react";
import { cn } from "@/components/cn";
import { Button } from "@/components/Button";
import { Sparkles, FileText, ShieldCheck, ListChecks, Highlighter, Globe, PackageCheck } from "lucide-react";

const TOUR_ID = "whats-new-may-2026-v262";

const features = [
  {
    icon: FileText,
    accent: "text-rose-500 dark:text-rose-400",
    bg: "bg-rose-100 dark:bg-rose-500/15",
    title: "Built-in Pentest PDF Parser",
    description:
      "Trustmarque CHECK reports are now parsed entirely in-process — no external API, no encrypted API key, no outbound network calls, no admin configuration. Upload a PDF on the Uploads page and findings land in the same vulnerability table that drives assign / archive / remediate.",
  },
  {
    icon: ListChecks,
    accent: "text-cyan-500 dark:text-cyan-400",
    bg: "bg-cyan-100 dark:bg-cyan-500/15",
    title: "Examples & References on Vulnerability Details",
    description:
      "Each finding's Examples block (proof-of-concept payloads, request/response evidence) is persisted to plugin output and rendered in a wrapped monospace panel. References are split out as clickable links so you can jump straight to the source guidance.",
  },
  {
    icon: Highlighter,
    accent: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-500/15",
    title: "Highlighted Evidence Preserved",
    description:
      "Yellow highlights from the source PDF — the assessor's focal points — are surfaced inline in the Examples panel as <mark> spans, scoped to the exact finding and occurrence the assessor flagged. No bleed across findings, no fragment artefacts.",
  },
  {
    icon: Globe,
    accent: "text-violet-500 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-500/15",
    title: "Internet-Facing Badge",
    description:
      "Findings whose plugin id starts with `PT` are flagged with an amber globe badge across the vulnerabilities list and the details side-sheet, so external-attack-surface issues stand out at a glance.",
  },
  {
    icon: PackageCheck,
    accent: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-500/15",
    title: "Parser Hardening",
    description:
      "Multi-line hostnames in Systems Affected tables are merged with their IP/port row (no more duplicate findings), hostnames win over IPs when both are present, and stray Wingdings bullet glyphs that decoded to a trailing `n` are now stripped from issue titles.",
  },
  {
    icon: ShieldCheck,
    accent: "text-sky-500 dark:text-sky-400",
    bg: "bg-sky-100 dark:bg-sky-500/15",
    title: "Six Advisories Cleared",
    description:
      "v2.6.2 patches one high-severity and five moderate-severity npm advisories: Next.js 16.2.6 (13 GHSA fixes), bullmq 5.76.8 (uuid bounds check), fast-xml-parser 5.8.0, postcss 8.5.10, uuid 14.0.0. `npm audit --audit-level=high --omit=dev` now reports 0 vulnerabilities.",
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
          <h2 className="text-2xl font-bold tracking-tight">May 2026 Update — v2.6.2</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            A self-contained pentest PDF pipeline, richer finding evidence, internet-facing visibility, and a clean security audit.
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
