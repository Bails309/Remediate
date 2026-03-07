import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const users = await prisma.user.findMany()
    console.log('Current Users in DB:')
    users.forEach(u => {
        const roles = Array.isArray(u.roles) ? u.roles.join(',') : String(u.roles);
        console.log(`- ${u.name} (${u.email}): roles=${roles}, authSource=${u.authSource}`)
    })
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
