
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.site.count();
  console.log('SITE_COUNT:', count);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
