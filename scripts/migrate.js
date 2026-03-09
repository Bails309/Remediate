; (async () => {
  const { execSync } = require("child_process");

  let PrismaClient;
  try {
    ({ PrismaClient } = require("@prisma/client"));
  } catch {
    // ESM-only fallback
    const mod = await import("@prisma/client");
    PrismaClient = mod.PrismaClient;
  }

  const LOCK_ID = 4815162342;
  const MAX_RETRIES = 20;
  const RETRY_DELAY_MS = 3000;

  async function waitForDatabase(prisma) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        await prisma.$executeRawUnsafe("SELECT 1");
        return;
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  async function checkAndFixMigrations(prisma) {
    try {
      const fs = require("fs");
      const path = require("path");

      // 1. Get current migrations in DB
      const dbMigrations = await prisma.$queryRawUnsafe(
        'SELECT migration_name, finished_at FROM _prisma_migrations'
      );

      if (!dbMigrations || dbMigrations.length === 0) return;

      const migrationDir = path.join(__dirname, "..", "prisma", "migrations");
      const onDisk = fs.existsSync(migrationDir)
        ? fs.readdirSync(migrationDir).filter(f => fs.statSync(path.join(migrationDir, f)).isDirectory())
        : [];

      console.log(`[Migrate] Found ${dbMigrations.length} migrations in DB. Checking for stale/failed records...`);

      for (const m of dbMigrations) {
        const name = m.migration_name;
        let shouldDelete = false;

        // 2. Detect stale records (deleted from disk/rollup case)
        if (!onDisk.includes(name)) {
          console.log(`[Migrate] Stale record detected (not on disk): ${name}`);
          shouldDelete = true;
        }

        // 3. Detect failed records (blocks move forward)
        if (m.finished_at === null) {
          console.log(`[Migrate] Failed record detected (blocking): ${name}`);
          shouldDelete = true;
        }

        if (shouldDelete) {
          console.log(`[Migrate] Deleting record: ${name}`);
          await prisma.$executeRawUnsafe(
            `DELETE FROM _prisma_migrations WHERE migration_name = '${name}'`
          );
        }
      }

      // 4. Special Case: Force re-run of rollup if columns are missing
      // This handles the case where the rollup was applied BEFORE the repair logic was added.
      const rollupName = "20260309164800_init_rollup";
      const hasRollup = dbMigrations.find(m => m.migration_name.includes("init_rollup"));
      if (hasRollup) {
        try {
          // Check if a representative new column exists
          await prisma.$queryRawUnsafe('SELECT "authSource" FROM "User" LIMIT 1');
        } catch (e) {
          console.log(`[Migrate] Rollup exists but schema is incomplete (authSource missing). Forcing repair...`);
          await prisma.$executeRawUnsafe(
            `DELETE FROM _prisma_migrations WHERE migration_name LIKE '%init_rollup%'`
          );
        }
      }
    } catch (e) {
      // Table likely doesn't exist yet (fresh DB), skip
      console.log("[Migrate] No migration history found or table missing. Skipping check.");
    }
  }

  async function run() {
    const prisma = new PrismaClient();
    try {
      await waitForDatabase(prisma);
      await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(${LOCK_ID})`);

      try {
        console.log("[Migrate] Initializing Migration Engine...");
        await checkAndFixMigrations(prisma);

        console.log("[Migrate] Triggering Prisma Migrate Deploy (Re-entrant Rollup)...");
        execSync("npm run prisma migrate deploy", { stdio: "inherit" });
        console.log("[Migrate] Database is now up to date.");
      } finally {
        try {
          await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(${LOCK_ID})`);
        } catch (unlockError) {
          console.error("[Migrate] Failed to release migration lock", unlockError);
        }
      }
    } catch (error) {
      console.error("[Migrate] Migration failed", error);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  }

  run();
})();
