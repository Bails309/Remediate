"use client";

import { useState } from "react";
import { cn } from "@/components/cn";
import { Button } from "@/components/Button";
import { Sparkles, ArchiveRestore, UserCheck, ShieldCheck, Layers } from "lucide-react";

const TOUR_ID = "whats-new-aug-2026-v2150";

const features = [
  {
    icon: ArchiveRestore,
    accent: "text-purple-500 dark:text-purple-400",
    bg: "bg-purple-100 dark:bg-purple-500/15",
    title: "Archiving Is No Longer A One-Way Door",
    description:
      "Marked something Remediated by mistake? Called a false positive that turned out to be real? Switch the Vulnerabilities page to ‘Archived Findings’, open the record, and hit ‘Restore to active queue’. It comes straight back as Open, ready to be worked again — no database surgery required.",
  },
  {
    icon: UserCheck,
    accent: "text-cyan-500 dark:text-cyan-400",
    bg: "bg-cyan-100 dark:bg-cyan-500/15",
    title: "It Comes Back With Its History Intact",
    description:
      "A restored finding keeps its original ID, assignee, group, CR number and scan details — including container registry, repository and image digest for ACR findings. It lands back with the person who owned it rather than dropping into the unassigned pile, so nobody has to reconstruct the context.",
  },
  {
    icon: ShieldCheck,
    accent: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-500/15",
    title: "Admin-Only, And Fully Audited",
    description:
      "Assignees and group leaders can archive a finding, but only administrators can reverse one — the archive is the record that someone accepted a risk or signed off a fix. Every restore is written to the audit log as ‘vulnerability.restored’, showing who reopened what and which decision they overrode.",
  },
  {
    icon: Layers,
    accent: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-500/15",
    title: "No Accidental Duplicates",
    description:
      "If a scan has already re-detected the finding since it was archived, Remediate blocks the restore and tells you the live record already exists — so you can’t end up with two copies of the same issue drifting apart in triage and double-counting in your analytics.",
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
          <h2 className="text-2xl font-bold tracking-tight">August 2026 Update — v2.15.0</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Bring an archived finding back into the active queue as Open — with its owner, group and scan details intact. Admin-only and fully audited.
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
