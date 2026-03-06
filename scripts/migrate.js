;(async () => {
  const { execSync } = require("child_process");

  let PrismaClient;
  try {
    ({ PrismaClient } = require("@prisma/client"));
  } catch (err) {
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

  async function run() {
    const prisma = new PrismaClient();
    try {
      await waitForDatabase(prisma);
      await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(${LOCK_ID})`);
      execSync("npx prisma migrate deploy", { stdio: "inherit" });
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
