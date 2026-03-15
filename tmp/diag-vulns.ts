
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const vulns = await prisma.vulnerability.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      risk: true
    }
  });
  console.log('Total vulnerabilities in active table:', vulns.length);
  const statusCounts = vulns.reduce((acc, v) => {
    acc[v.status] = (acc[v.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('Status breakdown:', statusCounts);
  
  const riskCounts = vulns.reduce((acc, v) => {
    acc[v.risk] = (acc[v.risk] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('Risk breakdown:', riskCounts);
}

main().finally(() => prisma.$disconnect());
