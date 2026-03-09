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
      const failedMigrations = await prisma.$queryRawUnsafe(
        'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL'
      );

      if (failedMigrations && failedMigrations.length > 0) {
        console.log(`[Migrate] Found ${failedMigrations.length} failed migrations.`);
        for (const m of failedMigrations) {
          const name = m.migration_name;
          if (name === "20260307000000_drift_fix") {
            console.log(`[Migrate] Auto-resolving known drift migration: ${name}`);
            try {
              execSync(`npx prisma migrate resolve --applied ${name}`, { stdio: "inherit" });
            } catch (resolveError) {
              console.error(`[Migrate] Failed to auto-resolve ${name}`, resolveError);
            }
          } else {
            console.warn(`[Migrate] ALERT: Migration ${name} is failed. Manual "npx prisma migrate resolve --applied ${name}" may be needed.`);
          }
        }
      }
    } catch (e) {
      // Table likely doesn't exist yet (fresh DB), skip
    }
  }

  async function run() {
    const prisma = new PrismaClient();
    try {
      await waitForDatabase(prisma);
      await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(${LOCK_ID})`);

      // Auto-fix known issues before deploying
      await checkAndFixMigrations(prisma);

      console.log("[Migrate] Running prisma migrate deploy...");
      execSync("npm run prisma migrate deploy", { stdio: "inherit" });
    } catch (error) {
      console.error("Migration failed", error);
      process.exitCode = 1;
    } finally {
      try {
        await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(${LOCK_ID})`);
      } catch (unlockError) {
        console.error("Failed to release migration lock", unlockError);
      }
      await prisma.$disconnect();
    }
  }

  run();
})();
