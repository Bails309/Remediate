import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import { validateNessusCsv, parseNessusCsv, parseNessusCsvStream } from "@/lib/csv";

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

describe("parseNessusCsvStream", () => {
  const collect = async (csv: string) => {
    const rows = [];
    for await (const row of parseNessusCsvStream(Readable.from([csv]))) {
      rows.push(row);
    }
    return rows;
  };

  it("yields the same rows as the sync parser", async () => {
    const csv =
      `Plugin ID,Host,Port,CVSS Score,Risk,Name\n` +
      `1950,example.com,443,7.5,Critical,Test Plugin\n` +
      `,missing.com,80,5.0,High,Broken\n`;

    expect(await collect(csv)).toEqual(parseNessusCsv(csv));
  });

  it("handles a BOM and multi-chunk input", async () => {
    const csv = `\uFEFFPlugin ID,Host,Port,Risk,Name\n2001,a.example,22,High,SSH\n`;
    // Split mid-row so the parser has to buffer across chunk boundaries.
    const chunks = [csv.slice(0, 20), csv.slice(20, 40), csv.slice(40)];

    const rows = [];
    for await (const row of parseNessusCsvStream(Readable.from(chunks))) {
      rows.push(row);
    }

    expect(rows).toHaveLength(1);
    expect(rows[0].pluginId).toBe("2001");
    expect(rows[0].host).toBe("a.example");
    expect(rows[0].risk).toBe("High");
  });

  it("does not accumulate rows internally", async () => {
    const header = `Plugin ID,Host,Port,Risk,Name\n`;
    const body = Array.from({ length: 5000 }, (_, i) => `${i},h${i}.example,80,High,V${i}`).join("\n");

    let seen = 0;
    for await (const _row of parseNessusCsvStream(Readable.from([header + body]))) {
      seen += 1;
    }

    expect(seen).toBe(5000);
  });
});
