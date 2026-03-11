const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function test() {
  const result = await prisma.$queryRawUnsafe(SELECT COUNT(*)::int as "groupCount" FROM "Vulnerability");
  console.log(typeof result[0].groupCount);
  console.log(result[0].groupCount);
  process.exit(0);
}
test().catch(console.error);
