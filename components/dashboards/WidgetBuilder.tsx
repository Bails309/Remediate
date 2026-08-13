"use client";

import { useEffect, useMemo, useState } from "react";
import { SideSheet } from "@/components/SideSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { WidgetRenderer, type WidgetData } from "@/components/dashboards/WidgetRenderer";
import { toast } from "@/lib/toast";
import { Sparkles, Wand2 } from "lucide-react";
import { cn } from "@/components/cn";

export type WidgetDraft = {
  title: string;
  viz: string;
  spec: Record<string, unknown>;
};

const SOURCES = [
  { value: "vulnerabilities", label: "Vulnerabilities" },
  { value: "threatActors", label: "Threat actors" },
  { value: "uploads", label: "Uploads" },
];

const GROUP_BY: Record<string, { value: string; label: string }[]> = {
  vulnerabilities: [
    { value: "", label: "No grouping (single number)" },
    { value: "risk", label: "Severity" },
    { value: "status", label: "Status" },
    { value: "site", label: "Bucket" },
    { value: "assignee", label: "Assignee" },
    { value: "group", label: "Group" },
    { value: "scanner", label: "Scanner" },
    { value: "month", label: "Month discovered" },
  ],
  threatActors: [
    { value: "", label: "No grouping (single number)" },
    { value: "actorType", label: "Actor type" },
    { value: "origin", label: "Attributed origin" },
    { value: "tactic", label: "MITRE tactic" },
    { value: "sector", label: "Target industry" },
    { value: "region", label: "Target region" },
    { value: "technology", label: "Targeted technology" },
  ],
  uploads: [
    { value: "", label: "No grouping (single number)" },
    { value: "status", label: "Status" },
    { value: "site", label: "Bucket" },
    { value: "month", label: "Month" },
  ],
};

const VIZ = [
  { value: "stat", label: "Single number" },
  { value: "bar", label: "Bar chart" },
  { value: "donut", label: "Donut" },
  { value: "line", label: "Line" },
  { value: "table", label: "Table" },
];

const RISKS = ["Critical", "High", "Medium", "Low"];
const STATUSES = ["Open", "InProgress", "AwaitingVendor", "Remediated", "NoFixAvailable"];

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (draft: WidgetDraft) => Promise<void>;
};

export function WidgetBuilder({ open, onClose, onSave }: Props) {
  const [title, setTitle] = useState("");
  const [viz, setViz] = useState("bar");
  const [source, setSource] = useState("vulnerabilities");
  const [groupBy, setGroupBy] = useState("risk");
  const [metric, setMetric] = useState("count");
  const [risks, setRisks] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [preview, setPreview] = useState<WidgetData | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiRequest, setAiRequest] = useState("");
  const [planning, setPlanning] = useState(false);

  const spec = useMemo(() => {
    const filters: Record<string, unknown> = {};
    if (source === "vulnerabilities") {
      if (risks.length) filters.risk = risks;
      if (statuses.length) filters.status = statuses;
    }
    return {
      source,
      metric,
      groupBy: groupBy || null,
      ...(Object.keys(filters).length ? { filters } : {}),
      limit: 10,
      months: 6,
    };
  }, [source, metric, groupBy, risks, statuses]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/dashboards/plan")
      .then((response) => (response.ok ? response.json() : { available: false }))
      .then((data) => setAiAvailable(Boolean(data.available)))
      .catch(() => setAiAvailable(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreviewing(true);
    const handle = setTimeout(async () => {
      const response = await fetch("/api/dashboards/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spec),
      });
      if (cancelled) return;
      setPreviewing(false);
      if (!response.ok) {
        setPreview(null);
        return;
      }
      setPreview(await response.json());
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, spec]);

  const toggle = (list: string[], value: string, setter: (next: string[]) => void) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const planWithAi = async () => {
    if (!aiRequest.trim()) return;
    setPlanning(true);
    try {
      const response = await fetch("/api/dashboards/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: aiRequest.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Could not plan that widget");
        return;
      }

      setTitle(data.title);
      setViz(data.viz);
      setSource(data.spec.source ?? "vulnerabilities");
      setGroupBy(data.spec.groupBy ?? "");
      setMetric(data.spec.metric ?? "count");
      setRisks(data.spec.filters?.risk ?? []);
      setStatuses(data.spec.filters?.status ?? []);
      setPreview(data.data ?? null);
      toast.success("Widget drafted — tweak it or save");
    } catch {
      toast.error("Could not plan that widget");
    } finally {
      setPlanning(false);
    }
  };

  const save = async () => {
    if (!title.trim()) {
      toast.error("Give the widget a title");
      return;
    }
    setSaving(true);
    try {
      await onSave({ title: title.trim(), viz, spec });
      setTitle("");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SideSheet open={open} onClose={onClose} title="Add widget">
      {aiAvailable && (
        <div className="glass glass-edge rounded-2xl p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-[color:var(--color-accent)]" />
            Describe it instead
          </p>
          <p className="mt-1 text-xs opacity-60">
            The AI only picks a source, grouping and filters — it never writes queries against the database.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              value={aiRequest}
              onChange={(event) => setAiRequest(event.target.value)}
              placeholder="e.g. open critical findings by bucket"
              onKeyDown={(event) => event.key === "Enter" && planWithAi()}
            />
            <Button onClick={planWithAi} loading={planning} className="shrink-0">
              <Wand2 className="mr-2 h-4 w-4" />
              Draft
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Title</label>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Open critical findings" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Data source</label>
            <Select
              value={source}
              options={SOURCES}
              onChange={(value) => {
                setSource(value);
                setGroupBy(GROUP_BY[value][1]?.value ?? "");
                setMetric("count");
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Group by</label>
            <Select value={groupBy} options={GROUP_BY[source]} onChange={setGroupBy} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Visualisation</label>
            <Select value={viz} options={VIZ} onChange={setViz} />
          </div>
          {source === "vulnerabilities" && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Metric</label>
              <Select
                value={metric}
                options={[
                  { value: "count", label: "Count" },
                  { value: "avgCvss", label: "Average CVSS" },
                ]}
                onChange={setMetric}
              />
            </div>
          )}
        </div>

        {source === "vulnerabilities" && (
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Severity filter</label>
              <div className="flex flex-wrap gap-2">
                {RISKS.map((risk) => (
                  <button
                    key={risk}
                    onClick={() => toggle(risks, risk, setRisks)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      risks.includes(risk)
                        ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)]"
                        : "border-[color:var(--color-border)] opacity-70 hover:opacity-100"
                    )}
                  >
                    {risk}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Status filter</label>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((status) => (
                  <button
                    key={status}
                    onClick={() => toggle(statuses, status, setStatuses)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      statuses.includes(status)
                        ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)]"
                        : "border-[color:var(--color-border)] opacity-70 hover:opacity-100"
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest opacity-40">
          Live preview {previewing && <span className="opacity-60">· running…</span>}
        </label>
        <div className="glass glass-edge h-56 rounded-2xl p-4">
          <WidgetRenderer viz={viz} data={preview} />
        </div>
        {preview?.truncated && <p className="text-[10px] opacity-50">Showing the top results only.</p>}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} loading={saving}>
          Add to dashboard
        </Button>
      </div>
    </SideSheet>
  );
}
