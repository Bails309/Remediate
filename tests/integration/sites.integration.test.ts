import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "../../app/api/sites/route";
import { prisma } from "../../lib/prisma";
import { NextRequest } from "next/server";

// Mock RBAC and rate limit
vi.mock("../../lib/rbac", () => ({
    requireUser: vi.fn().mockResolvedValue({ id: "u1", email: "user@test.com" }),
}));
vi.mock("../../lib/rate-limit", () => ({
    enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

describe("Sites API Integration", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        // Cleanup in correct order
        await prisma.vulnerability.deleteMany();
        await (prisma as any).vulnerabilityHistory.deleteMany();
        await prisma.uploadHistory.deleteMany();
        await prisma.site.deleteMany();
    });

    it("POST /api/sites creates a new site", async () => {
        const req = new NextRequest("http://localhost/api/sites", {
            method: "POST",
            body: JSON.stringify({ name: "Berlin Data Center" })
        });

        const res = await POST(req);
        expect(res.status).toBe(201);

        const data = await res.json();
        expect(data.name).toBe("Berlin Data Center");

        const dbSite = await prisma.site.findFirst({ where: { name: "Berlin Data Center" } });
        expect(dbSite).toBeDefined();
    });

    it("GET /api/sites returns list of sites", async () => {
        await prisma.site.create({ data: { name: "Site A" } });
        await prisma.site.create({ data: { name: "Site B" } });

        const req = new NextRequest("http://localhost/api/sites");
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.length).toBe(2);
        expect(data[0].name).toBe("Site A");
    });
});
