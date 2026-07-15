/**
 * Diagnose the state of the upload/pentest/threat BullMQ queues.
 *
 * Run inside any container that has REDIS_URL set:
 *
 *   npx tsx /app/scripts/diagnose-queue.ts
 *
 * It prints:
 *   - Redis connection info (mode, host, TLS)
 *   - Worker heartbeat freshness (worker:heartbeat key)
 *   - Per-queue counts: waiting, active, delayed, failed, completed
 *   - Waiting job IDs so you can cross-reference with UploadHistory.id
 *   - Active job IDs (jobs a Worker claims to be running right now)
 *   - Stuck-lock detection: any {site:*}:upload-lock keys still in Redis
 */

import { Queue } from "bullmq";
import { redis } from "../lib/redis";
import { QUEUE_NAME, PENTEST_QUEUE_NAME } from "../lib/queue";
import { THREAT_QUEUE_NAME } from "../lib/threat-intelligence/worker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const conn: any = redis;

function redactUrl(url: string | undefined) {
  if (!url) return "(unset)";
  return url.replace(/:([^:@]+)@/, ":****@");
}

async function summarize(name: string) {
  const q = new Queue(name, { connection: conn });
  try {
    const counts = await q.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed",
      "completed",
      "paused",
    );
    console.log(`\n--- Queue: ${name} ---`);
    console.log("  counts:", counts);

    const waiting = await q.getJobs(["waiting"], 0, 19, true);
    if (waiting.length) {
      console.log("  waiting job ids (up to 20):");
      for (const j of waiting) {
        console.log(
          `    - ${j.id}  attemptsMade=${j.attemptsMade}  addedAt=${new Date(j.timestamp).toISOString()}`,
        );
      }
    }

    const active = await q.getJobs(["active"], 0, 19, true);
    if (active.length) {
      console.log("  active job ids (up to 20):");
      for (const j of active) {
        console.log(
          `    - ${j.id}  attemptsMade=${j.attemptsMade}  startedAt=${
            j.processedOn ? new Date(j.processedOn).toISOString() : "?"
          }`,
        );
      }
    }

    const failed = await q.getJobs(["failed"], 0, 9, true);
    if (failed.length) {
      console.log("  recent failed job ids (up to 10):");
      for (const j of failed) {
        console.log(
          `    - ${j.id}  attemptsMade=${j.attemptsMade}  reason=${j.failedReason ?? "?"}`,
        );
      }
    }
  } finally {
    await q.close();
  }
}

async function main() {
  console.log("=== BullMQ Queue Diagnostics ===");
  console.log("REDIS_URL:", redactUrl(process.env.REDIS_URL));
  console.log("REDIS_CLUSTER_MODE:", process.env.REDIS_CLUSTER_MODE ?? "(unset)");

  // Heartbeat check
  try {
    const hbRaw = await conn.get("worker:heartbeat");
    if (!hbRaw) {
      console.log("\nworker:heartbeat: MISSING (worker has never written a heartbeat on this Redis)");
    } else {
      const ms = Number(hbRaw);
      const age = Date.now() - ms;
      console.log(
        `\nworker:heartbeat: ${new Date(ms).toISOString()}  (age: ${Math.round(age / 1000)}s)  ${
          age > 60_000 ? "  <-- STALE (>60s)" : ""
        }`,
      );
    }
  } catch (e) {
    console.error("Failed to read worker:heartbeat:", e);
  }

  // Stuck-lock detection
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keys: string[] = await (conn as any).keys("{site:*}:upload-lock");
    if (keys.length) {
      console.log(`\nSite upload locks currently held (${keys.length}):`);
      for (const k of keys) {
        const value = await conn.get(k);
        const ttl = await conn.ttl(k);
        console.log(`  ${k} -> uploadId=${value}  ttl=${ttl}s`);
      }
    } else {
      console.log("\nNo {site:*}:upload-lock keys held.");
    }
  } catch (e) {
    // KEYS may fail on managed Redis with restricted commands
    console.log("\n(Could not enumerate site locks — KEYS command may be restricted.)");
  }

  await summarize(QUEUE_NAME);
  await summarize(PENTEST_QUEUE_NAME);
  await summarize(THREAT_QUEUE_NAME);

  console.log("\nDone.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("diagnose-queue failed:", err);
    process.exit(1);
  });
