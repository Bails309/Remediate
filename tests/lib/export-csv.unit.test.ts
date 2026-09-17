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

  describe("sortVulnerabilitiesForExport", () => {
    const rawItems: VulnerabilityExportItem[] = [
      {
        id: "c-vm2-1",
        name: "Apache Log4j",
        risk: "Critical",
        status: "Open",
        host: "VM2",
        port: "443",
        protocol: "tcp",
        pluginId: "1",
        createdAt: new Date(),
        lastSeenAt: new Date(),
      },
      {
        id: "c-vm1-1",
        name: "Remote Code Execution",
        risk: "Critical",
        status: "Open",
        host: "VM1",
        port: "443",
        protocol: "tcp",
        pluginId: "2",
        cvssScore: 9.8,
        createdAt: new Date(),
        lastSeenAt: new Date(),
      },
      {
        id: "c-vm1-2",
        name: "Buffer Overflow",
        risk: "Critical",
        status: "Open",
        host: "VM1",
        port: "445",
        protocol: "tcp",
        pluginId: "3",
        cvssScore: 9.0,
        createdAt: new Date(),
        lastSeenAt: new Date(),
      },
      {
        id: "c-vm1-3",
        name: "SQL Injection",
        risk: "Critical",
        status: "Open",
        host: "VM1",
        port: "80",
        protocol: "tcp",
        pluginId: "4",
        cvssScore: 9.8,
        createdAt: new Date(),
        lastSeenAt: new Date(),
      },
      {
        id: "h-vm1-1",
        name: "SSL Certificate Weak Key",
        risk: "High",
        status: "Open",
        host: "VM1",
        port: "443",
        protocol: "tcp",
        pluginId: "5",
        createdAt: new Date(),
        lastSeenAt: new Date(),
      },
      {
        id: "h-vm2-1",
        name: "Node.js Privilege Escalation",
        risk: "High",
        status: "Open",
        host: "VM2",
        port: "3000",
        protocol: "tcp",
        pluginId: "6",
        createdAt: new Date(),
        lastSeenAt: new Date(),
      },
      {
        id: "h-vm2-2",
        name: "Out of bounds read",
        risk: "High",
        status: "Open",
        host: "VM2",
        port: "3000",
        protocol: "tcp",
        pluginId: "7",
        createdAt: new Date(),
        lastSeenAt: new Date(),
      },
      {
        id: "m-vm1-1",
        name: "HSTS Missing",
        risk: "Medium",
        status: "Open",
        host: "VM1",
        port: "80",
        protocol: "tcp",
        pluginId: "8",
        createdAt: new Date(),
        lastSeenAt: new Date(),
      },
    ];

    it("sorts by severity top level, then groups by VM with worst offending count higher up", () => {
      // In Critical tier: VM1 has 3 findings, VM2 has 1 finding -> VM1 comes before VM2
      // In High tier: VM2 has 2 findings, VM1 has 1 finding -> VM2 comes before VM1
      // In Medium tier: VM1 has 1 finding
      const csv = serializeVulnerabilitiesToCsv(rawItems);
      const rows = csv.split("\r\n").slice(1).map((line) => {
        const parts = line.split(",");
        // CSV columns: ID (0), Report (1), Title (2), Severity (3), Status (4), Host (5)
        return { id: parts[0], title: parts[2], severity: parts[3], host: parts[5] };
      });

      // 1. Criticals first
      expect(rows[0].severity).toBe("Critical");
      expect(rows[1].severity).toBe("Critical");
      expect(rows[2].severity).toBe("Critical");
      expect(rows[3].severity).toBe("Critical");

      // Criticals: VM1 (3 findings) must be before VM2 (1 finding)
      expect(rows[0].host).toBe("VM1");
      expect(rows[1].host).toBe("VM1");
      expect(rows[2].host).toBe("VM1");
      expect(rows[3].host).toBe("VM2");

      // 2. Highs next
      expect(rows[4].severity).toBe("High");
      expect(rows[5].severity).toBe("High");
      expect(rows[6].severity).toBe("High");

      // Highs: VM2 (2 findings) must be before VM1 (1 finding)
      expect(rows[4].host).toBe("VM2");
      expect(rows[5].host).toBe("VM2");
      expect(rows[6].host).toBe("VM1");

      // 3. Mediums next
      expect(rows[7].severity).toBe("Medium");
      expect(rows[7].host).toBe("VM1");
    });

    it("sorts JSON exports with the exact same prioritization", () => {
      const jsonStr = serializeVulnerabilitiesToJson(rawItems);
      const parsed = JSON.parse(jsonStr);
      const hostsAndRisks = parsed.vulnerabilities.map(
        (v: { severity: string; host: string }) => `${v.severity}:${v.host}`
      );

      expect(hostsAndRisks).toEqual([
        "Critical:VM1",
        "Critical:VM1",
        "Critical:VM1",
        "Critical:VM2",
        "High:VM2",
        "High:VM2",
        "High:VM1",
        "Medium:VM1",
      ]);
    });
  });
});
