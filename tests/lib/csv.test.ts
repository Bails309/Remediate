import { describe, it, expect } from "vitest";
import { validateNessusCsv, parseNessusCsv } from "@/lib/csv";

describe("validateNessusCsv", () => {
  it("validates required headers (case-insensitive, BOM)", () => {
    const input = "\uFEFFPlugin ID,Host,Port\n";
    expect(validateNessusCsv(input)).toEqual({ ok: true });
  });

  it("reports missing headers", () => {
    const input = "Host,Port\n";
    const res = validateNessusCsv(input);
    expect(res.ok).toBe(false);
    expect(res.missing).toContain("pluginId");
  });
});

describe("parseNessusCsv", () => {
  it("parses rows and converts cvss score to number and skips invalid rows", () => {
    const csv =
      `Plugin ID,Host,Port,CVSS Score,Risk,Name\n` +
      `1950,example.com,443,7.5,Critical,Test Plugin\n` +
      `,missing.com,80,5.0,High,Broken\n`;

    const rows = parseNessusCsv(csv);
    expect(rows.length).toBe(1);
    const r = rows[0];
    expect(r.pluginId).toBe("1950");
    expect(r.cvssScore).toBe(7.5);
    expect(r.risk).toBe("Critical");
    expect(r.host).toBe("example.com");
    expect(r.port).toBe("443");
    expect(r.name).toBe("Test Plugin");
  });
});
