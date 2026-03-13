import { prisma } from "@/lib/prisma";
import { parseNessusCsv, type NessusRow } from "@/lib/csv";
import { setProgress } from "@/lib/progress";
import { Risk, UploadStatus, VulnerabilityStatus, Prisma } from "@prisma/client";
import { redis } from "@/lib/redis";
import { getLockKey } from "@/lib/queue";
import { isValid, parse } from "date-fns";
import { getStorageProvider } from "./storage";

function parseValidDate(value?: string | null) {
  if (!value) return null;
  const s = value.toString().trim();

  // Try common numeric date formats like dd/MM/yyyy or d/M/yyyy (prefer UK-style)
  const formats = ["dd/MM/yyyy", "d/M/yyyy", "MM/dd/yyyy", "M/d/yyyy", "yyyy-MM-dd", "yyyy/MM/dd", "MMM d, yyyy", "MMMM d, yyyy"];
  for (const fmt of formats) {
    const parsed = parse(s, fmt, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }

  // Fallback to native for ISO/other formats, but check validity strictly
  const d = new Date(s);
  if (!isNaN(d.getTime()) && s.includes(d.getFullYear().toString())) return d;

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
  storageKey: string;
};

export async function processNessusUpload({ uploadId, siteId, storageKey }: Params) {
  const lockKey = getLockKey(siteId);
  const lockValue = uploadId;

  // Try to acquire the lock. 
  // NX = Only set if not exists. 
  // If it fails, check if we already own it (re-entrant for retries).
  const locked = await redis.set(lockKey, lockValue, "EX", 1800, "NX");

  if (!locked) {
    const currentLock = await redis.get(lockKey);
    if (currentLock !== lockValue) {
      throw new Error("Lock already held for this site");
    }
    // Refresh TTL if we already own it
    await redis.expire(lockKey, 1800);
  }

  try {
    const storage = await getStorageProvider();
    const text = await storage.read(storageKey);

    await setProgress(uploadId, { step: "Extracting data", progress: 10 });

    const config = await prisma.importConfig.findUnique({
      where: { id: "singleton" },
    });
    const gracePeriodDays = config?.pluginGracePeriodDays ?? 0;

    const rows = parseNessusCsv(text);
    const now = new Date();

    const filteredRows = rows.filter((row: NessusRow) => {
      if (normalizeRisk(row.risk) === Risk.None) return false;

      if (gracePeriodDays > 0) {
        const pubDateStr = row.pluginPublicationDate;
        const pubDate = pubDateStr ? parseValidDate(pubDateStr) : null;

        // Only exclude if publication date exists and is within the grace period
        if (pubDate) {
          const diffTime = Math.abs(now.getTime() - pubDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays <= gracePeriodDays) return false;
        }
      }

      return true;
    });
    await setProgress(uploadId, { step: "Comparing diffs", progress: 40, total: filteredRows.length });

    const batchTime = new Date();
    const chunkSize = 500;
    const uniqueKeys = new Map<string, { pluginId: string; host: string; port: string; cve: string | null }>();
    for (const row of filteredRows) {
      const key = `${row.pluginId}|${row.host}|${row.port}|${row.cve ?? ""}`;
      if (!uniqueKeys.has(key)) {
        uniqueKeys.set(key, { pluginId: row.pluginId, host: row.host, port: row.port, cve: row.cve ?? null });
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
        cve: entry.cve,
      }));

      const active = await prisma.vulnerability.findMany({
        where: {
          siteId,
          status: { in: [VulnerabilityStatus.Open, VulnerabilityStatus.FalsePositive, VulnerabilityStatus.NoFixAvailable] },
          OR: orClause,
        },
        orderBy: { lastSeenAt: "desc" },
      });

      for (const item of active) {
        const key = `${item.pluginId}|${item.host}|${item.port}|${item.cve ?? ""}`;
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
      const key = `${row.pluginId}|${row.host}|${row.port}|${row.cve ?? ""}`;
      const active = activeMap.get(key);
      if (active) {
        touchIds.push(active.id);
      } else {
        const normalizedRiskValue = normalizeRisk(row.risk);
        createData.push({
          siteId,
          assigneeId: null,
          status: VulnerabilityStatus.Open,
          isCurrent: true,
          lastSeenAt: batchTime,
          pluginId: row.pluginId,
          cve: row.cve,
          cvssScore: row.cvssScore,
          risk: normalizedRiskValue,
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
        const safeChunk = chunk.map((item) => {
          let pub = item.pluginPublicationDate;
          let mod = item.pluginModificationDate;
          if (pub instanceof Date && isNaN(pub.getTime())) pub = null;
          if (mod instanceof Date && isNaN(mod.getTime())) mod = null;
          return {
            ...item,
            pluginPublicationDate: pub,
            pluginModificationDate: mod,
          };
        });
        try {
          await prisma.vulnerability.createMany({ data: safeChunk as Prisma.VulnerabilityCreateManyInput[] });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError) {
            if (err.code === "P2002") throw err;
          }
          console.error("createMany failed, retrying with nulled dates", err instanceof Error ? err.message : String(err));
          const nulled = (safeChunk as Prisma.VulnerabilityCreateManyInput[]).map((it) => ({
            ...it,
            pluginPublicationDate: null,
            pluginModificationDate: null,
          }));
          await prisma.vulnerability.createMany({ data: nulled });
        }
      }
    }

    const remediated = await prisma.vulnerability.findMany({
      where: {
        siteId,
        lastSeenAt: { lt: batchTime },
      },
    });

    if (remediated.length > 0) {
      const historyData = remediated.map((v) => ({
        id: v.id as string,
        siteId: v.siteId as string,
        assigneeId: v.assigneeId as string | null,
        status: VulnerabilityStatus.Remediated,
        lastSeenAt: v.lastSeenAt as Date,
        createdAt: v.createdAt as Date,
        pluginId: v.pluginId as string,
        cve: v.cve as string | null,
        cvssScore: v.cvssScore as number | null,
        risk: v.risk as Risk,
        host: v.host as string,
        protocol: v.protocol as string,
        port: v.port as string,
        name: v.name as string,
        synopsis: v.synopsis as string | null,
        description: v.description as string | null,
        solution: v.solution as string | null,
        seeAlso: v.seeAlso as string | null,
        pluginOutput: v.pluginOutput as string | null,
        pluginPublicationDate: v.pluginPublicationDate as Date | null,
        pluginModificationDate: v.pluginModificationDate as Date | null,
      }));

      await prisma.$transaction([
        prisma.vulnerabilityHistory.createMany({ data: historyData }),
        prisma.vulnerability.deleteMany({
          where: { id: { in: remediated.map((v) => v.id) } },
        }),
      ]);
      console.log(`✓ Archived ${remediated.length} vulnerabilities to history`);
    }

    await prisma.uploadHistory.update({
      where: { id: uploadId },
      data: { status: UploadStatus.Completed, rowCount: filteredRows.length },
    });

    await setProgress(uploadId, { step: "Completed", progress: 100, total: filteredRows.length });

    // Cleanup storage after successful processing
    await storage.delete(storageKey);
  } finally {
    // Atomic lock release: only delete if the value matches our uploadId
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await (redis as { eval: (script: string, numKeys: number, ...args: (string | number)[]) => Promise<unknown> }).eval(script, 1, lockKey, lockValue);
  }
}
