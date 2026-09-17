// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateVulnerabilitiesPdf } from "../../lib/export-pdf";
import { VulnerabilityExportItem } from "../../lib/export-csv";

describe("export-pdf generator", () => {
  const sampleItems: VulnerabilityExportItem[] = [
    {
      id: "vuln-1",
      name: "Remote Code Execution in Apache",
      risk: "Critical",
      status: "Open",
      host: "web01.production.internal",
      port: "443",
      protocol: "tcp",
      cve: "CVE-2024-9999",
      cvssScore: 9.8,
      pluginId: "12345",
      scannerType: "NESSUS",
      crNumber: "CR-9001",
      synopsis: "Critical vulnerability in web server",
      description: "An attacker could execute arbitrary commands.",
      solution: "Upgrade to the latest patched version immediately.",
      seeAlso: "https://example.com/advisory",
      pluginOutput: "Apache/2.4.49 detected",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      lastSeenAt: new Date("2026-09-15T00:00:00.000Z"),
      site: { id: "00000000-0000-0000-0000-000000000001", name: "Production" },
      assignee: { id: "u-1", name: "Jane Security", email: "jane@example.com" },
      group: { id: "g-1", name: "Infrastructure" },
    },
    {
      id: "vuln-2",
      name: "TLS 1.0 / 1.1 Deprecation",
      risk: "Medium",
      status: "InProgress",
      host: "api.production.internal",
      port: "8443",
      protocol: "tcp",
      cve: null,
      cvssScore: 5.3,
      pluginId: "67890",
      scannerType: "NESSUS",
      crNumber: null,
      synopsis: "Legacy encryption protocols enabled",
      description: "Server accepts outdated TLS versions.",
      solution: "Disable TLS 1.0 and 1.1 in web server SSL config.",
      seeAlso: null,
      pluginOutput: null,
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      lastSeenAt: new Date("2026-09-16T00:00:00.000Z"),
      site: { id: "00000000-0000-0000-0000-000000000001", name: "Production" },
      assignee: null,
      group: null,
    },
  ];

  it("generates a valid PDF document with findings and header", async () => {
    const pdfBuffer = await generateVulnerabilitiesPdf(sampleItems, {
      bucketName: "Production",
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    // Verify valid PDF file signature
    expect(pdfBuffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("handles empty items list gracefully", async () => {
    const pdfBuffer = await generateVulnerabilitiesPdf([], {
      bucketName: "Empty Bucket",
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
