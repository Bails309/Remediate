import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  pentestExecution: { findMany: vi.fn() },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/rbac", () => ({
  requireToolkitUser: vi.fn(),
  hasAnyRole: vi.fn(),
  TOOLKIT_ADMIN_ROLES: ["site_admin", "toolkit_admin"],
}));

import { requireToolkitUser, hasAnyRole } from "../../lib/rbac";

beforeEach(() => vi.clearAllMocks());

describe("/api/tools/logs GET", () => {
  it("returns all logs for admin users", async () => {
    vi.mocked(requireToolkitUser).mockResolvedValue({
      user: { id: "admin1", roles: ["site_admin"] },
    } as any);
    vi.mocked(hasAnyRole).mockReturnValue(true);
    mockPrisma.pentestExecution.findMany.mockResolvedValue([
      { id: "log1", userId: "admin1" },
      { id: "log2", userId: "user1" },
    ]);

    const { GET } = await import("../../app/api/tools/logs/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toHaveLength(2);
    // Admin should query without user filter
    expect(mockPrisma.pentestExecution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined })
    );
  });

  it("returns only own logs for standard toolkit users", async () => {
    vi.mocked(requireToolkitUser).mockResolvedValue({
      user: { id: "user1", roles: ["toolkit_user"] },
    } as any);
    vi.mocked(hasAnyRole).mockReturnValue(false);
    mockPrisma.pentestExecution.findMany.mockResolvedValue([
      { id: "log1", userId: "user1" },
    ]);

    const { GET } = await import("../../app/api/tools/logs/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toHaveLength(1);
    // Non-admin should filter by userId
    expect(mockPrisma.pentestExecution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user1" } })
    );
  });
});
