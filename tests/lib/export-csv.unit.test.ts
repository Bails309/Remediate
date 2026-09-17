import { describe, expect, it } from "vitest";
import {
  sanitizeAndEscapeCsvCell,
  serializeVulnerabilitiesToCsv,
  serializeVulnerabilitiesToJson,
  CSV_COLUMNS,
  VulnerabilityExportItem,
} from "../../lib/export-csv";

describe("export-csv library", () => {
  describe("sanitizeAndEscapeCsvCell", () => {
    it("handles null and undefined", () => {
      expect(sanitizeAndEscapeCsvCell(null)).toBe("");
      expect(sanitizeAndEscapeCsvCell(undefined)).toBe("");
    });

    it("leaves regular strings and numbers unchanged", () => {
      expect(sanitizeAndEscapeCsvCell("hello world")).toBe("hello world");
      expect(sanitizeAndEscapeCsvCell(42)).toBe("42");
    });

    it("quotes cells with commas, quotes, and newlines and escapes internal quotes", () => {
      expect(sanitizeAndEscapeCsvCell('hello, "world"')).toBe('"hello, ""world"""');
      expect(sanitizeAndEscapeCsvCell("multi\nline")).toBe('"multi\nline"');
    });

    it("neutralizes potential spreadsheet formula injection", () => {
      expect(sanitizeAndEscapeCsvCell("=1+1")).toBe("\"'=1+1\"");
      expect(sanitizeAndEscapeCsvCell("+cmd|' /C calc'!A0")).toBe("\"'+cmd|' /C calc'!A0\"");
      expect(sanitizeAndEscapeCsvCell("-100")).toBe("\"'-100\"");
      expect(sanitizeAndEscapeCsvCell("@SUM(A1:A10)")).toBe("\"'@SUM(A1:A10)\"");
    });
  });

  describe("serializeVulnerabilitiesToCsv", () => {
    const item: VulnerabilityExportItem = {
      id: "v-1",
      name: "Test Finding",
      risk: "High",
      status: "Open",
      host: "web01.internal",
      port: "8080",
      protocol: "tcp",
      cve: "CVE-2025-0001",
      cvssScore: 7.5,
      pluginId: "999",
      scannerType: "NESSUS",
      crNumber: "CR-42",
      synopsis: "Short summary",
      description: "Full description with, comma and \"quotes\"",
      solution: "Apply patch",
      seeAlso: "https://example.com",
      pluginOutput: "Detected version 1.0",
      createdAt: new Date("2026-03-01T12:00:00Z"),
      lastSeenAt: new Date("2026-03-02T12:00:00Z"),
      site: { id: "site-1", name: "Staging" },
      assignee: { id: "u-1", name: "Bob Dev", email: "bob@example.com" },
      group: { id: "g-1", name: "Engineering" },
    };

    it("serializes with header row and properly formatted columns", () => {
      const csv = serializeVulnerabilitiesToCsv([item]);
      const lines = csv.split("\r\n");

      expect(lines.length).toBe(2);
      expect(lines[0]).toBe(CSV_COLUMNS.join(","));
      expect(lines[1]).toContain("Staging");
      expect(lines[1]).toContain("Test Finding");
      expect(lines[1]).toContain("web01.internal");
      expect(lines[1]).toContain('"Full description with, comma and ""quotes"""');
      expect(lines[1]).toContain("Bob Dev");
      expect(lines[1]).toContain("bob@example.com");
    });
  });

  describe("serializeVulnerabilitiesToJson", () => {
    const item: VulnerabilityExportItem = {
      id: "v-1",
      name: "Test Finding",
      risk: "Critical",
      status: "Open",
      host: "db01.internal",
      port: "5432",
      protocol: "tcp",
      pluginId: "123",
      createdAt: "2026-03-01T12:00:00Z",
      lastSeenAt: "2026-03-02T12:00:00Z",
      site: { id: "site-1", name: "Production" },
    };

    it("serializes to structured JSON with metadata", () => {
      const jsonStr = serializeVulnerabilitiesToJson([item], {
        bucketName: "Production",
        filters: { risk: "Critical" },
      });
      const parsed = JSON.parse(jsonStr);

      expect(parsed.total).toBe(1);
      expect(parsed.bucket).toBe("Production");
      expect(parsed.filters).toEqual({ risk: "Critical" });
      expect(parsed.vulnerabilities[0].id).toBe("v-1");
      expect(parsed.vulnerabilities[0].name).toBe("Test Finding");
      expect(parsed.vulnerabilities[0].title).toBe("Test Finding");
      expect(parsed.vulnerabilities[0].bucket).toBe("Production");
      expect(parsed.vulnerabilities[0].report).toBe("Production");
      expect(parsed.vulnerabilities[0].service).toBe("5432");
      expect(parsed.vulnerabilities[0].severity).toBe("Critical");
    });
  });
});
