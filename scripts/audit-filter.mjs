#!/usr/bin/env node
/**
 * Reads `npm audit --json` from stdin, cross-references advisories against
 * `.audit-allowlist.json`, and exits non-zero when any high/critical advisory
 * remains that is NOT on the allowlist (or has an expired allowlist entry).
 *
 * Usage:
 *   npm audit --omit=dev --json | node scripts/audit-filter.mjs [--audit-level=high]
 *
 * Options:
 *   --audit-level=<low|moderate|high|critical>  Minimum severity to fail on
 *                                              (default: high, matching CI gate)
 *
 * Design notes:
 *   - Allowlist entries MUST include an `expires` ISO date. After that date the
 *     entry is treated as inactive and the advisory reappears in the failure
 *     list. This forces periodic re-review so we don't accumulate stale
 *     suppressions.
 *   - The script prints a human-readable summary to stdout regardless of exit
 *     code. Blocking advisories are printed to stderr for CI log clarity.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SEVERITY_ORDER = ["info", "low", "moderate", "high", "critical"];

function parseArgs(argv) {
  const args = { auditLevel: "high" };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--audit-level=(low|moderate|high|critical)$/);
    if (m) args.auditLevel = m[1];
  }
  return args;
}

function severityAtLeast(actual, min) {
  return SEVERITY_ORDER.indexOf(actual) >= SEVERITY_ORDER.indexOf(min);
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function loadAllowlist(repoRoot) {
  const path = join(repoRoot, ".audit-allowlist.json");
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return { entries: [], path };
  }
  const parsed = JSON.parse(raw);
  const now = Date.now();
  const entries = (parsed.allowlist || []).map((e) => ({
    ghsa: String(e.ghsa || "").toLowerCase(),
    package: e.package,
    severity: e.severity,
    reason: e.reason,
    expires: e.expires,
    expired: e.expires ? new Date(e.expires).getTime() < now : false,
  }));
  return { entries, path };
}

function extractGhsa(url) {
  // Match https://github.com/advisories/GHSA-xxxx-xxxx-xxxx (GitHub uses lowercase).
  const m = String(url || "").match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i);
  return m ? m[0].toLowerCase() : null;
}

function collectAdvisories(audit) {
  // npm audit --json shape (npm 7+):
  //   { vulnerabilities: { <pkg>: { via: [ { name, source, url, severity, title }, ... ] } } }
  // A `via` entry can also be a string (transitive placeholder) — we ignore those,
  // they'll be represented as objects for at least one package in the tree.
  const out = [];
  const seen = new Set();
  const vulns = audit?.vulnerabilities || {};
  for (const [pkg, node] of Object.entries(vulns)) {
    for (const via of node.via || []) {
      if (typeof via !== "object" || !via) continue;
      const ghsa = extractGhsa(via.url);
      if (!ghsa) continue;
      const key = `${ghsa}|${via.name || pkg}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        ghsa,
        package: via.name || pkg,
        severity: via.severity || node.severity || "unknown",
        title: via.title || "(no title)",
        url: via.url,
      });
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "..");
  const { entries: allowlist, path: allowlistPath } = loadAllowlist(repoRoot);

  const stdin = await readStdin();
  let audit;
  try {
    audit = JSON.parse(stdin || "{}");
  } catch (e) {
    console.error("audit-filter: failed to parse npm audit JSON from stdin:", e.message);
    process.exit(2);
  }

  const advisories = collectAdvisories(audit);
  const gated = advisories.filter((a) => severityAtLeast(a.severity, args.auditLevel));

  const activeAllow = new Map();
  const expiredAllow = new Map();
  for (const e of allowlist) {
    (e.expired ? expiredAllow : activeAllow).set(e.ghsa, e);
  }

  const blocking = [];
  const suppressed = [];
  const expired = [];
  for (const a of gated) {
    if (activeAllow.has(a.ghsa)) {
      suppressed.push({ ...a, reason: activeAllow.get(a.ghsa).reason });
    } else if (expiredAllow.has(a.ghsa)) {
      expired.push({ ...a, entry: expiredAllow.get(a.ghsa) });
      blocking.push(a);
    } else {
      blocking.push(a);
    }
  }

  console.log(`audit-filter: allowlist at ${allowlistPath}`);
  console.log(`audit-filter: gate=${args.auditLevel}, total advisories=${advisories.length}, at-or-above-gate=${gated.length}`);
  console.log(`audit-filter: suppressed=${suppressed.length}, expired=${expired.length}, blocking=${blocking.length}`);

  if (suppressed.length) {
    console.log("\nSuppressed (allowlisted):");
    for (const a of suppressed) {
      console.log(`  - ${a.ghsa} [${a.severity}] ${a.package}: ${a.title}`);
      console.log(`      reason: ${a.reason}`);
    }
  }

  if (expired.length) {
    console.error("\nExpired allowlist entries (re-review required):");
    for (const a of expired) {
      console.error(`  - ${a.ghsa} [${a.severity}] ${a.package} — expired ${a.entry.expires}`);
    }
  }

  if (blocking.length) {
    console.error("\nBlocking advisories:");
    for (const a of blocking) {
      console.error(`  - ${a.ghsa} [${a.severity}] ${a.package}: ${a.title}`);
      console.error(`      ${a.url}`);
    }
    process.exit(1);
  }

  console.log("\naudit-filter: no unallowlisted advisories at or above gate. OK.");
}

main().catch((e) => {
  console.error("audit-filter: fatal:", e);
  process.exit(2);
});
