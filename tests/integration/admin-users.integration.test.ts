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
        await prisma.user.deleteMany();

        adminUser = await prisma.user.create({
            data: {
                email: "admin@test.com",
                name: "Admin",
                role: "Admin"
            }
        });

        targetUser = await prisma.user.create({
            data: {
                email: "user@test.com",
                name: "User",
                role: "User"
            }
        });

        // Mock admin session
        vi.mocked(auth).mockResolvedValue({
            user: {
                id: adminUser.id,
                email: adminUser.email,
                role: "Admin"
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
                role: "Admin"
            })
        });

        const res = await PATCH(req);
        expect(res.status).toBe(200);

        const updated = await prisma.user.findUnique({ where: { id: targetUser.id } });
        expect(updated?.role).toBe("Admin");
    });

    it("PATCH /api/admin/users prevents removing the last admin", async () => {
        // Try to demote self
        const req = new NextRequest("http://localhost/api/admin/users", {
            method: "PATCH",
            body: JSON.stringify({
                userId: adminUser.id,
                role: "User"
            })
        });

        const res = await PATCH(req);
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toBe("Cannot remove last admin");

        const updated = await prisma.user.findUnique({ where: { id: adminUser.id } });
        expect(updated?.role).toBe("Admin");
    });
});
