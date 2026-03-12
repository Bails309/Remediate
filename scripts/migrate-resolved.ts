import { prisma } from "../lib/prisma";
import type { Prisma } from "@prisma/client";

async function run() {
    const resolved = await prisma.vulnerability.findMany({
        where: {
            status: { in: ["Remediated", "FalsePositive", "NoFixAvailable"] }
        }
    });

    if (resolved.length === 0) {
        console.log("No resolved vulnerabilities found in active table.");
        return;
    }

    console.log(`Found ${resolved.length} resolved vulnerabilities to archive.`);

    const now = new Date();
    await prisma.$transaction([
        prisma.vulnerabilityHistory.createMany({
            data: resolved.map(v => ({
                id: v.id,
                siteId: v.siteId,
                assigneeId: v.assigneeId,
                status: v.status,
                lastSeenAt: v.lastSeenAt,
                archivedAt: now,
                createdAt: v.createdAt,
                pluginId: v.pluginId,
                cve: v.cve,
                cvssScore: v.cvssScore,
                risk: v.risk,
                host: v.host,
                protocol: v.protocol,
                port: v.port,
                name: v.name,
                synopsis: v.synopsis,
                description: v.description,
                solution: v.solution,
                seeAlso: v.seeAlso,
                pluginOutput: v.pluginOutput,
                pluginPublicationDate: v.pluginPublicationDate,
                pluginModificationDate: v.pluginModificationDate
            })) as Prisma.VulnerabilityHistoryCreateManyInput[]
        }),
        prisma.vulnerability.deleteMany({
            where: { id: { in: resolved.map(v => v.id) } }
        })
    ]);

    console.log("Migration complete.");
}

run().catch(console.error).finally(() => prisma.$disconnect());
