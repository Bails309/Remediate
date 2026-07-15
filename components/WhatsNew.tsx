"use client";

import { useState } from "react";
import { cn } from "@/components/cn";
import { Button } from "@/components/Button";
import { Sparkles, Container, CloudDownload, Layers, ShieldCheck, Zap } from "lucide-react";

const TOUR_ID = "whats-new-jul-2026-v280";

const features = [
  {
    icon: Container,
    accent: "text-purple-500 dark:text-purple-400",
    bg: "bg-purple-100 dark:bg-purple-500/15",
    title: "Azure Container Registry Ingest",
    description:
      "A new manual ACR CSV upload option and an automated Azure Blob container poller. Feed ACR vulnerability exports into the same triage queue, dashboards, RBAC, and comments you already use for Nessus — no separate workflow to learn.",
  },
  {
    icon: CloudDownload,
    accent: "text-cyan-500 dark:text-cyan-400",
    bg: "bg-cyan-100 dark:bg-cyan-500/15",
    title: "Automated Blob Container Polling",
    description:
      "Point the new admin console at any Azure Blob container (its own account, container, and credentials — independent from the File Share automation). The scheduler polls on your interval, ingests every matching CSV, and deletes each blob after a successful queueing so rescans land as updates rather than duplicates.",
  },
  {
    icon: Layers,
    accent: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-500/15",
    title: "Multi-Scanner Data Model",
    description:
      "New ScannerType (NESSUS / ACR) scopes every reconciliation query. An ACR scan of a bucket never archives a Nessus finding (and vice versa) — even when they hit the same bucket in the same second. Future scanner families slot in the same way.",
  },
  {
    icon: ShieldCheck,
    accent: "text-sky-500 dark:text-sky-400",
    bg: "bg-sky-100 dark:bg-sky-500/15",
    title: "Encrypted Blob Credentials",
    description:
      "Connection strings, account keys, and SAS tokens for the blob-ingest config are always AES-256-GCM encrypted at rest. The admin console shows a **** sentinel and treats **** on save as ‘keep the existing value’, matching the OIDC / SMTP / storage pattern you already know.",
  },
  {
    icon: Zap,
    accent: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-500/15",
    title: "BullMQ Stuck-Uploads Fix",
    description:
      "v2.7.1 hardened the worker against Azure Redis idle-socket drops: every BullMQ Queue and Worker now owns its own connection with keepAlive and explicit reconnect-on-error triggers. A rolling QueueDepth log and a new diagnose-queue script keep the next incident visible in seconds, not hours.",
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
          <h2 className="text-2xl font-bold tracking-tight">July 2026 Update — v2.8.0</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Azure Container Registry vulnerability ingest — manual + automated — a new multi-scanner data model, and a long-term BullMQ hardening fix.
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
