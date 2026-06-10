"use client";

import { useState } from "react";
import { cn } from "@/components/cn";
import { Button } from "@/components/Button";
import { Sparkles, Users, Eye, Crown, Mail, ShieldCheck, ListChecks } from "lucide-react";

const TOUR_ID = "whats-new-jun-2026-v270";

const features = [
  {
    icon: Users,
    accent: "text-violet-500 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-500/15",
    title: "Groups & Departments",
    description:
      "Vulnerabilities can now be owned by organisational groups (departments). Admins manage groups under Admin → Groups; add members, promote leaders, and rename or dissolve groups when teams reshape. Each group keeps its own queue, history, and analytics scope.",
  },
  {
    icon: Eye,
    accent: "text-rose-500 dark:text-rose-400",
    bg: "bg-rose-100 dark:bg-rose-500/15",
    title: "Visibility Wall — Not Just a Filter",
    description:
      "When a vulnerability is assigned to a group, only that group's members and leaders (plus admins) can see it — across the table, the side-sheet, direct URLs, and the API. Items with no group remain visible to everyone in the open queue.",
  },
  {
    icon: Crown,
    accent: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-500/15",
    title: "Leader Powers, Bounded",
    description:
      "Leaders can edit status / CR / collaboration for any item their group owns, and reassign work between members of their own group. They cannot move items between groups or grant themselves visibility outside their group — only admins can do that.",
  },
  {
    icon: Mail,
    accent: "text-cyan-500 dark:text-cyan-400",
    bg: "bg-cyan-100 dark:bg-cyan-500/15",
    title: "Weekly Leader Digest",
    description:
      "Every group leader now receives a weekly per-group Leader Digest summarising every active item their group owns — grouped by assignee with an Unassigned bucket — alongside the existing individual-assignment digest. One click jumps straight to the group's queue.",
  },
  {
    icon: ListChecks,
    accent: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-500/15",
    title: "Group-Aware Vulnerabilities Table",
    description:
      "New Group MultiSelect filter on the vulnerabilities page; a Leader badge on rows you lead; an admin-only Group column for moving items between groups inline; and Assign-to-Me scoped to items the visibility wall lets you pick up.",
  },
  {
    icon: ShieldCheck,
    accent: "text-sky-500 dark:text-sky-400",
    bg: "bg-sky-100 dark:bg-sky-500/15",
    title: "Pentest Hardening",
    description:
      "Removed the deprecated X-Frame-Options header (clickjacking is already prevented by CSP frame-ancestors 'none') after an external pentest flagged the redundancy. CI line coverage rises to 69.3% with 39 new RBAC and group-API tests.",
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
          <h2 className="text-2xl font-bold tracking-tight">June 2026 Update — v2.7.0</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Enterprise Group / Department RBAC, a server-enforced visibility wall, weekly Leader Digests, and a deprecated header retired.
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
