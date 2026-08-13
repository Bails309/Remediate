"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/Input";
import { EmptyState } from "@/components/EmptyState";
import { ClientDate } from "@/components/ClientDate";
import { CountryFlag } from "@/components/CountryFlag";
import { BrandIcon, hasBrandIcon } from "@/components/BrandIcon";
import { cn } from "@/components/cn";
import { ExternalLink, Users, Crosshair, Wrench, Landmark, Shield, Cpu, RadioTower, Banknote, HeartPulse, Zap, GraduationCap, Factory, ShoppingCart, Truck, Newspaper, HeartHandshake, Mail, KeyRound, Cloud, Network, Box, Database, Server, FileUp, Globe, Router, MonitorSmartphone, Package, Smartphone, Gauge, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const TECH_ICONS: Record<string, LucideIcon> = {
  "Microsoft Exchange": Mail,
  "Active Directory": KeyRound,
  "Microsoft 365": Cloud,
  "Azure / Entra ID": Cloud,
  "VPN Appliances": Network,
  Citrix: MonitorSmartphone,
  "VMware / ESXi": Server,
  "Atlassian Confluence": FileUp,
  "Apache / Log4j": Terminal,
  Linux: Terminal,
  "Containers / Kubernetes": Box,
  "Cloud Storage": Cloud,
  "Web Servers": Globe,
  Databases: Database,
  "Managed File Transfer": FileUp,
  "Network Devices": Router,
  "Remote Access Tools": MonitorSmartphone,
  "Supply Chain Software": Package,
  "Mobile Devices": Smartphone,
  "ICS / OT": Gauge,
};

const SECTOR_ICONS: Record<string, LucideIcon> = {
  Government: Landmark,
  Defense: Shield,
  Technology: Cpu,
  Telecommunications: RadioTower,
  Finance: Banknote,
  Healthcare: HeartPulse,
  Energy: Zap,
  Education: GraduationCap,
  Manufacturing: Factory,
  Retail: ShoppingCart,
  Transportation: Truck,
  Media: Newspaper,
  NGO: HeartHandshake,
};

function SectorIcon({ sector, className }: { sector: string; className?: string }) {
  const Icon = SECTOR_ICONS[sector];
  if (!Icon) return null;
  return <Icon className={cn("h-3.5 w-3.5 shrink-0 text-[color:var(--color-accent)]", className)} aria-hidden />;
}

type ThreatActor = {
  id: string;
  externalId: string;
  name: string;
  aliases: string[];
  description: string | null;
  actorType: string | null;
  origin: string | null;
  targetSectors: string[];
  targetRegions: string[];
  targetTechnologies: string[];
  tactics: string[];
  software: string[];
  techniqueCount: number;
  url: string | null;
  lastModified: string;
};

const REGION_COLUMNS = ["North America", "Western Europe", "Middle East", "East Asia", "Southeast Asia"];

function countBy(actors: ThreatActor[], pick: (actor: ThreatActor) => string[]) {
  const counts = new Map<string, number>();
  for (const actor of actors) {
    for (const value of pick(actor)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function ThreatActorsClient() {
  const [actors, setActors] = useState<ThreatActor[]>([]);
  const [total, setTotal] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tactic, setTactic] = useState<string | null>(null);
  const [actorType, setActorType] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (query.trim()) params.set("q", query.trim());
    if (tactic) params.set("tactic", tactic);
    if (actorType) params.set("type", actorType);

    const response = await fetch(`/api/threat-intelligence/actors?${params.toString()}`);
    if (!response.ok) {
      setLoading(false);
      return;
    }
    const data = await response.json();
    setActors(data.actors ?? []);
    setTotal(data.total ?? 0);
    setLastSyncedAt(data.lastSyncedAt ?? null);
    setLoading(false);
  }, [query, tactic, actorType]);

  useEffect(() => {
    const handle = setTimeout(() => void load(), 250);
    return () => clearTimeout(handle);
  }, [load]);

  const topTactics = useMemo(() => countBy(actors, (actor) => actor.tactics).slice(0, 5), [actors]);
  const topSoftware = useMemo(() => countBy(actors, (actor) => actor.software).slice(0, 5), [actors]);
  const topTechnologies = useMemo(() => countBy(actors, (actor) => actor.targetTechnologies ?? []).slice(0, 5), [actors]);
  const heatmap = useMemo(() => {
    const sectors = countBy(actors, (actor) => actor.targetSectors).slice(0, 4).map(([sector]) => sector);
    return sectors.map((sector) => ({
      sector,
      cells: REGION_COLUMNS.map((region) => ({
        region,
        count: actors.filter((actor) => actor.targetSectors.includes(sector) && actor.targetRegions.includes(region)).length,
      })),
    }));
  }, [actors]);

  const heatmapPeak = Math.max(1, ...heatmap.flatMap((row) => row.cells.map((cell) => cell.count)));

  return (
    <div className="space-y-6">
      <div className="glass glass-edge flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search actors, aliases or MITRE ID…"
          aria-label="Search threat actors"
          className="max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          {["State Sponsored", "Cybercrime", "Hacktivist"].map((type) => (
            <button
              key={type}
              onClick={() => setActorType((current) => (current === type ? null : type))}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                actorType === type
                  ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)]"
                  : "border-[color:var(--color-border)] opacity-70 hover:opacity-100"
              )}
            >
              {type}
            </button>
          ))}
          {tactic && (
            <button
              onClick={() => setTactic(null)}
              className="rounded-full border border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 px-3 py-1 text-xs font-medium text-[color:var(--color-accent)]"
            >
              {tactic} ✕
            </button>
          )}
        </div>
        <div className="ml-auto text-right text-xs opacity-60">
          <p>{total} actors</p>
          {lastSyncedAt && (
            <p className="opacity-70">
              Updated <ClientDate date={lastSyncedAt} formatOptions={{ month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }} />
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <div className="glass glass-edge rounded-2xl p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Crosshair className="h-4 w-4 text-blue-400" />
            Actors by MITRE Tactic
          </h3>
          <div className="mt-4 space-y-2">
            {topTactics.length === 0 && <p className="text-xs opacity-50">No data yet.</p>}
            {topTactics.map(([name, count]) => (
              <button
                key={name}
                onClick={() => setTactic((current) => (current === name ? null : name))}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span className="flex-1 truncate">{name}</span>
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-[color:var(--color-foreground)]/10">
                  <span
                    className="block h-full rounded-full bg-[color:var(--color-accent)]"
                    style={{ width: `${(count / topTactics[0][1]) * 100}%` }}
                  />
                </span>
                <span className="w-8 text-right text-xs font-bold opacity-70">{count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="glass glass-edge rounded-2xl p-5">
          <h3 className="text-sm font-bold">Industry–Region Heatmap</h3>
          <p className="text-[10px] uppercase tracking-widest opacity-40">Derived from ATT&amp;CK group descriptions</p>
          <div className="mt-4 space-y-1">
            <div className="grid grid-cols-[110px_repeat(5,1fr)] gap-1 text-[9px] uppercase tracking-tight opacity-50">
              <span />
              {REGION_COLUMNS.map((region) => (
                <span key={region} className="truncate text-center">{region}</span>
              ))}
            </div>
            {heatmap.length === 0 && <p className="text-xs opacity-50">No data yet.</p>}
            {heatmap.map((row) => (
              <div key={row.sector} className="grid grid-cols-[110px_repeat(5,1fr)] items-center gap-1">
                <span className="flex items-center gap-1.5 truncate text-xs opacity-70">
                  <SectorIcon sector={row.sector} />
                  {row.sector}
                </span>
                {row.cells.map((cell) => (
                  <span
                    key={cell.region}
                    title={`${cell.count} actors target ${row.sector} in ${cell.region}`}
                    className="h-5 rounded bg-[color:var(--color-accent)]"
                    style={{ opacity: cell.count === 0 ? 0.06 : 0.2 + (cell.count / heatmapPeak) * 0.8 }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="glass glass-edge rounded-2xl p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Server className="h-4 w-4 text-blue-400" />
            Top Targeted Technologies
          </h3>
          <p className="text-[10px] uppercase tracking-widest opacity-40">Derived from ATT&amp;CK group descriptions</p>
          <div className="mt-4 space-y-2">
            {topTechnologies.length === 0 && <p className="text-xs opacity-50">No data yet.</p>}
            {topTechnologies.map(([name, count]) => {
              const Icon = TECH_ICONS[name] ?? Server;
              return (
                <div key={name} className="flex items-center gap-2 text-sm">
                  {hasBrandIcon(name) ? (
                    <BrandIcon technology={name} />
                  ) : (
                    <Icon className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-accent)]" aria-hidden />
                  )}
                  <span className="flex-1 truncate">{name}</span>
                  <span className="text-xs font-bold opacity-70">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass glass-edge rounded-2xl p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Wrench className="h-4 w-4 text-blue-400" />
            Most Used Tooling
          </h3>
          <div className="mt-4 space-y-2">
            {topSoftware.length === 0 && <p className="text-xs opacity-50">No data yet.</p>}
            {topSoftware.map(([name, count]) => (
              <div key={name} className="flex items-center gap-3 text-sm">
                <span className="flex-1 truncate">{name}</span>
                <span className="text-xs font-bold opacity-70">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm opacity-70">Loading threat actors…</p>
      ) : actors.length === 0 ? (
        <EmptyState
          title="No threat actors yet"
          description="The MITRE ATT&CK catalogue syncs in the background; check back shortly or adjust your filters."
          icon={<Users size={32} />}
        />
      ) : (
        <div className="glass glass-edge overflow-x-auto rounded-2xl">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-widest opacity-50">
              <tr>
                <th className="px-4 py-3 font-semibold">Actor</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Attributed Origin</th>
                <th className="px-4 py-3 font-semibold">Target Regions</th>
                <th className="px-4 py-3 font-semibold">Target Industries</th>
                <th className="px-4 py-3 font-semibold">Tactics</th>
                <th className="px-4 py-3 font-semibold">MITRE</th>
              </tr>
            </thead>
            <tbody>
              {actors.map((actor) => (
                <tr key={actor.id} className="border-t border-white/5 align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{actor.name}</p>
                    {actor.aliases.length > 0 && (
                      <p className="mt-0.5 max-w-xs truncate text-[10px] opacity-50">{actor.aliases.join(", ")}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs opacity-80">{actor.actorType ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs opacity-80">
                    {actor.origin ? (
                      <span className="flex items-center gap-2">
                        <CountryFlag country={actor.origin} />
                        {actor.origin}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs opacity-70">{actor.targetRegions.join(", ") || "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {actor.targetSectors.length === 0 ? (
                      <span className="opacity-70">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1.5">
                        {actor.targetSectors.map((sector) => (
                          <span
                            key={sector}
                            title={sector}
                            className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-foreground)]/5 px-2 py-0.5"
                          >
                            <SectorIcon sector={sector} />
                            {sector}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    <span className="font-bold">{actor.tactics.length}</span>
                    <span className="opacity-50"> · {actor.techniqueCount} techniques</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {actor.url ? (
                      <a
                        href={actor.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[color:var(--color-accent)] hover:underline"
                      >
                        {actor.externalId}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      actor.externalId
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] opacity-40">
        Source: MITRE ATT&amp;CK® Enterprise. Tactics, techniques and tooling are structured ATT&amp;CK data; type,
        origin, industries and regions are derived from group descriptions and are indicative only.
      </p>
    </div>
  );
}
