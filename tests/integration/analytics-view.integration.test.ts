import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../lib/prisma";

describe("Analytics View Integration", () => {
    let site: any;

    beforeAll(async () => {
        // Ensure the view exists in the test database
        await prisma.$executeRawUnsafe(`
            CREATE OR REPLACE VIEW "VulnerabilityView" AS
            SELECT 
                id, "siteId", "assigneeId", status, "lastSeenAt", "createdAt", "pluginId", cve, "cvssScore", risk, host, protocol, port, name, false as "isHistory"
            FROM "Vulnerability"
            UNION ALL
            SELECT 
                id, "siteId", "assigneeId", status, "lastSeenAt", "createdAt", "pluginId", cve, "cvssScore", risk, host, protocol, port, name, true as "isHistory"
            FROM "VulnerabilityHistory";
        `);
    });

    beforeEach(async () => {
        await prisma.vulnerability.deleteMany();
        await (prisma as any).vulnerabilityHistory.deleteMany();
        await prisma.uploadHistory.deleteMany();
        await prisma.site.deleteMany();
        await prisma.user.deleteMany();

        site = await prisma.site.create({
            data: { name: "Test Site" }
        });
    });

    it("VulnerabilityView should combine data from both tables", async () => {
        // 1. Create active vulnerability
        await prisma.vulnerability.create({
            data: {
                pluginId: "123",
                name: "Active Bug",
                risk: "High",
                host: "localhost",
                protocol: "tcp",
                port: "80",
                status: "Open",
                siteId: site.id,
                lastSeenAt: new Date(),
            }
        });

        // 2. Create historical vulnerability
        await (prisma as any).vulnerabilityHistory.create({
            data: {
                pluginId: "456",
                name: "Old Bug",
                risk: "Critical",
                host: "remote",
                protocol: "tcp",
                port: "443",
                status: "Remediated",
                siteId: site.id,
                archivedAt: new Date(),
                lastSeenAt: new Date(),
                createdAt: new Date(),
            }
        });

        // 3. Query the view
        const results: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM "VulnerabilityView" ORDER BY name ASC`);

        expect(results.length).toBe(2);

        const active = results.find(r => r.name === "Active Bug");
        const history = results.find(r => r.name === "Old Bug");

        expect(active).toBeDefined();
        expect(active.isHistory).toBe(false);

        expect(history).toBeDefined();
        expect(history.isHistory).toBe(true);
    });
});
