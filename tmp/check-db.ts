import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const vulns = await prisma.vulnerability.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        select: {
            name: true,
            pluginId: true,
            pluginPublicationDate: true,
            pluginModificationDate: true,
            createdAt: true,
            risk: true
        }
    });

    console.log(JSON.stringify(vulns, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
