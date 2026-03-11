import { PrismaClient, Risk, VulnerabilityStatus } from "@prisma/client";

const prisma = new PrismaClient();

const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com";

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Admin User",
      roles: ["site_admin", "web_app_admin", "toolkit_admin", "web_app_user", "toolkit_user"],
    },
  });

  const site = await prisma.site.upsert({
    where: { name: "Datacenter A" },
    update: {},
    create: { name: "Datacenter A" },
  });

  const existing = await prisma.vulnerability.count({
    where: { siteId: site.id },
  });

  if (existing === 0) {
    await prisma.vulnerability.create({
      data: {
        siteId: site.id,
        assigneeId: admin.id,
        status: VulnerabilityStatus.Open,
        isCurrent: true,
        lastSeenAt: new Date(),
        pluginId: "10001",
        cve: "CVE-2025-0001",
        cvssScore: 9.8,
        risk: Risk.Critical,
        host: "10.10.10.12",
        protocol: "tcp",
        port: "443",
        name: "Sample Critical Vulnerability",
        synopsis: "Sample synopsis for a critical issue.",
        description: "Seeded vulnerability used for UI testing.",
        solution: "Apply vendor patch.",
        seeAlso: "https://example.com/advisory",
        pluginOutput: "Sample output",
        pluginPublicationDate: new Date(),
        pluginModificationDate: new Date(),
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
