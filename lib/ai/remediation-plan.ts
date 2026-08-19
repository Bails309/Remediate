import { z } from "zod";
import type { AiConfig } from "@/lib/ai/config";
import { chatCompletion } from "@/lib/ai/provider";

export class RemediationPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemediationPlanError";
  }
}

/**
 * The single finding a plan is generated for. Always built server-side from the
 * database row after the RBAC checks in the route — never from client input, and
 * never merged with any other finding.
 */
export type PlanFinding = {
  id: string;
  cve: string | null;
  name: string;
  risk: string;
  cvss: number | null;
  status: string;
  scanner: string;
  host: string;
  protocol: string | null;
  port: string | null;
  package: string | null;
  installedVersion: string | null;
  registry: string | null;
  repository: string | null;
  imageTag: string | null;
  imageDigest: string | null;
  synopsis: string | null;
  description: string | null;
  solution: string | null;
  seeAlso: string | null;
  crNumber: string | null;
  internetFacing: boolean;
  firstSeen: string;
  lastSeen: string;
};

const planSchema = z.object({
  summary: z.string().trim().min(1).max(1500),
  plan: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        detail: z.string().trim().min(1).max(1500),
        effort: z.string().trim().max(80).nullish(),
      }),
    )
    .min(1)
    .max(12),
  changeRequest: z.object({
    title: z.string().trim().max(200),
    type: z.string().trim().max(40),
    summary: z.string().trim().max(1500),
    justification: z.string().trim().max(1500),
    affectedSystems: z.array(z.string().trim().max(200)).max(20).default([]),
    implementation: z.array(z.string().trim().max(800)).max(20).default([]),
    riskIfNotApplied: z.string().trim().max(1000),
    riskOfChange: z.string().trim().max(1000),
    serviceImpact: z.string().trim().max(1000),
    schedulingNotes: z.string().trim().max(800),
  }),
  rollback: z.object({
    trigger: z.string().trim().max(800),
    steps: z.array(z.string().trim().max(800)).max(15).default([]),
    notes: z.string().trim().max(800).nullish(),
  }),
  validation: z
    .array(
      z.object({
        check: z.string().trim().max(300),
        expected: z.string().trim().max(500),
      }),
    )
    .max(12)
    .default([]),
  evidence: z
    .array(
      z.object({
        item: z.string().trim().max(200),
        where: z.string().trim().max(500),
      }),
    )
    .max(12)
    .default([]),
  assumptions: z.array(z.string().trim().max(300)).max(10).default([]),
});

export type RemediationPlan = z.infer<typeof planSchema>;

const SYSTEM_PROMPT = (assistantName: string) => `You are ${assistantName}, the AI remediation
assistant inside "Remediate", a vulnerability triage tool. You are producing a change-ready
remediation package for ONE vulnerability finding that an engineer has been assigned.

Hard rules:
- You are given exactly ONE finding. You have NO access to any other finding, host, scan or ticket.
  Never reference, infer, compare with, or aggregate other issues — not even in passing.
- Ground every statement in the finding data supplied below. Never invent CVE identifiers, CVSS
  scores, fixed version numbers, hostnames, owners, dates, or ticket references.
- Where a value is genuinely unknown (e.g. the fixed version is not stated), write a placeholder in
  angle brackets such as <fixed version> and record the gap in "assumptions" instead of guessing.
- Write for a change-advisory board and an implementing engineer: specific, imperative, verifiable.
  No marketing language, no restating the rules, no commentary about being an AI.
- British English. Keep each field tight; prefer short concrete sentences over prose.

Return ONLY a JSON object, no markdown fences, matching exactly this shape:
{
  "summary": "2-4 sentences: what is wrong, on what, and the shape of the fix.",
  "plan": [{ "title": "short step name", "detail": "what to do and how to confirm it worked", "effort": "e.g. 30 min (optional)" }],
  "changeRequest": {
    "title": "one-line change title",
    "type": "Standard | Normal | Emergency",
    "summary": "what the change does",
    "justification": "why it must happen, including severity and exposure",
    "affectedSystems": ["host / image / package / service"],
    "implementation": ["ordered implementation steps for the change record"],
    "riskIfNotApplied": "consequence of leaving the vulnerability in place",
    "riskOfChange": "what could go wrong applying it",
    "serviceImpact": "downtime/restart/user impact expected",
    "schedulingNotes": "maintenance-window, pre-approval and dependency notes"
  },
  "rollback": { "trigger": "what makes you abort", "steps": ["ordered backout steps"], "notes": "data/state caveats (optional)" },
  "validation": [{ "check": "post-change check to run", "expected": "the result that proves success" }],
  "evidence": [{ "item": "artefact to capture as proof", "where": "where it comes from / how to capture it" }],
  "assumptions": ["anything you had to assume or could not determine from the finding"]
}`;

function line(label: string, value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const clean = String(value).replace(/\s+/g, " ").trim();
  return clean ? `- ${label}: ${clean}` : null;
}

/**
 * Long scanner text is truncated so a verbose plugin description can't crowd out
 * the completion budget (which would surface as a truncated/invalid JSON reply).
 */
function clamp(value: string | null, max: number): string | null {
  if (!value) return null;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function buildFindingPrompt(finding: PlanFinding): string {
  const lines = [
    "The finding:",
    "",
    line("title", finding.name),
    line("CVE", finding.cve),
    line("severity", `${finding.risk}${finding.cvss != null ? ` (CVSS ${finding.cvss})` : ""}`),
    line("current status", finding.status),
    line("scanner", `${finding.scanner}${finding.internetFacing ? " (internet-facing pentest finding)" : ""}`),
    line("host/target", finding.host),
    line("service", [finding.protocol, finding.port].filter(Boolean).join("/")),
    line("package", finding.package ? `${finding.package}${finding.installedVersion ? `@${finding.installedVersion}` : ""}` : null),
    line("container image", [finding.registry, finding.repository].filter(Boolean).join("/")),
    line("image tag", finding.imageTag),
    line("image digest", finding.imageDigest),
    line("existing change request", finding.crNumber),
    line("first seen", finding.firstSeen),
    line("last seen", finding.lastSeen),
    line("synopsis", clamp(finding.synopsis, 600)),
    line("description", clamp(finding.description, 2000)),
    line("vendor solution/remediation", clamp(finding.solution, 1200)),
    line("references", clamp(finding.seeAlso, 400)),
    "",
    "Produce the JSON package for THIS finding only.",
  ].filter(Boolean);
  return lines.join("\n");
}

/** Models occasionally wrap JSON in a fenced block despite json mode; unwrap it. */
function stripFences(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```[a-z]*\s*/i, "").replace(/```$/, "").trim();
}

export function parsePlanResponse(raw: string): RemediationPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    throw new RemediationPlanError("The AI returned a response that could not be read as a plan.");
  }
  const result = planSchema.safeParse(parsed);
  if (!result.success) {
    throw new RemediationPlanError("The AI returned an incomplete plan. Try generating it again.");
  }
  return result.data;
}

/**
 * Generate the remediation package for a single finding. One completion, no
 * tools: the model cannot reach the vulnerability search surface, so the output
 * is structurally confined to the issue the assignee opened.
 */
export async function generateRemediationPlan(
  finding: PlanFinding,
  config: AiConfig,
): Promise<RemediationPlan> {
  const content = await chatCompletion({
    config,
    messages: [
      { role: "system", content: SYSTEM_PROMPT(config.assistantName) },
      { role: "user", content: buildFindingPrompt(finding) },
    ],
    json: true,
    maxTokens: 3000,
    timeoutMs: 90000,
  });
  return parsePlanResponse(content);
}
