import { prisma } from "@/lib/prisma";
import { parseNessusCsv } from "@/lib/csv";
import { setProgress } from "@/lib/progress";
import { Risk, UploadStatus, VulnerabilityStatus } from "@prisma/client";

function normalizeRisk(risk?: string) {
  const value = (risk ?? "").toLowerCase();
  if (value.includes("critical")) return Risk.Critical;
  if (value.includes("high")) return Risk.High;
  if (value.includes("medium")) return Risk.Medium;
  if (value.includes("low")) return Risk.Low;
  return Risk.None;
}

type Params = {
  uploadId: string;
  siteId: string;
  text: string;
};

export async function processNessusUpload({ uploadId, siteId, text }: Params) {
  await setProgress(uploadId, { step: "Extracting data", progress: 10 });

  const config = await prisma.importConfig.findUnique({
    where: { id: "singleton" },
  });
  const gracePeriodDays = config?.pluginGracePeriodDays ?? 0;

  const rows = parseNessusCsv(text);
  const now = new Date();

  const filteredRows = rows.filter((row) => {
    if (normalizeRisk(row.risk) === Risk.None) return false;

    if (gracePeriodDays > 0 && row.pluginPublicationDate) {
      const pubDate = new Date(row.pluginPublicationDate);
      const diffTime = Math.abs(now.getTime() - pubDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= gracePeriodDays) {
        return false;
      }
    }

    return true;
  });
  await setProgress(uploadId, { step: "Comparing diffs", progress: 40, total: filteredRows.length });

  const batchTime = new Date();
  const chunkSize = 500;
  const uniqueKeys = new Map<string, { pluginId: string; host: string; port: string }>();
  for (const row of filteredRows) {
    const key = `${row.pluginId}|${row.host}|${row.port}`;
    if (!uniqueKeys.has(key)) {
      uniqueKeys.set(key, { pluginId: row.pluginId, host: row.host, port: row.port });
    }
  }

  const activeMap = new Map<string, { id: string }>();
  const keyList = Array.from(uniqueKeys.values());

  for (let i = 0; i < keyList.length; i += chunkSize) {
    const chunk = keyList.slice(i, i + chunkSize);
    const orClause = chunk.map((entry) => ({
      pluginId: entry.pluginId,
      host: entry.host,
      port: entry.port,
    }));

    const [active] = await prisma.$transaction([
      prisma.vulnerability.findMany({
        where: {
          siteId,
          status: { in: [VulnerabilityStatus.Open, VulnerabilityStatus.FalsePositive, VulnerabilityStatus.NoFixAvailable] },
          OR: orClause,
        },
        orderBy: { lastSeenAt: "desc" },
      }),
    ]);

    for (const item of active) {
      const key = `${item.pluginId}|${item.host}|${item.port}`;
      if (!activeMap.has(key)) {
        activeMap.set(key, { id: item.id });
      }
    }
  }

  await prisma.vulnerability.updateMany({
    where: { siteId },
    data: { isCurrent: false },
  });

  const touchIds: string[] = [];
  const createData = [];

  let processed = 0;
  for (const row of filteredRows) {
    const key = `${row.pluginId}|${row.host}|${row.port}`;
    const active = activeMap.get(key);
    if (active) {
      touchIds.push(active.id);
    } else {
      const normalizedRisk = normalizeRisk(row.risk);
      createData.push({
        siteId,
        assigneeId: null,
        status: VulnerabilityStatus.Open,
        isCurrent: true,
        lastSeenAt: batchTime,
        pluginId: row.pluginId,
        cve: row.cve,
        cvssScore: row.cvssScore,
        risk: normalizedRisk,
        host: row.host,
        protocol: row.protocol,
        port: row.port,
        name: row.name,
        synopsis: row.synopsis,
        description: row.description,
        solution: row.solution,
        seeAlso: row.seeAlso,
        pluginOutput: row.pluginOutput,
        pluginPublicationDate: row.pluginPublicationDate ? new Date(row.pluginPublicationDate) : null,
        pluginModificationDate: row.pluginModificationDate ? new Date(row.pluginModificationDate) : null,
      });
    }

    processed += 1;
    if (processed % 500 === 0 && filteredRows.length > 0) {
      await setProgress(uploadId, {
        step: "Comparing diffs",
        progress: 40 + Math.floor((processed / filteredRows.length) * 40),
        total: filteredRows.length,
      });
    }
  }

  for (let i = 0; i < touchIds.length; i += chunkSize) {
    const chunk = touchIds.slice(i, i + chunkSize);
    await prisma.vulnerability.updateMany({
      where: { id: { in: chunk } },
      data: { lastSeenAt: batchTime, isCurrent: true },
    });
  }

  if (createData.length > 0) {
    for (let i = 0; i < createData.length; i += chunkSize) {
      const chunk = createData.slice(i, i + chunkSize);
      await prisma.vulnerability.createMany({ data: chunk });
    }
  }

  await prisma.vulnerability.updateMany({
    where: {
      siteId,
      status: { not: VulnerabilityStatus.Remediated },
      lastSeenAt: { lt: batchTime },
    },
    data: { status: VulnerabilityStatus.Remediated, isCurrent: false },
  });

  await prisma.uploadHistory.update({
    where: { id: uploadId },
    data: { status: UploadStatus.Completed, rowCount: filteredRows.length },
  });

  await setProgress(uploadId, { step: "Completed", progress: 100, total: filteredRows.length });
}
