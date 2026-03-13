"use client";

import React, { useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import { ClientDate } from "@/components/ClientDate";
import { ShieldAlert, ExternalLink, Info } from "lucide-react";

interface ThreatVulnerability {
  id: string;
  osvId: string;
  cveId: string | null;
  summary: string;
  details: string | null;
  source: string;
  cvssScore: number | null;
  epssScore: number | null;
  cisaKevStatus: boolean;
  publishedAt: string;
  modifiedAt: string;
}

export function ThreatFeed() {
  const [threats, setThreats] = useState<ThreatVulnerability[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFeed() {
      try {
        const response = await fetch("/api/threat-intelligence/feed?limit=10");
        if (response.ok) {
          const data = await response.json();
          setThreats(data);
        }
      } catch (error) {
        console.error("Failed to fetch threat feed", error);
      } finally {
        setLoading(false);
      }
    }
    fetchFeed();
  }, []);

  if (loading) {
    return (
      <div className="glass glass-edge rounded-[28px] p-8 animate-pulse text-[color:var(--color-foreground)]">
        <div className="mb-6">
          <h3 className="text-xl font-bold flex items-center gap-2 opacity-20">
            <ShieldAlert className="h-6 w-6" />
            Live Threat Intelligence
          </h3>
          <div className="h-4 w-64 bg-slate-200 dark:bg-white/10 rounded mt-2 opacity-20"></div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-100 dark:bg-white/5 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass glass-edge rounded-[28px] p-6 lg:p-8 flex flex-col h-full overflow-hidden">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <ShieldAlert className="text-blue-400 h-6 w-6" />
            Live Threat Intelligence
          </h3>
          <p className="text-sm opacity-60">Global vulnerability feed synchronized in real-time.</p>
        </div>
        <Badge tone="low">Connected</Badge>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
        {threats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center opacity-40">
            <Info className="h-10 w-10 mb-2" />
            <p>No active threats detected in feed.</p>
          </div>
        ) : (
          threats.map((threat) => (
            <div 
              key={threat.id} 
              className="group relative overflow-hidden rounded-2xl bg-black/[0.02] dark:bg-white/5 p-4 transition-all hover:bg-black/[0.04] dark:hover:bg-white/10 border border-slate-200 dark:border-white/5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400/80">
                      {threat.source}
                    </span>
                    <span className="text-xs font-mono opacity-50">
                      {threat.cveId || threat.osvId}
                    </span>
                    {threat.cisaKevStatus && (
                      <Badge tone="critical" className="text-[10px] py-0 px-2 h-4 scale-90">CISA KEV</Badge>
                    )}
                  </div>
                  <h4 className="font-semibold text-sm leading-snug group-hover:text-blue-400 transition-colors">
                    {threat.summary}
                  </h4>
                  <div className="flex items-center gap-4 text-[10px] opacity-60">
                    <div className="flex items-center gap-1.5">
                      <span className="uppercase tracking-widest font-bold opacity-60 text-slate-500 dark:text-slate-400">Pub:</span>
                      <ClientDate date={new Date(threat.publishedAt)} />
                    </div>
                    {threat.modifiedAt !== threat.publishedAt && (
                      <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400/80">
                        <span className="uppercase tracking-widest font-bold opacity-60 text-slate-500 dark:text-slate-400">Upd:</span>
                        <ClientDate date={new Date(threat.modifiedAt)} />
                      </div>
                    )}
                    {threat.cvssScore !== null && (
                      <span className="flex items-center gap-1">
                        CVSS: <span className={threat.cvssScore >= 9 ? "text-red-400" : threat.cvssScore >= 7 ? "text-orange-400" : "text-yellow-400"}>
                          {threat.cvssScore.toFixed(1)}
                        </span>
                      </span>
                    )}
                    {threat.epssScore !== null && (
                      <span>EPSS: {(threat.epssScore * 100).toFixed(2)}%</span>
                    )}
                  </div>
                </div>
                
                <a 
                  href={threat.source === "NVD" && threat.cveId 
                    ? `https://nvd.nist.gov/vuln/detail/${threat.cveId}` 
                    : `https://osv.dev/vulnerability/${threat.osvId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-black/[0.03] dark:bg-white/5 hover:bg-blue-500/20 dark:hover:bg-blue-400/20 text-blue-600 dark:text-blue-400 transition-colors shrink-0"
                  title="View full report"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between text-[10px] opacity-40">
        <p>Source Attribution: NVD, OSV.dev, MSFT, CISA</p>
        <p>Managed by Remediate Intelligence</p>
      </div>
    </div>
  );
}
