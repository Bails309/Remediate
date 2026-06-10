import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockPrisma = {
    group: {
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        findUnique: vi.fn(),
    },
    groupMembership: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
    },
    user: {
        findUnique: vi.fn(),
    },
    vulnerability: {
        count: vi.fn(),
        updateMany: vi.fn(),
    },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/rbac", () => ({
    checkAdmin: vi.fn(),
    WEB_APP_ADMIN_ROLES: ["site_admin", "web_app_admin"],
}));
vi.mock("../../lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("../../lib/audit-log", () => ({ writeAuditLog: vi.fn() }));

import { auth } from "../../auth";
import { checkAdmin } from "../../lib/rbac";
import { enforceRateLimit } from "../../lib/rate-limit";

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
});

describe("/api/groups (unit)", () => {
    it("GET returns 401 without session", async () => {
        vi.mocked(auth).mockResolvedValue(null as any);
        const { GET } = await import("../../app/api/groups/route");
        const res = await GET(new NextRequest("http://localhost/api/groups"));
        expect(res.status).toBe(401);
    });

    it("GET returns all groups for admin", async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: "u1", roles: ["web_app_admin"] } } as any);
        vi.mocked(checkAdmin).mockReturnValue(true as any);
        mockPrisma.group.findMany.mockResolvedValueOnce([
            {
                id: "g1",
                name: "Net",
                description: null,
                _count: { memberships: 2, vulnerabilities: 5 },
            },
        ]);
        mockPrisma.groupMembership.findMany.mockResolvedValueOnce([]);
        const { GET } = await import("../../app/api/groups/route");
        const res = await GET(new NextRequest("http://localhost/api/groups"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body[0].memberCount).toBe(2);
        expect(body[0].vulnerabilityCount).toBe(5);
    });

    it("GET returns only the user's groups for non-admin", async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: "u1", roles: ["web_app_user"] } } as any);
        vi.mocked(checkAdmin).mockReturnValue(false as any);
        // getGroupContext call
        mockPrisma.groupMembership.findMany.mockResolvedValueOnce([
            { groupId: "g1", role: "leader" },
        ]);
        // group.findMany call
        mockPrisma.group.findMany.mockResolvedValueOnce([
            {
                id: "g1",
                name: "Net",
                description: null,
                _count: { memberships: 3, vulnerabilities: 7 },
            },
        ]);
        const { GET } = await import("../../app/api/groups/route");
        const res = await GET(new NextRequest("http://localhost/api/groups"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveLength(1);
        expect(body[0].viewerRole).toBe("leader");
    });

    it("POST rejects non-admin", async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: "u1", roles: ["web_app_user"] } } as any);
        vi.mocked(checkAdmin).mockReturnValue(false as any);
        const { POST } = await import("../../app/api/groups/route");
        const req = new Request("http://localhost/api/groups", {
            method: "POST",
            body: JSON.stringify({ name: "X" }),
        });
        const res = await POST(req as any);
        expect(res.status).toBe(403);
    });

    it("POST creates a group as admin", async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: "u1", roles: ["site_admin"] } } as any);
        vi.mocked(checkAdmin).mockReturnValue(true as any);
        mockPrisma.group.create.mockResolvedValueOnce({ id: "g1", name: "Net", description: null });
        const { POST } = await import("../../app/api/groups/route");
        const req = new Request("http://localhost/api/groups", {
            method: "POST",
            body: JSON.stringify({ name: "Net" }),
        });
        const res = await POST(req as any);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.id).toBe("g1");
    });

    it("POST returns 409 on duplicate name", async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: "u1", roles: ["site_admin"] } } as any);
        vi.mocked(checkAdmin).mockReturnValue(true as any);
        const err: any = new Error("duplicate");
        err.code = "P2002";
        mockPrisma.group.create.mockRejectedValueOnce(err);
        const { POST } = await import("../../app/api/groups/route");
        const req = new Request("http://localhost/api/groups", {
            method: "POST",
            body: JSON.stringify({ name: "Net" }),
        });
        const res = await POST(req as any);
        expect(res.status).toBe(409);
    });
});

describe("/api/groups/[id] (unit)", () => {
    it("DELETE returns 409 if group still owns vulns and no force", async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: "u1", roles: ["site_admin"] } } as any);
        vi.mocked(checkAdmin).mockReturnValue(true as any);
        mockPrisma.vulnerability.count.mockResolvedValueOnce(3);
        const { DELETE } = await import("../../app/api/groups/[id]/route");
        const res = await DELETE(new Request("http://localhost/api/groups/g1", { method: "DELETE" }) as any, {
            params: Promise.resolve({ id: "g1" }),
        });
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.activeCount).toBe(3);
    });

    it("DELETE force=true succeeds even with active vulns", async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: "u1", roles: ["site_admin"] } } as any);
        vi.mocked(checkAdmin).mockReturnValue(true as any);
        mockPrisma.vulnerability.count.mockResolvedValueOnce(3);
        mockPrisma.group.delete.mockResolvedValueOnce({ id: "g1" });
        const { DELETE } = await import("../../app/api/groups/[id]/route");
        const res = await DELETE(new Request("http://localhost/api/groups/g1?force=true", { method: "DELETE" }) as any, {
            params: Promise.resolve({ id: "g1" }),
        });
        expect(res.status).toBe(200);
    });
});

describe("/api/groups/[id]/members (unit)", () => {
    it("POST rejects non-admin non-leader", async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: "11111111-1111-4111-8111-111111111111", roles: ["web_app_user"] } } as any);
        vi.mocked(checkAdmin).mockReturnValue(false as any);
        mockPrisma.groupMembership.findMany.mockResolvedValueOnce([]); // not a leader
        const { POST } = await import("../../app/api/groups/[id]/members/route");
        const req = new Request("http://localhost/api/groups/g1/members", {
            method: "POST",
            body: JSON.stringify({ userId: "22222222-2222-4222-8222-222222222222", role: "member" }),
        });
        const res = await POST(req as any, { params: Promise.resolve({ id: "g1" }) });
        expect(res.status).toBe(403);
    });

    it("POST allows leader to add a member", async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: "33333333-3333-4333-8333-333333333333", email: "l@example.com", roles: ["web_app_user"] } } as any);
        vi.mocked(checkAdmin).mockReturnValue(false as any);
        // leader of g1
        mockPrisma.groupMembership.findMany.mockResolvedValueOnce([{ groupId: "g1", role: "leader" }]);
        mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "44444444-4444-4444-8444-444444444444" });
        mockPrisma.groupMembership.create.mockResolvedValueOnce({ groupId: "g1", userId: "44444444-4444-4444-8444-444444444444", role: "member" });
        const { POST } = await import("../../app/api/groups/[id]/members/route");
        const req = new Request("http://localhost/api/groups/g1/members", {
            method: "POST",
            body: JSON.stringify({ userId: "44444444-4444-4444-8444-444444444444", role: "member" }),
        });
        const res = await POST(req as any, { params: Promise.resolve({ id: "g1" }) });
        expect(res.status).toBe(200);
    });

    it("DELETE prevents non-admin from removing the last leader", async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: "55555555-5555-4555-8555-555555555555", roles: ["web_app_user"] } } as any);
        vi.mocked(checkAdmin).mockReturnValue(false as any);
        mockPrisma.groupMembership.findMany.mockResolvedValueOnce([{ groupId: "g1", role: "leader" }]);
        mockPrisma.groupMembership.findUnique.mockResolvedValueOnce({ role: "leader" });
        mockPrisma.groupMembership.count.mockResolvedValueOnce(1);

        const { DELETE } = await import("../../app/api/groups/[id]/members/route");
        const req = new Request("http://localhost/api/groups/g1/members", {
            method: "DELETE",
            body: JSON.stringify({ userId: "55555555-5555-4555-8555-555555555555" }),
        });
        const res = await DELETE(req as any, { params: Promise.resolve({ id: "g1" }) });
        expect(res.status).toBe(400);
    });
});
