async function test() {
  const mod = await import('@prisma/client');
  const { PrismaClient } = mod;
  const prisma = new PrismaClient();
  try {
    const result = await prisma.$queryRawUnsafe('SELECT COUNT(*)::int as "groupCount" FROM "Vulnerability"');
    console.log(typeof result[0].groupCount);
    console.log(result[0].groupCount);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
