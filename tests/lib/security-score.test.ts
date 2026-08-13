import { describe, it, expect } from "vitest";
import { computeSecurityScore } from "@/lib/security-score";

const now = new Date("2026-08-13T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

describe("computeSecurityScore", () => {
  it("returns 100 when there are no findings", () => {
    const result = computeSecurityScore([], { now });
    expect(result.score).toBe(100);
    expect(result.delta).toBe(0);
    expect(result.openWeighted).toBe(0);
  });

  it("returns 0 when every finding is open", () => {
    const result = computeSecurityScore(
      [{ risk: "Critical", status: "Open", createdAt: daysAgo(120) }],
      { now }
    );
    expect(result.score).toBe(0);
  });

  it("weights severity when scoring", () => {
    const result = computeSecurityScore(
      [
        { risk: "Critical", status: "Open", createdAt: daysAgo(120) },
        { risk: "Low", status: "Remediated", createdAt: daysAgo(120) },
      ],
      { now }
    );
    // open weight 10, resolved weight 1 => 1/11
    expect(result.score).toBe(9);
    expect(result.openWeighted).toBe(10);
  });

  it("treats in-progress and awaiting-vendor as open", () => {
    const result = computeSecurityScore(
      [
        { risk: "High", status: "InProgress", createdAt: daysAgo(60) },
        { risk: "High", status: "AwaitingVendor", createdAt: daysAgo(60) },
        { risk: "High", status: "Remediated", createdAt: daysAgo(60) },
      ],
      { now }
    );
    expect(result.openWeighted).toBe(10);
    expect(result.score).toBe(33);
  });

  it("attributes the delta to findings discovered in the last 30 days", () => {
    const result = computeSecurityScore(
      [
        { risk: "High", status: "Remediated", createdAt: daysAgo(200) },
        { risk: "High", status: "Open", createdAt: daysAgo(5) },
      ],
      { now }
    );
    // Without the recent finding the score would be 100
    expect(result.score).toBe(50);
    expect(result.delta).toBe(-50);
  });

  it("buckets discovered risk into weekly points", () => {
    const result = computeSecurityScore(
      [{ risk: "Critical", status: "Open", createdAt: daysAgo(3) }],
      { weeks: 4, now }
    );
    expect(result.weeklyDiscovered).toHaveLength(4);
    expect(result.weeklyDiscovered[3].value).toBe(10);
    expect(result.weeklyDiscovered.slice(0, 3).every((point) => point.value === 0)).toBe(true);
  });
});
