import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  vulnerability: { findFirst: vi.fn(), create: vi.fn() },
  vulnerabilityHistory: { findUnique: vi.fn(), delete: vi.fn() },
  $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/rbac", () => ({
  requireUser: vi.fn(),
  WEB_APP_ADMIN_ROLES: ["site_admin", "web_app_admin"],
}));
vi.mock("../../lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("../../lib/audit-log", () => ({ writeAuditLog: vi.fn() }));

import { requireUser } from "../../lib/rbac";
import { enforceRateLimit } from "../../lib/rate-limit";
import { writeAuditLog } from "../../lib/audit-log";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
});

const vulnId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

function postReq() {
  return new Request(`http://localhost/api/vulnerabilities/${vulnId}/restore`, {
    method: "POST",
  }) as unknown;
}

const params = { params: Promise.resolve({ id: vulnId }) };

const historyRow = {
  id: vulnId,
  siteId: "s1",
  assigneeId: "u2",
  groupId: "g1",
  status: "Remediated",
  lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
  archivedAt: new Date("2026-02-01T00:00:00.000Z"),
  createdAt: new Date("2025-12-01T00:00:00.000Z"),
  scannerType: "NESSUS",
  pluginId: "12345",
  cve: "CVE-2026-0001",
  cvssScore: 7.5,
  risk: "High",
  host: "host1",
  protocol: "tcp",
  port: "443",
  name: "Finding",
  synopsis: null,
  description: null,
  solution: null,
  seeAlso: null,
  pluginOutput: null,
  pluginPublicationDate: null,
  pluginModificationDate: null,
  crNumber: null,
  registryName: null,
  repository: null,
  imageDigest: null,
  imageTag: null,
  packageName: null,
  installedVersion: null,
  remediation: null,
  timeGenerated: null,
};

describe("/api/vulnerabilities/[id]/restore POST", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
    const { POST } = await import("../../app/api/vulnerabilities/[id]/restore/route");
    const res = await POST(postReq() as any, params);
    expect(res.status).toBe(429);
  });

  it("returns 403 for non-admin users", async () => {
    vi.mocked(requireUser).mockResolvedValue({ user: { id: "u1", email: "u@x.com", roles: ["web_app_user"] } } as any);
    const { POST } = await import("../../app/api/vulnerabilities/[id]/restore/route");
    const res = await POST(postReq() as any, params);
    expect(res.status).toBe(403);
    expect(mockPrisma.vulnerabilityHistory.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the archived record does not exist", async () => {
    vi.mocked(requireUser).mockResolvedValue({ user: { id: "a1", email: "a@x.com", roles: ["site_admin"] } } as any);
    mockPrisma.vulnerabilityHistory.findUnique.mockResolvedValue(null);
    const { POST } = await import("../../app/api/vulnerabilities/[id]/restore/route");
    const res = await POST(postReq() as any, params);
    expect(res.status).toBe(404);
  });

  it("returns 409 when the same finding is already active", async () => {
    vi.mocked(requireUser).mockResolvedValue({ user: { id: "a1", email: "a@x.com", roles: ["site_admin"] } } as any);
    mockPrisma.vulnerabilityHistory.findUnique.mockResolvedValue(historyRow);
    mockPrisma.vulnerability.findFirst.mockResolvedValue({ id: "other-id" });
    const { POST } = await import("../../app/api/vulnerabilities/[id]/restore/route");
    const res = await POST(postReq() as any, params);
    expect(res.status).toBe(409);
    expect(mockPrisma.vulnerability.create).not.toHaveBeenCalled();
  });

  it("recreates the finding as Open and deletes the history row", async () => {
    vi.mocked(requireUser).mockResolvedValue({ user: { id: "a1", email: "a@x.com", roles: ["web_app_admin"] } } as any);
    mockPrisma.vulnerabilityHistory.findUnique.mockResolvedValue(historyRow);
    mockPrisma.vulnerability.findFirst.mockResolvedValue(null);
    mockPrisma.vulnerability.create.mockResolvedValue({ ...historyRow, status: "Open" });

    const { POST } = await import("../../app/api/vulnerabilities/[id]/restore/route");
    const res = await POST(postReq() as any, params);

    expect(res.status).toBe(200);
    const createArg = mockPrisma.vulnerability.create.mock.calls[0][0];
    expect(createArg.data.status).toBe("Open");
    expect(createArg.data.id).toBe(vulnId);
    expect(createArg.data.assigneeId).toBe("u2");
    expect(createArg.data.groupId).toBe("g1");
    expect(mockPrisma.vulnerabilityHistory.delete).toHaveBeenCalledWith({ where: { id: vulnId } });
    expect(vi.mocked(writeAuditLog)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "vulnerability.restored", oldValue: "Remediated", newValue: "Open" })
    );
    expect((await res.json()).recordScope).toBe("active");
  });
});
