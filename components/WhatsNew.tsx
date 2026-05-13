"use client";

import { useState } from "react";
import { cn } from "@/components/cn";
import { Button } from "@/components/Button";
import { Sparkles, FileText, Settings, Workflow, FileSearch, KeyRound, Activity } from "lucide-react";

const TOUR_ID = "whats-new-may-2026-pdf";

const features = [
  {
    icon: FileText,
    accent: "text-rose-500 dark:text-rose-400",
    bg: "bg-rose-100 dark:bg-rose-500/15",
    title: "Pentest PDF Uploads",
    description:
      "The Uploads page now has a CSV / PDF toggle. Pentest reports submitted as PDFs are forwarded to a configurable PDF Processing API and the returned findings are ingested into the same vulnerability table — inheriting assign, archive, and remediation workflows.",
  },
  {
    icon: Settings,
    accent: "text-cyan-500 dark:text-cyan-400",
    bg: "bg-cyan-100 dark:bg-cyan-500/15",
    title: "PDF Processing Settings",
    description:
      "A new Admin → Settings → PDF Processing tab lets you configure the API URL, API key, request timeout, and a master enable switch. The key is encrypted at rest with AUTH_SECRET, never echoed back, and surfaces a fingerprint for verification.",
  },
  {
    icon: KeyRound,
    accent: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-500/15",
    title: "Configurable Auth Scheme",
    description:
      "Choose how Remediate authenticates to the PDF Processing API: X-API-Key, Authorization: Bearer, both, or none. Logic App–backed APIs that reject dual-scheme requests are now first-class citizens.",
  },
  {
    icon: FileSearch,
    accent: "text-violet-500 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-500/15",
    title: "Test With a Real PDF",
    description:
      "The Test Connection panel now has a drop-zone for an optional real pentest PDF. The file is sent once to your configured API and discarded — never stored, never ingested. It's the definitive end-to-end check for upstream services that trip on the synthetic 50-byte test PDF.",
  },
  {
    icon: Activity,
    accent: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-500/15",
    title: "Live Progress, Now Actually Live",
    description:
      "Long extraction waits no longer feel frozen. A pulsing dot, a shimmering progress bar, a live elapsed timer, and a rotating tip strip keep you informed while the upstream API works through your report.",
  },
  {
    icon: Workflow,
    accent: "text-sky-500 dark:text-sky-400",
    bg: "bg-sky-100 dark:bg-sky-500/15",
    title: "Dual Worker Runtime",
    description:
      "The background worker now runs CSV and PDF pipelines in parallel on dedicated BullMQ queues, so large pentest reports never block live Nessus ingest.",
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
          <h2 className="text-2xl font-bold tracking-tight">May 2026 Update — v2.6.0</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Pentest PDF uploads, configurable auth, real-PDF testing, and a live progress UI that finally feels alive.
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
