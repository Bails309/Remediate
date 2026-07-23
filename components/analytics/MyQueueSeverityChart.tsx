"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Check, SlidersHorizontal } from "lucide-react";
import { cn } from "@/components/cn";

type RiskKey = "Critical" | "High" | "Medium" | "Low" | "None";

type SummaryResponse = {
  counts: Record<RiskKey, number>;
  total: number;
  scope: "active" | "archived";
};

const RISK_ORDER: RiskKey[] = ["Critical", "High", "Medium", "Low", "None"];

// Match `riskToneMap` colours used on the vulnerability table badges so the
// donut visually agrees with the row-level severity badges beneath it.
const RISK_COLORS: Record<RiskKey, string> = {
  Critical: "#dc2626", // red-600
  High: "#f97316",     // orange-500
  Medium: "#eab308",   // yellow-500
  Low: "#3b82f6",      // blue-500
  None: "#94a3b8",     // slate-400
};

// Status catalogues per scope. Keep in sync with `statusOptions` in
// vulnerabilities-client.tsx so the popover labels match the main filter row.
const ACTIVE_STATUSES: Array<{ value: string; label: string }> = [
  { value: "Open", label: "Open" },
  { value: "InProgress", label: "In Progress" },
  { value: "InProgressWithCR", label: "In Progress with CR" },
  { value: "AwaitingVendor", label: "Awaiting Vendor" },
  { value: "Sunset", label: "Sunset" },
  { value: "FalsePositive", label: "False Positive" },
  { value: "NoFixAvailable", label: "No Fix" },
  { value: "Remediated", label: "Remediated" },
];

const ARCHIVED_STATUSES: Array<{ value: string; label: string }> = [
  { value: "Remediated", label: "Remediated" },
  { value: "FalsePositive", label: "False Positive" },
  { value: "NoFixAvailable", label: "No Fix" },
];

const STORAGE_KEY = "remediate.myQueue.hiddenStatuses";

function loadHiddenStatuses(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function saveHiddenStatuses(values: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // localStorage unavailable (private mode, quota) — silently drop.
  }
}

type Props = {
  scope: "active" | "archived";
  assigneeId: string;
  /** Bump this whenever an assignment / status change happens so the chart re-fetches. */
  refreshKey?: number;
};

/**
 * Compact severity donut for the caller's active queue. Renders inline with the
 * pagination bar when the user filters the vulnerability list to their own
 * assignments, so their remaining workload is visible at a glance without
 * pushing the table further down the page.
 *
 * Users can hide specific statuses from the count via a small filter popover;
 * their selection persists per-browser via localStorage.
 */
export function MyQueueSeverityChart({ scope, assigneeId, refreshKey = 0 }: Props) {
  // Lazy initializer reads localStorage once on the first client render.
  // (`loadHiddenStatuses` returns [] during SSR; the initial render is the
  // loading skeleton either way, so there is no hydration mismatch.)
  const [hiddenStatuses, setHiddenStatuses] = useState<string[]>(() => loadHiddenStatuses());
  const [filterOpen, setFilterOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const statusCatalog = scope === "archived" ? ARCHIVED_STATUSES : ACTIVE_STATUSES;

  // Close popover on click-outside.
  useEffect(() => {
    if (!filterOpen) return;
    function handleClick(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filterOpen]);

  // Statuses to *include* = catalog minus hidden. Sent to the API.
  const includedStatuses = useMemo(
    () => statusCatalog.map((s) => s.value).filter((v) => !hiddenStatuses.includes(v)),
    [statusCatalog, hiddenStatuses],
  );

  const includedStatusesKey = includedStatuses.join(",");

  // One state cell keyed by the query it answers. `loading` and `error` are
  // derived at render time by comparing the stored key against the current
  // query key, so the fetch effect never calls setState synchronously (which
  // the react-hooks/set-state-in-effect rule flags for cascading renders).
  const queryKey = `${scope}|${assigneeId}|${refreshKey}|${includedStatusesKey}`;
  const [result, setResult] = useState<{
    key: string;
    summary: SummaryResponse | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!assigneeId) return;
    let cancelled = false;

    const params = new URLSearchParams({ scope, assigneeId });
    if (includedStatusesKey) params.set("statuses", includedStatusesKey);

    fetch(`/api/vulnerabilities/severity-summary?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as SummaryResponse;
      })
      .then((data) => {
        if (!cancelled) setResult({ key: queryKey, summary: data, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({
            key: queryKey,
            summary: null,
            error: err instanceof Error ? err.message : "Failed to load",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [scope, assigneeId, refreshKey, includedStatusesKey, queryKey]);

  // Derived request state: a result answering a different query key means the
  // current query is still in flight. Keep showing the previous summary while
  // a refetch runs (matches the previous behaviour).
  const loading = !result || result.key !== queryKey;
  const summary = result?.summary ?? null;
  const error = !loading ? result?.error ?? null : null;

  const toggleStatus = (value: string) => {
    setHiddenStatuses((prev) => {
      const next = prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value];
      saveHiddenStatuses(next);
      return next;
    });
  };

  const resetHidden = () => {
    setHiddenStatuses([]);
    saveHiddenStatuses([]);
  };

  const hiddenInScopeCount = hiddenStatuses.filter((v) =>
    statusCatalog.some((s) => s.value === v),
  ).length;

  if (error) {
    return (
      <span role="status" className="text-xs font-semibold text-red-700 dark:text-red-300">
        Queue summary unavailable
      </span>
    );
  }

  if (loading && !summary) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading queue severity breakdown"
        className="flex items-center gap-2"
      >
        <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200/70 dark:bg-white/10" />
        <div className="h-5 w-32 animate-pulse rounded-full bg-slate-200/70 dark:bg-white/10" />
      </div>
    );
  }

  if (!summary) return null;

  const { counts, total } = summary;
  const chartData = RISK_ORDER.filter((k) => counts[k] > 0).map((k) => ({
    name: k,
    value: counts[k],
    color: RISK_COLORS[k],
  }));

  return (
    <div
      role="region"
      aria-label="My queue severity breakdown"
      className="flex flex-wrap items-center gap-3"
    >
      <div className="relative h-9 w-9 shrink-0" aria-hidden>
        {total === 0 ? (
          <div className="flex h-full w-full items-center justify-center rounded-full border border-dashed border-slate-300 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:border-white/15 dark:text-slate-500">
            0
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={11}
                outerRadius={18}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
                isAnimationActive={false}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-card, #0f172a)",
                  borderColor: "var(--color-border, rgba(255,255,255,0.1))",
                  borderRadius: "12px",
                  fontSize: 12,
                }}
                itemStyle={{ color: "var(--color-foreground, #e2e8f0)" }}
                formatter={(value: number, name: string) => [`${value}`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          My Queue
        </span>
        <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">
          {total}
          <span className="ml-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
            {scope === "archived" ? "archived" : "open"}
          </span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {RISK_ORDER.filter((k) => counts[k] > 0).map((k) => (
          <span
            key={k}
            title={`${k}: ${counts[k]}`}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100/80 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-white/5 dark:text-slate-200"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: RISK_COLORS[k] }}
              aria-hidden
            />
            <span className="tabular-nums">{counts[k]}</span>
            <span className="sr-only">{k}</span>
          </span>
        ))}
        {total === 0 && hiddenInScopeCount === 0 && (
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Nothing to triage — nice work.
          </span>
        )}
        {total === 0 && hiddenInScopeCount > 0 && (
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            No items match the current status filter.
          </span>
        )}
      </div>
      <div ref={popoverRef} className="relative">
        <button
          type="button"
          onClick={() => setFilterOpen((open) => !open)}
          aria-haspopup="dialog"
          aria-expanded={filterOpen}
          aria-label={
            hiddenInScopeCount > 0
              ? `Filter statuses (${hiddenInScopeCount} hidden)`
              : "Filter statuses"
          }
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/70 px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:border-white/20 dark:hover:bg-white/[0.06]",
            hiddenInScopeCount > 0 &&
              "border-cyan-500/60 bg-cyan-50 text-cyan-700 hover:border-cyan-500 hover:bg-cyan-100 dark:border-[#00C8FF]/50 dark:bg-[#00C8FF]/10 dark:text-[#00C8FF]",
          )}
        >
          <SlidersHorizontal className="h-3 w-3" />
          <span>Filter</span>
          {hiddenInScopeCount > 0 && (
            <span
              aria-hidden
              className="rounded-full bg-cyan-500/20 px-1.5 text-[10px] font-bold tabular-nums text-cyan-800 dark:bg-[#00C8FF]/20 dark:text-[#00C8FF]"
            >
              {hiddenInScopeCount}
            </span>
          )}
        </button>
        {filterOpen && (
          <div
            role="dialog"
            aria-label="Hide statuses from queue chart"
            className="absolute right-0 top-full z-40 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-slate-900/95 dark:backdrop-blur-xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Include statuses
              </span>
              <button
                type="button"
                onClick={resetHidden}
                disabled={hiddenInScopeCount === 0}
                className="text-[11px] font-semibold text-cyan-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline dark:text-[#00C8FF] dark:disabled:text-slate-600"
              >
                Reset
              </button>
            </div>
            <ul className="flex flex-col gap-1">
              {statusCatalog.map((s) => {
                const included = !hiddenStatuses.includes(s.value);
                return (
                  <li key={s.value}>
                    <button
                      type="button"
                      onClick={() => toggleStatus(s.value)}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
                    >
                      <span>{s.label}</span>
                      <span
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                          included
                            ? "border-cyan-500 bg-cyan-500 text-white dark:border-[#00C8FF] dark:bg-[#00C8FF] dark:text-slate-900"
                            : "border-slate-300 bg-transparent dark:border-white/20",
                        )}
                        aria-hidden
                      >
                        {included && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
