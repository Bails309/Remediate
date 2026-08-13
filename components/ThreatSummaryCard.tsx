"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Activity } from "lucide-react";
import { Badge } from "@/components/Badge";
import { cn } from "@/components/cn";

interface ThreatVulnerability {
  id: string;
  osvId: string;
  cveId: string | null;
  summary: string;
  cvssScore: number | null;
  cisaKevStatus: boolean;
  source: string;
}

export function ThreatSummaryCard() {
  const [threats, setThreats] = useState<ThreatVulnerability[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBrief() {
      try {
        const response = await fetch("/api/threat-intelligence/feed?limit=4");
        if (response.ok) {
          const data = await response.json();
          setThreats(data);
        }
      } catch (error) {
        console.error("Failed to fetch threat brief", error);
      } finally {
        setLoading(false);
      }
    }
    fetchBrief();
  }, []);

  if (loading) {
    return (
      <div className="glass glass-edge rounded-[28px] p-6 animate-pulse h-full text-[color:var(--color-foreground)]">
        <div className="h-4 w-32 bg-slate-200 dark:bg-white/10 rounded mb-4"></div>
        <div className="space-y-3">
          <div className="h-10 bg-slate-100 dark:bg-white/5 rounded-xl"></div>
          <div className="h-10 bg-slate-100 dark:bg-white/5 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div id="tour-live-intelligence" className="glass glass-edge card-glow spotlight rounded-[28px] p-6 lg:p-8 flex flex-col h-full group hover:bg-black/[0.01] dark:hover:bg-white/[0.02] transition-colors relative overflow-hidden text-[color:var(--color-foreground)]">
      <span aria-hidden className="scanline-sweep" />
      <div className="relative z-10 flex flex-col h-full">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-sm font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Live Intelligence
        </h3>
        <div className="flex items-center gap-3">
           <Badge tone="low" className="text-[10px] uppercase tracking-widest py-0 px-2 h-5 flex items-center gap-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-none">
             <span className="live-dot" aria-hidden />
             Active
           </Badge>
        </div>
      </div>

      <div className="flex-1 min-h-0 space-y-4">
        {threats.length === 0 ? (
          <div className="h-full flex items-center justify-center opacity-40 italic text-sm">
            Scanning global vectors...
          </div>
        ) : (
          threats.map((threat) => (
            <a 
              key={threat.id} 
              href={threat.source === "NVD" && threat.cveId 
                ? `https://nvd.nist.gov/vuln/detail/${threat.cveId}` 
                : `https://osv.dev/vulnerability/${threat.osvId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group/item flex flex-col gap-2 p-4 rounded-[20px] bg-black/[0.02] dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 transition-all hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:scale-[1.01] text-left"
            >
              <div className="flex justify-between items-start gap-4">
                <p className="text-sm leading-relaxed opacity-90 font-medium line-clamp-3">
                  {threat.summary}
                </p>
              </div>
              <div className="flex items-center gap-4 mt-auto">
                <span className="text-[10px] font-bold text-orange-400/80 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-orange-400" />
                  {threat.osvId}
                </span>
                {threat.cvssScore !== null && (
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-widest",
                    threat.cvssScore >= 9 ? "text-red-500" : threat.cvssScore >= 7 ? "text-red-400" : "text-orange-400"
                  )}>
                    CVSS {threat.cvssScore.toFixed(1)}
                  </span>
                )}
                {threat.cisaKevStatus && (
                  <Badge tone="critical" className="text-[9px] py-0 px-1.5 uppercase font-bold border-none bg-red-500/20 text-red-400 ring-1 ring-inset ring-red-500/20">
                    EXPLOITED
                  </Badge>
                )}
              </div>
            </a>
          ))
        )}
      </div>

      <div className="mt-8 pt-4 border-t border-white/5 flex flex-col gap-3">
        <div className="flex justify-between items-center text-[9px] opacity-30 italic px-2">
          <span>Source: NVD, OSV.dev</span>
          <span>Not NVD endorsed.</span>
        </div>
        <div className="flex justify-end">
          <Link 
            href="/threat-intelligence" 
            className="flex items-center gap-2 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors group/link p-2"
          >
            View Intelligence Centre
            <ChevronRight className="h-3 w-3 transition-transform group-hover/link:translate-x-1" />
          </Link>
        </div>
      </div>
      </div>
    </div>
  );
}
