import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/provider", () => ({
  chatCompletion: vi.fn(),
  AiProviderError: class AiProviderError extends Error {},
}));

import { chatCompletion } from "@/lib/ai/provider";
import {
  buildFindingPrompt,
  generateRemediationPlan,
  parsePlanResponse,
  RemediationPlanError,
  type PlanFinding,
} from "@/lib/ai/remediation-plan";
import type { AiConfig } from "@/lib/ai/config";

const completionMock = chatCompletion as unknown as ReturnType<typeof vi.fn>;

const CONFIG: AiConfig = {
  providerType: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "secret",
  model: "gpt-4o-mini",
  assistantName: "Vulcan",
  enabled: true,
  source: "db",
};

const FINDING: PlanFinding = {
  id: "11111111-2222-3333-4444-555555555555",
  cve: "CVE-2024-1234",
  name: "openssl vulnerable to buffer overflow",
  risk: "Critical",
  cvss: 9.8,
  status: "InProgress",
  scanner: "ACR",
  host: "myregistry/api",
  protocol: "container",
  port: "openssl",
  package: "openssl",
  installedVersion: "1.1.1k",
  registry: "myregistry",
  repository: "api",
  imageTag: "v2.3.1",
  imageDigest: "sha256:abc",
  synopsis: "Remote attackers can crash the service.",
  description: "A buffer overflow in the TLS handshake.",
  solution: "Upgrade to 1.1.1w or later.",
  seeAlso: "https://example.test/advisory",
  crNumber: null,
  internetFacing: false,
  firstSeen: "2026-01-05",
  lastSeen: "2026-08-01",
};

const VALID_PLAN = {
  summary: "Upgrade openssl in the api image.",
  plan: [{ title: "Rebuild image", detail: "Bump the base image and rebuild.", effort: "1 h" }],
  changeRequest: {
    title: "Upgrade openssl in api image",
    type: "Normal",
    summary: "Rebuild and redeploy with openssl 1.1.1w.",
    justification: "Critical CVSS 9.8 finding.",
    affectedSystems: ["myregistry/api:v2.3.1"],
    implementation: ["Bump base image", "Rebuild", "Redeploy"],
    riskIfNotApplied: "Remote crash of the API.",
    riskOfChange: "Image rebuild could break TLS clients.",
    serviceImpact: "Rolling restart.",
    schedulingNotes: "Next standard window.",
  },
  rollback: { trigger: "Health checks fail", steps: ["Redeploy previous digest"], notes: null },
  validation: [{ check: "Re-scan image", expected: "CVE-2024-1234 no longer reported" }],
  evidence: [{ item: "Post-change scan report", where: "Registry scan results" }],
  assumptions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildFindingPrompt", () => {
  it("includes only the supplied finding's grounded fields", () => {
    const prompt = buildFindingPrompt(FINDING);

    expect(prompt).toContain("CVE-2024-1234");
    expect(prompt).toContain("openssl@1.1.1k");
    expect(prompt).toContain("Upgrade to 1.1.1w or later.");
    expect(prompt).toContain("myregistry/api");
  });

  it("omits fields with no data instead of emitting empty labels", () => {
    const prompt = buildFindingPrompt({ ...FINDING, cve: null, crNumber: null, seeAlso: null });

    expect(prompt).not.toContain("- CVE:");
    expect(prompt).not.toContain("- existing change request:");
    expect(prompt).not.toContain("- references:");
  });

  it("flags internet-facing findings to the model", () => {
    expect(buildFindingPrompt({ ...FINDING, internetFacing: true })).toContain("internet-facing");
  });
});

describe("parsePlanResponse", () => {
  it("parses a well-formed plan", () => {
    const plan = parsePlanResponse(JSON.stringify(VALID_PLAN));
    expect(plan.changeRequest.type).toBe("Normal");
    expect(plan.plan).toHaveLength(1);
  });

  it("unwraps a fenced JSON block", () => {
    const plan = parsePlanResponse("```json\n" + JSON.stringify(VALID_PLAN) + "\n```");
    expect(plan.summary).toBe("Upgrade openssl in the api image.");
  });

  it("defaults optional collections that the model omitted", () => {
    const { validation, evidence, assumptions, ...rest } = VALID_PLAN;
    void validation;
    void evidence;
    void assumptions;
    const plan = parsePlanResponse(JSON.stringify(rest));
    expect(plan.validation).toEqual([]);
    expect(plan.evidence).toEqual([]);
    expect(plan.assumptions).toEqual([]);
  });

  it("rejects unparseable output", () => {
    expect(() => parsePlanResponse("sorry, I cannot help")).toThrow(RemediationPlanError);
  });

  it("rejects output missing required sections", () => {
    expect(() => parsePlanResponse(JSON.stringify({ summary: "x", plan: [] }))).toThrow(
      RemediationPlanError,
    );
  });
});

describe("generateRemediationPlan", () => {
  it("requests JSON and gives the model no tools", async () => {
    completionMock.mockResolvedValueOnce(JSON.stringify(VALID_PLAN));

    const plan = await generateRemediationPlan(FINDING, CONFIG);

    expect(plan.summary).toBe("Upgrade openssl in the api image.");
    const args = completionMock.mock.calls[0][0];
    expect(args.json).toBe(true);
    expect(args).not.toHaveProperty("tools");
    expect(args.messages).toHaveLength(2);
    expect(args.messages[0].content).toContain("Vulcan");
    expect(args.messages[0].content).toContain("NO access to any other finding");
  });
});
