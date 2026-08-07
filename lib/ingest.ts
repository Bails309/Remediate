import { prisma } from "@/lib/prisma";
import { parseNessusCsv, parseAcrCsv, type NessusRow, type AcrRow } from "@/lib/csv";
import { setProgress } from "@/lib/progress";
import { Risk, ScannerType, UploadStatus, VulnerabilityStatus, Prisma } from "@prisma/client";
import { redis } from "@/lib/redis";
import { getLockKey } from "@/lib/queue";
import { isValid, parse } from "date-fns";
import { getStorageProvider } from "./storage";

// Per-site ingest lock timing. These operations run against the shared `redis`
// client, which uses `maxRetriesPerRequest: null` (required for BullMQ) and
// therefore lets commands queue *indefinitely* while the socket is down. On a
// managed/cluster Redis a dropped connection would otherwise hang the whole
// ingest job — either mid-run or, worse, in the `finally` lock release *after*
// the DB write, leaving the worker wedged so every subsequent upload piles up
// in "Processing". Cap each lock op so a degraded Redis fails fast instead.
const LOCK_TTL_SECONDS = 1800;
const LOCK_ACQUIRE_TIMEOUT_MS = 10_000;
const LOCK_RELEASE_TIMEOUT_MS = 5_000;

function withRedisTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Redis ${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Acquire the per-site ingest lock (re-entrant for the same uploadId so BullMQ
 * retries of the same job succeed). Fails fast if Redis is unreachable rather
 * than hanging the worker; the caller surfaces that as a failed upload.
 */
async function acquireSiteLock(lockKey: string, lockValue: string) {
  const locked = await withRedisTimeout(
    redis.set(lockKey, lockValue, "EX", LOCK_TTL_SECONDS, "NX"),
    LOCK_ACQUIRE_TIMEOUT_MS,
    "lock acquire",
  );
  if (!locked) {
    const currentLock = await withRedisTimeout(redis.get(lockKey), LOCK_ACQUIRE_TIMEOUT_MS, "lock read");
    if (currentLock !== lockValue) {
      throw new Error("Lock already held for this site");
    }
    // Refresh TTL if we already own it (re-entrant retry).
    await withRedisTimeout(redis.expire(lockKey, LOCK_TTL_SECONDS), LOCK_ACQUIRE_TIMEOUT_MS, "lock refresh");
  }
}

/**
 * Release the per-site ingest lock atomically (only if we still own it). Never
 * throws and never blocks: a release failure is logged and left to the lock's
 * TTL, so a stalled Redis can't wedge the worker after the job has completed.
 */
async function releaseSiteLock(lockKey: string, lockValue: string, siteId: string) {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  try {
    await withRedisTimeout(
      (redis as { eval: (script: string, numKeys: number, ...args: (string | number)[]) => Promise<unknown> }).eval(
        script,
        1,
        lockKey,
        lockValue,
      ),
      LOCK_RELEASE_TIMEOUT_MS,
      "lock release",
    );
  } catch (err) {
    console.warn(`[Ingest] Lock release failed for site ${siteId} (lock will expire via its TTL):`, err);
  }
}

function parseValidDate(value?: string | null) {
  if (!value) return null;
  const s = value.toString().trim();

  // Try common numeric date formats like dd/MM/yyyy or d/M/yyyy (prefer UK-style)
  const formats = [
    "dd/MM/yyyy", "d/M/yyyy", "MM/dd/yyyy", "M/d/yyyy", 
    "yyyy-MM-dd", "yyyy/MM/dd", 
    "MMM d, yyyy", "MMMM d, yyyy", "MMM dd, yyyy",
    "d MMM yyyy", "dd MMM yyyy",
    "yyyy/MM/dd HH:mm:ss", "MM/dd/yyyy HH:mm:ss"
  ];
  for (const fmt of formats) {
    const parsed = parse(s, fmt, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }

  // Fallback to native for ISO/other formats, but check validity strictly
  const d = new Date(s);
  if (!isNaN(d.getTime()) && s.includes(d.getFullYear().toString())) {
    console.warn(`[Ingest] Date parsing fell back to native constructor for: "${s}" -> ${d.toISOString()}`);
    return d;
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

// Statuses that keep a finding in the live `vulnerability` table.
const RECONCILABLE_STATUSES = [
  VulnerabilityStatus.Open,
  VulnerabilityStatus.FalsePositive,
  VulnerabilityStatus.NoFixAvailable,
  VulnerabilityStatus.InProgress,
  VulnerabilityStatus.InProgressWithCR,
  VulnerabilityStatus.Sunset,
  VulnerabilityStatus.AwaitingVendor,
];

// Archived statuses that represent a *user determination* and must never be
// resurrected as a new Open finding when the same row reappears in a scan.
const ARCHIVED_DETERMINATION_STATUSES = [
  VulnerabilityStatus.FalsePositive,
  VulnerabilityStatus.NoFixAvailable,
];

// Reconciliation candidates are loaded with two indexed scans keyed on
// (siteId, scannerType, status). The previous implementation issued chunked
// queries containing a 500-way OR over (pluginId, host, port[, cve]); Postgres
// cannot serve that from an index on VulnerabilityHistory, so every chunk
// became a full sequential scan of the 12-month archive and the worker wedged
// mid-ingest with the upload stuck in "Processing".
function indexReconciliationRows<T extends { id: string; pluginId: string; host: string; port: string; cve?: string | null }>(
  rows: T[],
  includeCve: boolean,
) {
  const map = new Map<string, { id: string }>();
  for (const item of rows) {
    const key = includeCve
      ? `${item.pluginId}|${item.host}|${item.port}|${item.cve ?? ""}`
      : `${item.pluginId}|${item.host}|${item.port}`;
    if (!map.has(key)) map.set(key, { id: item.id });
  }
  return map;
}

type Params = {
  uploadId: string;
  siteId: string;
  storageKey: string;
};

export async function processNessusUpload({ uploadId, siteId, storageKey }: Params) {
  const lockKey = getLockKey(siteId);
  const lockValue = uploadId;

  await acquireSiteLock(lockKey, lockValue);

  try {
    const storage = await getStorageProvider();
    const text = await storage.read(storageKey);

    await setProgress(uploadId, { step: "Extracting data", progress: 10 });

    const config = await prisma.importConfig.findUnique({
      where: { id: "singleton" },
    });
    const gracePeriodDays = config?.pluginGracePeriodDays ?? 0;
    console.log(`[Ingest] Grace period configured: ${gracePeriodDays} days`);

    const rows = parseNessusCsv(text);
    const now = new Date();

    const filteredRows = rows.filter((row: NessusRow) => {
      if (normalizeRisk(row.risk) === Risk.None) return false;

      if (gracePeriodDays > 0) {
        const pubDateStr = row.pluginPublicationDate;
        const pubDate = pubDateStr ? parseValidDate(pubDateStr) : null;

        if (pubDate) {
          const diffTime = Math.abs(now.getTime() - pubDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          const isWithinGrace = diffDays <= gracePeriodDays;
          
          if (isWithinGrace) {
            console.log(`[Ingest] Filtering out ${row.pluginId} (Published: ${pubDateStr}, Age: ${diffDays} days)`);
            return false;
          }
        } else if (pubDateStr) {
          console.warn(`[Ingest] Failed to parse publication date: "${pubDateStr}" for plugin ${row.pluginId}`);
        }
      }

      return true;
    });
    await setProgress(uploadId, { step: "Comparing diffs", progress: 40, total: filteredRows.length });

    const batchTime = new Date();
    const chunkSize = 500;

    const reconciliationSelect = {
      id: true,
      pluginId: true,
      host: true,
      port: true,
      cve: true,
    } as const;

    const activeRows = await prisma.vulnerability.findMany({
      where: {
        siteId,
        scannerType: ScannerType.NESSUS,
        status: { in: RECONCILABLE_STATUSES },
      },
      select: reconciliationSelect,
      orderBy: { lastSeenAt: "desc" },
    });
    const activeMap = indexReconciliationRows(activeRows, true);

    const historyRows = await prisma.vulnerabilityHistory.findMany({
      where: {
        siteId,
        scannerType: ScannerType.NESSUS,
        status: { in: ARCHIVED_DETERMINATION_STATUSES },
      },
      select: reconciliationSelect,
      orderBy: { lastSeenAt: "desc" },
    });
    const historyMap = indexReconciliationRows(historyRows, true);

    console.log(
      `[Ingest] Reconciliation candidates for site ${siteId}: ${activeRows.length} active, ${historyRows.length} archived`,
    );

    await prisma.vulnerability.updateMany({
      where: { siteId, scannerType: ScannerType.NESSUS },
      data: { isCurrent: false },
    });

    const touchIds: string[] = [];
    const touchHistoryIds: string[] = [];
    const createData = [];

    let processed = 0;
    for (const row of filteredRows) {
      const key = `${row.pluginId}|${row.host}|${row.port}|${row.cve ?? ""}`;
      const active = activeMap.get(key);
      const history = historyMap.get(key);

      if (active) {
        touchIds.push(active.id);
      } else if (history) {
        touchHistoryIds.push(history.id);
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

    for (let i = 0; i < touchHistoryIds.length; i += chunkSize) {
      const chunk = touchHistoryIds.slice(i, i + chunkSize);
      await prisma.vulnerabilityHistory.updateMany({
        where: { id: { in: chunk } },
        data: { lastSeenAt: batchTime },
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
        scannerType: ScannerType.NESSUS,
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
    await releaseSiteLock(lockKey, lockValue, siteId);
  }
}

// ---------------------------------------------------------------------------
// ACR (Azure Container Registry) vulnerability CSV ingest
// ---------------------------------------------------------------------------
//
// ACR export rows are keyed by (siteId, cveId, registryName, repository,
// packageName). We populate the required Nessus columns semantically so ACR
// findings coexist with Nessus findings in the same table and render in the
// existing dashboards/lists without special-casing:
//   pluginId = cveId
//   host     = "{registryName}/{repository}"
//   port     = packageName
//   protocol = "container"
//   name     = "{cveId} \u2014 {packageName} {installedVersion}"
// Full-fidelity ACR fields are also stored in the new ACR-specific columns.
//
// Reconciliation is scoped to `scannerType = ACR` so a Nessus upload never
// touches ACR rows and vice versa.

function acrHost(row: AcrRow) {
  return `${row.registryName}/${row.repository}`;
}

function acrName(row: AcrRow) {
  const version = row.installedVersion ? ` ${row.installedVersion}` : "";
  return `${row.cveId} \u2014 ${row.packageName}${version}`;
}

function parseIsoDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function processAcrUpload({ uploadId, siteId, storageKey }: Params) {
  const lockKey = getLockKey(siteId);
  const lockValue = uploadId;

  await acquireSiteLock(lockKey, lockValue);

  try {
    const storage = await getStorageProvider();
    const text = await storage.read(storageKey);

    await setProgress(uploadId, { step: "Extracting data", progress: 10 });

    const rows = parseAcrCsv(text);
    console.log(`[Ingest:ACR] Parsed ${rows.length} rows for site ${siteId}`);

    // Drop rows with a "None" severity to match Nessus behaviour.
    const filteredRows = rows.filter((row) => normalizeRisk(row.severity) !== Risk.None);

    await setProgress(uploadId, {
      step: "Comparing diffs",
      progress: 40,
      total: filteredRows.length,
    });

    const batchTime = new Date();
    const chunkSize = 500;

    // Dedup key: (pluginId=cveId, host=registry/repo, port=packageName).
    // imageDigest is stored but intentionally not part of the dedup key \u2014 a
    // new digest for the same repo/package/CVE is still the same finding until
    // it's patched out (at which point the row disappears from the next scan
    // and gets archived by the diff step below).
    const reconciliationSelect = {
      id: true,
      pluginId: true,
      host: true,
      port: true,
    } as const;

    const activeRows = await prisma.vulnerability.findMany({
      where: {
        siteId,
        scannerType: ScannerType.ACR,
        status: { in: RECONCILABLE_STATUSES },
      },
      select: reconciliationSelect,
      orderBy: { lastSeenAt: "desc" },
    });
    const activeMap = indexReconciliationRows(activeRows, false);

    // Also check the archive: FalsePositive / NoFixAvailable rows have been
    // moved out of `vulnerability` into `vulnerabilityHistory`. If the same
    // finding reappears in a subsequent scan we must NOT create a new Open
    // issue — the user has already made a determination on it. Just refresh
    // its lastSeenAt so it stays discoverable in the archive view. This
    // mirrors the Nessus ingest reconciliation.
    const historyRows = await prisma.vulnerabilityHistory.findMany({
      where: {
        siteId,
        scannerType: ScannerType.ACR,
        status: { in: ARCHIVED_DETERMINATION_STATUSES },
      },
      select: reconciliationSelect,
      orderBy: { lastSeenAt: "desc" },
    });
    const historyMap = indexReconciliationRows(historyRows, false);

    console.log(
      `[Ingest:ACR] Reconciliation candidates for site ${siteId}: ${activeRows.length} active, ${historyRows.length} archived`,
    );

    // Mark all current ACR rows for this site as stale; the reconciliation
    // loop below will flip the ones that reappear back to isCurrent = true.
    await prisma.vulnerability.updateMany({
      where: { siteId, scannerType: ScannerType.ACR },
      data: { isCurrent: false },
    });

    const touchIds: string[] = [];
    const touchHistoryIds: string[] = [];
    const createData: Prisma.VulnerabilityCreateManyInput[] = [];

    let processed = 0;
    for (const row of filteredRows) {
      const pluginId = row.cveId;
      const host = acrHost(row);
      const port = row.packageName;
      const key = `${pluginId}|${host}|${port}`;
      const active = activeMap.get(key);
      const history = historyMap.get(key);

      if (active) {
        touchIds.push(active.id);
      } else if (history) {
        // Finding was previously archived as FalsePositive / NoFixAvailable.
        // Keep it archived — just refresh lastSeenAt so it's discoverable.
        touchHistoryIds.push(history.id);
      } else {
        createData.push({
          siteId,
          assigneeId: null,
          status: VulnerabilityStatus.Open,
          isCurrent: true,
          lastSeenAt: batchTime,
          scannerType: ScannerType.ACR,
          pluginId,
          cve: row.cveId,
          cvssScore: null,
          risk: normalizeRisk(row.severity),
          host,
          protocol: "container",
          port,
          name: acrName(row),
          synopsis: null,
          description: row.description ?? null,
          solution: row.remediation ?? null,
          seeAlso: null,
          pluginOutput: null,
          pluginPublicationDate: null,
          pluginModificationDate: null,
          registryName: row.registryName,
          repository: row.repository,
          imageDigest: row.imageDigest,
          imageTag: row.imageTag ?? null,
          packageName: row.packageName,
          installedVersion: row.installedVersion ?? null,
          remediation: row.remediation ?? null,
          timeGenerated: parseIsoDate(row.timeGenerated),
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

    // Also refresh the ACR-specific fields (installedVersion, imageDigest,
    // timeGenerated) since a re-scan may report a newer image digest for the
    // same finding. Build the id -> row reverse index once for the whole scan.
    const rowForId = new Map<string, AcrRow>();
    for (const row of filteredRows) {
      const key = `${row.cveId}|${acrHost(row)}|${row.packageName}`;
      const hit = activeMap.get(key);
      if (hit) {
        rowForId.set(hit.id, row);
      }
    }

    for (let i = 0; i < touchIds.length; i += chunkSize) {
      const chunk = touchIds.slice(i, i + chunkSize);

      await prisma.$transaction(
        chunk.map((id) => {
          const row = rowForId.get(id);
          return prisma.vulnerability.update({
            where: { id },
            data: {
              lastSeenAt: batchTime,
              isCurrent: true,
              ...(row
                ? {
                    imageDigest: row.imageDigest,
                    imageTag: row.imageTag ?? null,
                    installedVersion: row.installedVersion ?? null,
                    remediation: row.remediation ?? null,
                    timeGenerated: parseIsoDate(row.timeGenerated),
                  }
                : {}),
            },
          });
        }),
      );
    }

    // Refresh lastSeenAt on archived (FalsePositive / NoFixAvailable) rows
    // whose findings reappeared in this scan. Do NOT resurrect them into the
    // active table — the user's determination is preserved.
    for (let i = 0; i < touchHistoryIds.length; i += chunkSize) {
      const chunk = touchHistoryIds.slice(i, i + chunkSize);
      await prisma.vulnerabilityHistory.updateMany({
        where: { id: { in: chunk } },
        data: { lastSeenAt: batchTime },
      });
    }

    if (createData.length > 0) {
      for (let i = 0; i < createData.length; i += chunkSize) {
        const chunk = createData.slice(i, i + chunkSize);
        await prisma.vulnerability.createMany({ data: chunk });
      }
    }

    // Archive rows that were present before but absent from this scan.
    const remediated = await prisma.vulnerability.findMany({
      where: {
        siteId,
        scannerType: ScannerType.ACR,
        lastSeenAt: { lt: batchTime },
      },
    });

    if (remediated.length > 0) {
      const historyData = remediated.map((v) => ({
        id: v.id,
        siteId: v.siteId,
        assigneeId: v.assigneeId,
        status: VulnerabilityStatus.Remediated,
        lastSeenAt: v.lastSeenAt,
        createdAt: v.createdAt,
        scannerType: ScannerType.ACR,
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
        registryName: v.registryName,
        repository: v.repository,
        imageDigest: v.imageDigest,
        imageTag: v.imageTag,
        packageName: v.packageName,
        installedVersion: v.installedVersion,
        remediation: v.remediation,
        timeGenerated: v.timeGenerated,
      }));

      await prisma.$transaction([
        prisma.vulnerabilityHistory.createMany({ data: historyData }),
        prisma.vulnerability.deleteMany({
          where: { id: { in: remediated.map((v) => v.id) } },
        }),
      ]);
      console.log(`[Ingest:ACR] Archived ${remediated.length} vulnerabilities to history`);
    }

    await prisma.uploadHistory.update({
      where: { id: uploadId },
      data: { status: UploadStatus.Completed, rowCount: filteredRows.length },
    });

    await setProgress(uploadId, {
      step: "Completed",
      progress: 100,
      total: filteredRows.length,
    });

    await storage.delete(storageKey);
  } finally {
    await releaseSiteLock(lockKey, lockValue, siteId);
  }
}
