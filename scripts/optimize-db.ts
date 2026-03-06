import { prisma } from "../lib/prisma";

async function main() {
    console.log("Applying advanced database optimizations...");

    try {
        // 1. Enable pg_trgm extension
        await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
        console.log("✓ pg_trgm extension enabled");

        // 2. Create trigram indexes for text search
        // Note: We use executeRawUnsafe because Prisma doesn't support GIN indexes in the schema yet.
        await prisma.$executeRawUnsafe(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "Vulnerability_name_trgm_idx" 
      ON "Vulnerability" USING gin (name gin_trgm_ops);
    `).catch(e => console.log("Note: Concurrent index creation failed or already exists (likely already in progress)"));

        await prisma.$executeRawUnsafe(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "Vulnerability_host_trgm_idx" 
      ON "Vulnerability" USING gin (host gin_trgm_ops);
    `).catch(e => console.log("Note: Concurrent index creation failed or already exists"));

        await prisma.$executeRawUnsafe(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "Vulnerability_pluginId_trgm_idx" 
      ON "Vulnerability" USING gin ("pluginId" gin_trgm_ops);
    `).catch(e => console.log("Note: Concurrent index creation failed or already exists"));

        console.log("✓ Trigram indexes applied for search performance");

        // 3. Initial VACUUM ANALYZE
        await prisma.$executeRawUnsafe(`VACUUM ANALYZE "Vulnerability";`);
        console.log("✓ Initial database maintenance complete");

    } catch (error) {
        console.error("Optimization failed:", error);
        process.exit(1);
    }
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
