import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("--- Users ---");
  const users = await prisma.user.findMany();
  console.log(JSON.stringify(users.map(u => ({ id: u.id, email: u.email })), null, 2));

  console.log("\n--- ReportConfig ---");
  const config = await prisma.reportConfig.findFirst();
  console.log(JSON.stringify(config, null, 2));

  console.log("\n--- ThreatSubscriptions ---");
  const subs = await prisma.threatSubscription.findMany({
    include: { user: true }
  });
  console.log(JSON.stringify(subs, null, 2));

  console.log("\n--- Vulnerabilities (Count) ---");
  const vCount = await prisma.vulnerability.count();
  console.log(`Total Vulnerabilities: ${vCount}`);

  console.log("\n--- ThreatVulnerability (Count) ---");
  const tvCount = await prisma.threatVulnerability.count();
  console.log(`Total Threat Vulnerabilities: ${tvCount}`);

  console.log("\n--- Recent Threats (Last 48h) ---");
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const threats = await prisma.threatVulnerability.findMany({
    where: { publishedAt: { gte: since } },
    take: 5
  });
  console.log(JSON.stringify(threats.map(t => ({ id: t.id, cveId: t.cveId, publishedAt: t.publishedAt })), null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
