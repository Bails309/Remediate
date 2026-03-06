import { prisma } from "@/lib/prisma";
import { parseNessusCsv } from "@/lib/csv";
import { setProgress } from "@/lib/progress";
import { Risk, UploadStatus, VulnerabilityStatus } from "@prisma/client";

function parseValidDate(value?: string | null) {
  if (!value) return null;
  const s = value.toString().trim();

  // Try native parsing first (covers ISO and many textual formats)
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  // Try common numeric date formats like dd/MM/yyyy or d/M/yyyy (prefer UK-style)
  const numeric = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let year = Number(numeric[3]);
    const hour = Number(numeric[4] ?? 0);
    const minute = Number(numeric[5] ?? 0);
    const second = Number(numeric[6] ?? 0);

    if (year < 100) {
      year += year >= 70 ? 1900 : 2000; // two-digit year heuristic
    }

    // Interpret as dd/MM/yyyy (UK) first
    const candidateUK = new Date(year, month - 1, day, hour, minute, second);
    if (!isNaN(candidateUK.getTime())) return candidateUK;

    // Fallback to MM/DD/YYYY
    const candidateUS = new Date(year, day - 1, month, hour, minute, second);
    if (!isNaN(candidateUS.getTime())) return candidateUS;
  }

  // Try patterns like '14 Jun 2024' etc.
  const textual = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (textual) {
    const day = Number(textual[1]);
    const monthName = textual[2];
    let year = Number(textual[3]);
    const hour = Number(textual[4] ?? 0);
    const minute = Number(textual[5] ?? 0);
    const second = Number(textual[6] ?? 0);
    const monthIdx = new Date(`${monthName} 1, 2000`).getMonth();
    if (!isNaN(monthIdx)) {
      if (year < 100) year += year >= 70 ? 1900 : 2000;
      const candidate = new Date(year, monthIdx, day, hour, minute, second);
      if (!isNaN(candidate.getTime())) return candidate;
    }
  }

  return null;
}
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
      const pubDate = parseValidDate(row.pluginPublicationDate);
      if (pubDate) {
        const diffTime = Math.abs(now.getTime() - pubDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= gracePeriodDays) {
          return false;
        }
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
        pluginPublicationDate: parseValidDate(row.pluginPublicationDate),
        pluginModificationDate: parseValidDate(row.pluginModificationDate),
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
      // sanitize date fields to avoid passing invalid Date objects to Prisma
      const safeChunk = chunk.map((item: Record<string, unknown>) => {
        let pub = item.pluginPublicationDate;
        let mod = item.pluginModificationDate;
        if (typeof pub === "string") pub = parseValidDate(pub);
        if (typeof mod === "string") mod = parseValidDate(mod);
        if (pub instanceof Date && isNaN(pub.getTime())) pub = null;
        if (mod instanceof Date && isNaN(mod.getTime())) mod = null;
        return {
          ...item,
          pluginPublicationDate: pub,
          pluginModificationDate: mod,
        };
      });
      try {
        await prisma.vulnerability.createMany({ data: safeChunk as any });
      } catch (err: unknown) {
        const error = err as Error;
        console.error("createMany failed, retrying with nulled dates", error.message);
        const nulled = safeChunk.map((it: Record<string, unknown>) => ({ ...it, pluginPublicationDate: null, pluginModificationDate: null }));
        await prisma.vulnerability.createMany({ data: nulled as any });
      }
    }
  }

  // Archive and delete remediated items
  const remediated = await prisma.vulnerability.findMany({
    where: {
      siteId,
      status: { not: VulnerabilityStatus.Remediated },
      lastSeenAt: { lt: batchTime },
    },
  });

  if (remediated.length > 0) {
    const historyData = remediated.map(v => ({
      id: v.id,
      siteId: v.siteId,
      assigneeId: v.assigneeId,
      status: VulnerabilityStatus.Remediated,
      lastSeenAt: v.lastSeenAt,
      createdAt: v.createdAt,
      pluginId: v.pluginId,
      cve: v.cve,
      cvssScore: v.cvssScore,
      risk: v.risk,
      host: v.host,
      protocol: v.protocol,
      port: v.port,
      name: v.name,
      synopsis: v.synopsis,
      description: v.description,
      solution: v.solution,
      seeAlso: v.seeAlso,
      pluginOutput: v.pluginOutput,
      pluginPublicationDate: v.pluginPublicationDate,
      pluginModificationDate: v.pluginModificationDate,
    }));

    await prisma.$transaction([
      prisma.vulnerabilityHistory.createMany({ data: historyData }),
      prisma.vulnerability.deleteMany({
        where: { id: { in: remediated.map(v => v.id) } },
      }),
    ]);
    console.log(`✓ Archived ${remediated.length} vulnerabilities to history`);
  }

  await prisma.uploadHistory.update({
    where: { id: uploadId },
    data: { status: UploadStatus.Completed, rowCount: filteredRows.length },
  });

  await setProgress(uploadId, { step: "Completed", progress: 100, total: filteredRows.length });
}
