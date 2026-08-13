"use client";

import { useState } from "react";
import { cn } from "@/components/cn";
import { Button } from "@/components/Button";
import { Sparkles, LayoutDashboard, Users, Compass, ShieldCheck } from "lucide-react";

const TOUR_ID = "whats-new-aug-2026-v2160";

const features = [
  {
    icon: LayoutDashboard,
    accent: "text-cyan-500 dark:text-cyan-400",
    bg: "bg-cyan-100 dark:bg-cyan-500/15",
    title: "Build Your Own Dashboards",
    description:
      "Insights → My Dashboards. Create a board, drag and resize widgets, and pick what each one shows — findings by severity, by bucket, by assignee, threat actors by tactic, uploads over time. If AI is switched on you can simply describe the widget you want and it will draft it for you.",
  },
  {
    icon: Users,
    accent: "text-purple-500 dark:text-purple-400",
    bg: "bg-purple-100 dark:bg-purple-500/15",
    title: "Publish A Board, Keep Your Numbers Safe",
    description:
      "Dashboards start private. Publish one and everybody can open it — but each person sees it through their own permissions, because widgets save the question rather than the answer. Found someone else's board useful? Make a copy and tailor it to you.",
  },
  {
    icon: Compass,
    accent: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-500/15",
    title: "Know Your Adversaries",
    description:
      "Intelligence → Threat Actors adds the full MITRE ATT&CK catalogue: 170+ groups with their tactics, tooling, attributed origin and who they target, refreshed automatically. The command centre also gains a Security Score showing your severity-weighted remediation posture at a glance.",
  },
  {
    icon: ShieldCheck,
    accent: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-500/15",
    title: "A Faster Menu, And Tighter Roles",
    description:
      "The sidebar is now a slim rail with hover-out menus you can pin open, grouped into Insights, Intelligence, Inventory, Automation and Settings. Workspace Admins now own their workspace — dashboards, findings, inventory and automation — while site configuration, users and audit logs stay with Site Admins.",
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
          <h2 className="text-2xl font-bold tracking-tight">August 2026 Update — v2.16.0</h2>
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
