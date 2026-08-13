export type ScoredVulnerability = {
  risk: string;
  status: string;
  createdAt: Date;
};

// Severity weights: unresolved findings drag the score down in proportion to
// the risk they carry.
export const RISK_WEIGHT: Record<string, number> = { Critical: 10, High: 5, Medium: 2, Low: 1, None: 0 };

const OPEN_STATUSES = new Set(["Open", "InProgress", "InProgressWithCR", "AwaitingVendor"]);

const DAY_MS = 24 * 60 * 60 * 1000;

export type SecurityScore = {
  score: number;
  /** Points attributable to findings discovered in the last 30 days. */
  delta: number;
  openWeighted: number;
  weeklyDiscovered: { label: string; value: number }[];
};

export function computeSecurityScore(
  vulnerabilities: ScoredVulnerability[],
  { weeks = 8, now = new Date() }: { weeks?: number; now?: Date } = {}
): SecurityScore {
  const cutoff = new Date(now.getTime() - 30 * DAY_MS);

  let openWeight = 0;
  let resolvedWeight = 0;
  let recentOpenWeight = 0;

  for (const vuln of vulnerabilities) {
    const weight = RISK_WEIGHT[vuln.risk] ?? 0;
    if (OPEN_STATUSES.has(vuln.status)) {
      openWeight += weight;
      if (vuln.createdAt >= cutoff) recentOpenWeight += weight;
    } else {
      resolvedWeight += weight;
    }
  }

  const scoreFor = (open: number, resolved: number) =>
    open + resolved === 0 ? 100 : (resolved / (open + resolved)) * 100;

  const score = Math.round(scoreFor(openWeight, resolvedWeight));
  const baseline = Math.round(scoreFor(openWeight - recentOpenWeight, resolvedWeight));

  const weeklyDiscovered = Array.from({ length: weeks }, (_, index) => {
    const end = new Date(now.getTime() - (weeks - 1 - index) * 7 * DAY_MS);
    const start = new Date(end.getTime() - 7 * DAY_MS);
    const value = vulnerabilities.reduce(
      (total, vuln) => (vuln.createdAt >= start && vuln.createdAt < end ? total + (RISK_WEIGHT[vuln.risk] ?? 0) : total),
      0
    );
    return { label: end.toLocaleDateString(undefined, { month: "short", day: "numeric" }), value };
  });

  return { score, delta: score - baseline, openWeighted: openWeight, weeklyDiscovered };
}
