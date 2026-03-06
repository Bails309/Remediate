const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const users = await prisma.user.findMany()
    console.log('Current Users in DB:')
    users.forEach(u => {
        console.log(`- ${u.name} (${u.email}): role=${u.role}, authSource=${u.authSource}`)
    })
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
