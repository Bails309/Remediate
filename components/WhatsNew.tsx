"use client";

import { useState } from "react";
import { cn } from "@/components/cn";
import { Button } from "@/components/Button";
import { Sparkles, LayoutDashboard, Users, Compass, Mail, Wrench } from "lucide-react";

const TOUR_ID = "whats-new-aug-2026-v2170";

const features = [
  {
    icon: Wrench,
    accent: "text-cyan-500 dark:text-cyan-400",
    bg: "bg-cyan-100 dark:bg-cyan-500/15",
    title: "Get A Whole Remediation Package, Not Just Advice",
    description:
      "Open a finding you own and press Generate. You get the plan to fix it, a change request written out in full \u2014 justification, affected systems, implementation steps, risk, service impact and scheduling \u2014 a rollback with the point at which you should abort, the checks that prove the fix worked, and the evidence to keep. Copy it or download it as Markdown. Only the assignee, the group leader or an admin can generate it, and it only ever reads the finding you have open.",
  },
  {
    icon: Mail,
    accent: "text-rose-500 dark:text-rose-400",
    bg: "bg-rose-100 dark:bg-rose-500/15",
    title: "Raise A Ticket With Your Supplier",
    description:
      "Open any finding, ask the assistant to generate a ticket for an external supplier, and you get a ready-to-send write-up — the impact in plain English, the affected package, version and host, the severity, and what you need the vendor to come back with. Nothing internal is included, so it can go straight into an email or a vendor portal.",
  },
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
    icon: Sparkles,
    accent: "text-sky-500 dark:text-sky-400",
    bg: "bg-sky-100 dark:bg-sky-500/15",
    title: "Name Your Assistant",
    description:
      "Give the AI assistant a name of your own under Settings → AI Insights and it will use it on its button, in the chat header, and when it introduces itself. The launcher has also moved to a floating button in the bottom-right corner, freeing up the space above your findings list.",
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
          <h2 className="text-2xl font-bold tracking-tight">August 2026 Update — v2.17.0</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Turn a finding into a plan, a change request, a rollback and the evidence to close it out — plus supplier tickets, your own dashboards and the MITRE ATT&amp;CK actor catalogue.
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
