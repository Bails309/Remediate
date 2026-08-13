import { describe, it, expect } from "vitest";
import { widgetSpecSchema, widgetSchema, assertSpecIsCoherent, MAX_WIDGET_ROWS } from "@/lib/dashboards/spec";

describe("widgetSpecSchema", () => {
  it("applies defaults for a minimal spec", () => {
    const parsed = widgetSpecSchema.parse({});
    expect(parsed.source).toBe("vulnerabilities");
    expect(parsed.metric).toBe("count");
    expect(parsed.limit).toBe(10);
  });

  it("rejects unknown keys so injected fields cannot reach the query builder", () => {
    const result = widgetSpecSchema.safeParse({ source: "vulnerabilities", sql: "DROP TABLE users" });
    expect(result.success).toBe(false);
  });

  it("rejects sources and groupings outside the allowlist", () => {
    expect(widgetSpecSchema.safeParse({ source: "users" }).success).toBe(false);
    expect(widgetSpecSchema.safeParse({ groupBy: "password" }).success).toBe(false);
  });

  it("caps the row limit", () => {
    expect(widgetSpecSchema.safeParse({ limit: MAX_WIDGET_ROWS + 1 }).success).toBe(false);
  });

  it("keeps allowlisted vulnerability filters", () => {
    const parsed = widgetSpecSchema.parse({ filters: { risk: ["Critical"], status: ["Open"] } });
    expect(parsed.filters?.risk).toEqual(["Critical"]);
  });
});

describe("assertSpecIsCoherent", () => {
  it("rejects a grouping that does not belong to the source", () => {
    const spec = widgetSpecSchema.parse({ source: "threatActors", groupBy: "assignee" });
    expect(() => assertSpecIsCoherent(spec)).toThrow(/not a valid grouping/);
  });

  it("allows a valid source and grouping pair", () => {
    const spec = widgetSpecSchema.parse({ source: "threatActors", groupBy: "tactic" });
    expect(() => assertSpecIsCoherent(spec)).not.toThrow();
  });

  it("restricts avgCvss to vulnerabilities", () => {
    const spec = widgetSpecSchema.parse({ source: "uploads", metric: "avgCvss" });
    expect(() => assertSpecIsCoherent(spec)).toThrow(/Average CVSS/);
  });

  it("restricts filters to vulnerabilities", () => {
    const spec = widgetSpecSchema.parse({ source: "uploads", groupBy: "status", filters: { risk: ["High"] } });
    expect(() => assertSpecIsCoherent(spec)).toThrow(/Filters are only available/);
  });
});

describe("widgetSchema", () => {
  it("requires a title and a known visualisation", () => {
    expect(widgetSchema.safeParse({ title: "", viz: "bar", spec: {} }).success).toBe(false);
    expect(widgetSchema.safeParse({ title: "Findings", viz: "pyramid", spec: {} }).success).toBe(false);
  });

  it("clamps grid geometry", () => {
    expect(widgetSchema.safeParse({ title: "Findings", viz: "bar", spec: {}, w: 99 }).success).toBe(false);
  });
});
