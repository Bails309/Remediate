import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "../../app/api/buckets/route";
import { prisma } from "../../lib/prisma";
import { NextRequest } from "next/server";

// Mock RBAC and rate limit
vi.mock("../../lib/rbac", () => ({
    requireUser: vi.fn().mockResolvedValue({ id: "u1", email: "user@test.com" }),
    requireAdmin: vi.fn().mockResolvedValue({ id: "u1", email: "user@test.com" }),
}));
vi.mock("../../lib/rate-limit", () => ({
    enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

describe("Buckets API Integration", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        // Cleanup in correct order
        await prisma.vulnerability.deleteMany();
        await (prisma as unknown as { vulnerabilityHistory: { deleteMany: () => Promise<unknown> } }).vulnerabilityHistory.deleteMany();
        await prisma.uploadHistory.deleteMany();
        await prisma.site.deleteMany();
    });

    it("POST /api/buckets creates a new bucket", async () => {
        const req = new NextRequest("http://localhost/api/buckets", {
            method: "POST",
            body: JSON.stringify({ name: "Berlin Data Centre" })
        });

        const res = await POST(req);
        expect(res.status).toBe(201);

        const data = await res.json();
        expect(data.name).toBe("Berlin Data Centre");

        const dbSite = await prisma.site.findFirst({ where: { name: "Berlin Data Centre" } });
        expect(dbSite).toBeDefined();
    });

    it("GET /api/buckets returns list of buckets", async () => {
        await prisma.site.create({ data: { name: "Bucket A" } });
        await prisma.site.create({ data: { name: "Bucket B" } });

        const req = new NextRequest("http://localhost/api/buckets");
        const res = await GET(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.length).toBe(2);
        expect(data[0].name).toBe("Bucket A");
    });
});
