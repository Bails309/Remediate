"use client";

import { useState } from "react";
import { ClipboardCheck, Copy, Download, ListChecks, Loader2, RotateCcw, Sparkles, Wrench } from "lucide-react";
import { Button } from "@/components/Button";
import { toast } from "@/lib/toast";

export type RemediationPlan = {
  summary: string;
  plan: { title: string; detail: string; effort?: string | null }[];
  changeRequest: {
    title: string;
    type: string;
    summary: string;
    justification: string;
    affectedSystems: string[];
    implementation: string[];
    riskIfNotApplied: string;
    riskOfChange: string;
    serviceImpact: string;
    schedulingNotes: string;
  };
  rollback: { trigger: string; steps: string[]; notes?: string | null };
  validation: { check: string; expected: string }[];
  evidence: { item: string; where: string }[];
  assumptions: string[];
};

type Props = {
  vulnerabilityId: string;
  /** Display title used in the exported document header. */
  findingTitle: string;
  /** Whether the viewer owns the work (assignee / group leader / admin). */
  canGenerate: boolean;
  /** Tooltip explaining why generation is blocked, when it is. */
  gateReason?: string;
  assistantName: string;
};

const SECTION_LABEL =
  "text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500";

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <p className={SECTION_LABEL}>{label}</p>
      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function toMarkdown(plan: RemediationPlan, findingTitle: string): string {
  const cr = plan.changeRequest;
  const lines: string[] = [
    `# Remediation plan — ${findingTitle}`,
    "",
    plan.summary,
    "",
    "## Plan",
    ...plan.plan.map((s, i) => `${i + 1}. **${s.title}**${s.effort ? ` _(${s.effort})_` : ""}\n   ${s.detail}`),
    "",
    "## Change request draft",
    `- **Title:** ${cr.title}`,
    `- **Type:** ${cr.type}`,
    `- **Summary:** ${cr.summary}`,
    `- **Justification:** ${cr.justification}`,
    `- **Affected systems:** ${cr.affectedSystems.join(", ") || "—"}`,
    `- **Risk if not applied:** ${cr.riskIfNotApplied}`,
    `- **Risk of change:** ${cr.riskOfChange}`,
    `- **Service impact:** ${cr.serviceImpact}`,
    `- **Scheduling:** ${cr.schedulingNotes}`,
    "",
    "### Implementation",
    ...cr.implementation.map((s, i) => `${i + 1}. ${s}`),
    "",
    "## Rollback",
    `**Trigger:** ${plan.rollback.trigger}`,
    "",
    ...plan.rollback.steps.map((s, i) => `${i + 1}. ${s}`),
    ...(plan.rollback.notes ? ["", `_${plan.rollback.notes}_`] : []),
    "",
    "## Validation",
    ...plan.validation.map((v) => `- **${v.check}** → ${v.expected}`),
    "",
    "## Evidence to capture",
    ...plan.evidence.map((e) => `- **${e.item}** — ${e.where}`),
  ];
  if (plan.assumptions.length > 0) {
    lines.push("", "## Assumptions / gaps", ...plan.assumptions.map((a) => `- ${a}`));
  }
  return lines.join("\n");
}

/**
 * AI-generated remediation package for a single finding: plan, change-request
 * draft, rollback + validation, and evidence pointers. Generation is server-side
 * gated to the assignee, group leaders and admins; nothing is stored.
 */
export function RemediationPlanPanel({
  vulnerabilityId,
  findingTitle,
  canGenerate,
  gateReason,
  assistantName,
}: Props) {
  const [plan, setPlan] = useState<RemediationPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vulnerabilities/${vulnerabilityId}/plan`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Could not generate a remediation plan.");
        return;
      }
      setPlan(body.plan as RemediationPlan);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(toMarkdown(plan, findingTitle));
      toast.success("Plan copied as Markdown");
    } catch {
      toast.error("Clipboard is not available");
    }
  };

  const download = () => {
    if (!plan) return;
    const blob = new Blob([toMarkdown(plan, findingTitle)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `remediation-plan-${vulnerabilityId.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cr = plan?.changeRequest;

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Wrench size={15} className="text-accent" />
            Remediation package
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {assistantName} drafts a plan, change request, rollback, validation and evidence list for
            this finding only.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {plan && (
            <>
              <Button size="sm" variant="outline" onClick={() => void copy()} title="Copy as Markdown">
                <Copy size={13} />
                Copy
              </Button>
              <Button size="sm" variant="outline" onClick={download} title="Download as Markdown">
                <Download size={13} />
                .md
              </Button>
            </>
          )}
          <Button
            size="sm"
            onClick={() => void generate()}
            loading={loading}
            disabled={!canGenerate || loading}
            title={!canGenerate ? gateReason : undefined}
          >
            {!loading && <Sparkles size={13} />}
            {plan ? "Regenerate" : "Generate"}
          </Button>
        </div>
      </div>

      {!canGenerate && !plan && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {gateReason ?? "You do not own this finding."}
        </p>
      )}

      {loading && (
        <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 size={13} className="animate-spin" />
          Drafting the package — this can take up to a minute.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-300/60 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </p>
      )}

      {plan && cr && (
        <div className="space-y-5 border-t border-slate-200 pt-4 dark:border-white/10">
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{plan.summary}</p>

          <div className="space-y-2">
            <p className={SECTION_LABEL}>Plan</p>
            <ol className="space-y-2">
              {plan.plan.map((step, i) => (
                <li key={i} className="rounded-xl bg-white/70 px-3 py-2 dark:bg-black/20">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {i + 1}. {step.title}
                    {step.effort && (
                      <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {step.effort}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{step.detail}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-3">
            <p className={SECTION_LABEL}>Change request draft</p>
            <div className="space-y-3 rounded-xl bg-white/70 px-3 py-3 dark:bg-black/20">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{cr.title}</p>
              <p className="text-[11px] font-bold uppercase tracking-wider text-accent">{cr.type} change</p>
              <Field label="Summary" value={cr.summary} />
              <Field label="Justification" value={cr.justification} />
              {cr.affectedSystems.length > 0 && (
                <div className="space-y-1">
                  <p className={SECTION_LABEL}>Affected systems</p>
                  <div className="flex flex-wrap gap-1.5">
                    {cr.affectedSystems.map((s, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[11px] text-slate-700 dark:bg-white/10 dark:text-slate-200"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {cr.implementation.length > 0 && (
                <div className="space-y-1">
                  <p className={SECTION_LABEL}>Implementation</p>
                  <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-600 dark:text-slate-300">
                    {cr.implementation.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}
              <Field label="Risk if not applied" value={cr.riskIfNotApplied} />
              <Field label="Risk of change" value={cr.riskOfChange} />
              <Field label="Service impact" value={cr.serviceImpact} />
              <Field label="Scheduling" value={cr.schedulingNotes} />
            </div>
          </div>

          <div className="space-y-2">
            <p className={`${SECTION_LABEL} flex items-center gap-1.5`}>
              <RotateCcw size={12} />
              Rollback
            </p>
            <div className="space-y-2 rounded-xl bg-white/70 px-3 py-3 dark:bg-black/20">
              <Field label="Abort trigger" value={plan.rollback.trigger} />
              {plan.rollback.steps.length > 0 && (
                <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-600 dark:text-slate-300">
                  {plan.rollback.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              )}
              {plan.rollback.notes && (
                <p className="text-xs italic text-slate-500 dark:text-slate-400">{plan.rollback.notes}</p>
              )}
            </div>
          </div>

          {plan.validation.length > 0 && (
            <div className="space-y-2">
              <p className={`${SECTION_LABEL} flex items-center gap-1.5`}>
                <ListChecks size={12} />
                Validation
              </p>
              <ul className="space-y-1.5">
                {plan.validation.map((v, i) => (
                  <li key={i} className="rounded-xl bg-white/70 px-3 py-2 text-xs dark:bg-black/20">
                    <span className="font-semibold text-slate-900 dark:text-white">{v.check}</span>
                    <span className="mt-0.5 block text-slate-600 dark:text-slate-300">Expect: {v.expected}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.evidence.length > 0 && (
            <div className="space-y-2">
              <p className={`${SECTION_LABEL} flex items-center gap-1.5`}>
                <ClipboardCheck size={12} />
                Evidence to capture
              </p>
              <ul className="space-y-1.5">
                {plan.evidence.map((e, i) => (
                  <li key={i} className="rounded-xl bg-white/70 px-3 py-2 text-xs dark:bg-black/20">
                    <span className="font-semibold text-slate-900 dark:text-white">{e.item}</span>
                    <span className="mt-0.5 block text-slate-600 dark:text-slate-300">{e.where}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.assumptions.length > 0 && (
            <div className="space-y-1 rounded-xl border border-amber-300/50 bg-amber-50/80 px-3 py-2 dark:border-amber-400/20 dark:bg-amber-500/10">
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-amber-800 dark:text-amber-200">
                Assumptions to confirm
              </p>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-900 dark:text-amber-100">
                {plan.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            AI-generated from this finding only — review before submitting for change approval.
          </p>
        </div>
      )}
    </div>
  );
}
