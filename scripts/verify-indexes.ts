import { prisma } from "../lib/prisma";

async function main() {
    const indexes = await prisma.$queryRawUnsafe(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'Vulnerability';
  `);
    console.log(JSON.stringify(indexes, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
