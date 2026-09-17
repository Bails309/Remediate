// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      vulnerability: {
        findMany: vi.fn(),
      },
      site: {
        findUnique: vi.fn(),
      },
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/rbac", () => ({
  requireUser: vi.fn(),
  WEB_APP_ADMIN_ROLES: ["site_admin", "web_app_admin"],
}));
vi.mock("../../lib/rbac", () => ({
  requireUser: vi.fn(),
  WEB_APP_ADMIN_ROLES: ["site_admin", "web_app_admin"],
}));

vi.mock("@/lib/group-rbac", () => ({
  getGroupContext: vi.fn(async () => ({ memberOf: [] })),
}));
vi.mock("../../lib/group-rbac", () => ({
  getGroupContext: vi.fn(async () => ({ memberOf: [] })),
}));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("../../lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

import { requireUser } from "../../lib/rbac";
import { enforceRateLimit } from "../../lib/rate-limit";
import { getGroupContext } from "../../lib/group-rbac";
import { GET } from "../../app/api/vulnerabilities/export/route";

describe("vulnerabilities export route", () => {
  const sampleVulnerabilities = [
    {
      id: "vuln-1",
      name: "OpenSSH Vulnerability",
      risk: "High",
      status: "Open",
      host: "10.0.0.1",
      port: "22",
      protocol: "tcp",
      cve: "CVE-2024-6387",
      cvssScore: 8.1,
      pluginId: "12345",
      scannerType: "NESSUS",
      crNumber: "CR-100",
      synopsis: "OpenSSH flaw",
      description: "Remote code execution flaw",
      solution: "Upgrade to OpenSSH 9.8p1",
      seeAlso: "https://example.com/cve",
      pluginOutput: "SSH-2.0-OpenSSH_8.9p1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      lastSeenAt: new Date("2026-09-15T00:00:00.000Z"),
      site: { id: "00000000-0000-0000-0000-000000000001", name: "Production" },
      assignee: { id: "user-1", name: "Alice Security", email: "alice@example.com" },
      group: { id: "group-1", name: "SecOps" },
    },
    {
      id: "vuln-2",
      name: "=cmd|' /C calc'!A0 Formula Injection Test",
      risk: "Critical",
      status: "InProgress",
      host: "10.0.0.2",
      port: "443",
      protocol: "tcp",
      cve: "CVE-2024-1234",
      cvssScore: 9.8,
      pluginId: "67890",
      scannerType: "NESSUS",
      crNumber: null,
      synopsis: "Critical Web Flaw",
      description: "Test formula injection",
      solution: "Patch immediately",
      seeAlso: null,
      pluginOutput: null,
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      lastSeenAt: new Date("2026-09-16T00:00:00.000Z"),
      site: { id: "00000000-0000-0000-0000-000000000001", name: "Production" },
      assignee: null,
      group: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as never);
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "admin-user", email: "admin@example.com", roles: ["site_admin"] },
    } as never);
    mockPrisma.vulnerability.findMany.mockResolvedValue(sampleVulnerabilities);
    mockPrisma.site.findUnique.mockResolvedValue({ id: "00000000-0000-0000-0000-000000000001", name: "Production" });
  });

  it("exports CSV by default with appropriate headers and filename", async () => {
    const req = new NextRequest("http://localhost/api/vulnerabilities/export?siteId=00000000-0000-0000-0000-000000000001");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("attachment; filename=");
    expect(res.headers.get("Content-Disposition")).toContain("remediate-production-outstanding-vulnerabilities-");

    const text = await res.text();
    expect(text).toContain("ID,Report / Bucket,Title,Severity Level,Status,Host / Asset,Service / Port");
    expect(text).toContain("OpenSSH Vulnerability");
    expect(text).toContain("Production");
    // Verify formula injection sanitization: '=cmd...' is prepended with a quote and escaped
    expect(text).toContain("\"'=cmd|' /C calc'!A0 Formula Injection Test\"");
  });

  it("exports JSON when format=json parameter is provided", async () => {
    const req = new NextRequest("http://localhost/api/vulnerabilities/export?siteId=00000000-0000-0000-0000-000000000001&format=json");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Content-Disposition")).toContain(".json");

    const json = await res.json();
    expect(json.total).toBe(2);
    expect(json.bucket).toBe("Production");
    expect(json.report).toBe("Production");
    expect(json.vulnerabilities).toHaveLength(2);
    // Findings are sorted by severity level first: Critical before High
    expect(json.vulnerabilities[0].name).toBe("=cmd|' /C calc'!A0 Formula Injection Test");
    expect(json.vulnerabilities[0].severity).toBe("Critical");
    expect(json.vulnerabilities[0].service).toBe("443");
    expect(json.vulnerabilities[0].briefDescription).toBe("Critical Web Flaw");

    expect(json.vulnerabilities[1].name).toBe("OpenSSH Vulnerability");
    expect(json.vulnerabilities[1].title).toBe("OpenSSH Vulnerability");
    expect(json.vulnerabilities[1].severity).toBe("High");
    expect(json.vulnerabilities[1].service).toBe("22");
    expect(json.vulnerabilities[1].briefDescription).toBe("OpenSSH flaw");
    expect(json.vulnerabilities[1].assignee.name).toBe("Alice Security");
    expect(json.vulnerabilities[1].group.name).toBe("SecOps");
  });

  it("exports PDF when format=pdf parameter is provided", async () => {
    const req = new NextRequest("http://localhost/api/vulnerabilities/export?siteId=00000000-0000-0000-0000-000000000001&format=pdf");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain(".pdf");

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("defaults to outstanding statuses when no status is provided", async () => {
    const req = new NextRequest("http://localhost/api/vulnerabilities/export");
    await GET(req);

    expect(mockPrisma.vulnerability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: expect.arrayContaining(["Open", "InProgress", "InProgressWithCR", "AwaitingVendor"]),
          },
        }),
      })
    );
  });

  it("allows exporting all active statuses when includeAllStatuses=true", async () => {
    const req = new NextRequest("http://localhost/api/vulnerabilities/export?includeAllStatuses=true");
    await GET(req);

    const callArgs = mockPrisma.vulnerability.findMany.mock.calls[0][0];
    expect(callArgs.where.status).toBeUndefined();
  });

  it("enforces group visibility for non-admin users", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "normal-user", email: "user@example.com", roles: ["web_app_user"] },
    } as never);
    vi.mocked(getGroupContext).mockResolvedValue({ memberOf: ["group-allowed-1"] } as never);

    const req = new NextRequest("http://localhost/api/vulnerabilities/export");
    await GET(req);

    const callArgs = mockPrisma.vulnerability.findMany.mock.calls[0][0];
    expect(callArgs.where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: [{ groupId: null }, { groupId: { in: ["group-allowed-1"] } }],
        }),
      ])
    );
  });

  it("blocks requests when rate limit is exceeded", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as never);

    const req = new NextRequest("http://localhost/api/vulnerabilities/export");
    const res = await GET(req);

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe("Too many requests");
  });
});
