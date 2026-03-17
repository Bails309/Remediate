const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log('Users in DB:');
  users.forEach(u => {
    console.log(`- ${u.email} (isNewUser: ${u.isNewUser}, roles: ${u.roles})`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
