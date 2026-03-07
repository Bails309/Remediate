import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH } from "../../app/api/admin/users/route";
import { prisma } from "../../lib/prisma";
import { NextRequest } from "next/server";
import { User } from "@prisma/client";

// Mock auth and rate limit
vi.mock("../../auth", () => ({
    auth: vi.fn(),
}));
vi.mock("../../lib/rate-limit", () => ({
    enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { auth } from "../../auth";

describe("Admin Users API Integration", () => {
    let adminUser: User;
    let targetUser: User;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Cleanup in correct order
        await prisma.vulnerability.deleteMany();
        await (prisma as unknown as { vulnerabilityHistory: { deleteMany: () => Promise<unknown> } }).vulnerabilityHistory.deleteMany();
        await prisma.uploadHistory.deleteMany();
        // Ensure pentest execution logs removed before deleting users to avoid FK constraints
        await prisma.pentestExecution.deleteMany();
        await prisma.user.deleteMany();

        adminUser = await prisma.user.create({
            data: {
                email: "admin@test.com",
                name: "Admin",
                roles: ["site_admin", "web_app_admin", "pentest_admin", "web_app_user", "pentest_user"]
            }
        });

        targetUser = await prisma.user.create({
            data: {
                email: "user@test.com",
                name: "User",
                roles: ["web_app_user"]
            }
        });

        // Mock admin session
        vi.mocked(auth).mockResolvedValue({
            user: {
                id: adminUser.id,
                email: adminUser.email,
                roles: ["site_admin", "web_app_admin", "pentest_admin", "web_app_user", "pentest_user"]
            }
        } as any);
    });

    it("GET /api/admin/users returns all users", async () => {
        const req = new NextRequest("http://localhost/api/admin/users");
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json() as User[];
        expect(data.length).toBeGreaterThanOrEqual(2);
        expect(data.find((u) => u.email === targetUser.email)).toBeDefined();
    });

    it("PATCH /api/admin/users can promote a user", async () => {
        const req = new NextRequest("http://localhost/api/admin/users", {
            method: "PATCH",
            body: JSON.stringify({
                userId: targetUser.id,
                roles: ["site_admin", "web_app_admin", "web_app_user"]
            })
        });

        const res = await PATCH(req);
        expect(res.status).toBe(200);

        const updated = await prisma.user.findUnique({ where: { id: targetUser.id } });
        expect(updated?.roles).toContain("site_admin");
    });

    it("PATCH /api/admin/users prevents removing the last admin", async () => {
        // Try to demote self
        const req = new NextRequest("http://localhost/api/admin/users", {
            method: "PATCH",
            body: JSON.stringify({
                userId: adminUser.id,
                roles: ["web_app_user"]
            })
        });

        const res = await PATCH(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toBe("Cannot remove last site admin");

        const updated = await prisma.user.findUnique({ where: { id: adminUser.id } });
        expect(updated?.roles).toContain("site_admin");
    });
});
