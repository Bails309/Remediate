/**
 * Live "latest version" lookups against public package registries. Used by the
 * AI chat's `get_latest_version` tool so the assistant can tell operators whether
 * a vulnerable component has a newer release available.
 *
 * Security posture:
 *  - Only a fixed allow-list of ecosystems is supported; each maps to a HARD-CODED
 *    registry host. The model never supplies a URL, so this cannot be turned into
 *    an SSRF primitive — the package name is the only user-influenced value and it
 *    is URL-encoded into a known path.
 *  - Package names are validated against a conservative charset before use.
 *  - Every request has a short timeout and results are cached in-process to avoid
 *    hammering registries during a multi-turn conversation.
 */

// This is an HTTP User-Agent header value sent to public package registries,
// not a credential. nosemgrep: ajinabraham.njsscan.generic.hardcoded_secrets.node_username
const USER_AGENT = "Remediate-AI/1.0 (+vulnerability-remediation-assistant)";
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export const REGISTRY_ECOSYSTEMS = [
  "npm",
  "pypi",
  "nuget",
  "maven",
  "rubygems",
  "crates",
  "packagist",
  "go",
] as const;

export type RegistryEcosystem = (typeof REGISTRY_ECOSYSTEMS)[number];

export function isRegistryEcosystem(value: string): value is RegistryEcosystem {
  return (REGISTRY_ECOSYSTEMS as readonly string[]).includes(value);
}

export type LatestVersionResult = {
  ecosystem: RegistryEcosystem;
  packageName: string;
  latestVersion: string | null;
  source: string;
  /** Present only when the lookup failed or the package was not found. */
  error?: string;
};

type CacheEntry = { value: LatestVersionResult; expires: number };
const cache = new Map<string, CacheEntry>();

/**
 * Conservative package-name validation. Covers the union of characters used by
 * the supported ecosystems (scoped npm `@scope/name`, Maven `group:artifact`,
 * Go module paths, Composer `vendor/pkg`). Rejects anything with whitespace,
 * path traversal, or protocol-like tokens.
 */
function isValidPackageName(name: string): boolean {
  if (!name || name.length > 214) return false;
  if (name.includes("..") || name.includes("//")) return false;
  return /^[A-Za-z0-9._@/:+-]+$/.test(name);
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`registry responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/plain", "User-Agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`registry responded ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Drop pre-release / build metadata so we compare stable releases only. */
function isStableVersion(v: string): boolean {
  return !/[-+]/.test(v);
}

function pickLatestStable(versions: string[]): string | null {
  const stable = versions.filter(isStableVersion);
  const pool = stable.length ? stable : versions;
  if (!pool.length) return null;
  // Registries below already return versions in ascending order.
  return pool[pool.length - 1];
}

async function lookupNpm(pkg: string): Promise<string | null> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkg).replace(/%40/g, "@").replace(/%2F/g, "/")}`;
  const data = (await fetchJson(url)) as { "dist-tags"?: { latest?: string } } | null;
  return data?.["dist-tags"]?.latest ?? null;
}

async function lookupPypi(pkg: string): Promise<string | null> {
  const url = `https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`;
  const data = (await fetchJson(url)) as { info?: { version?: string } } | null;
  return data?.info?.version ?? null;
}

async function lookupNuget(pkg: string): Promise<string | null> {
  const id = pkg.toLowerCase();
  const url = `https://api.nuget.org/v3-flatcontainer/${encodeURIComponent(id)}/index.json`;
  const data = (await fetchJson(url)) as { versions?: string[] } | null;
  return data?.versions?.length ? pickLatestStable(data.versions) : null;
}

async function lookupMaven(pkg: string): Promise<string | null> {
  // Expects "group:artifact".
  const [group, artifact] = pkg.split(":");
  if (!group || !artifact) throw new Error('Maven packages must be "group:artifact".');
  const q = encodeURIComponent(`g:"${group}" AND a:"${artifact}"`);
  const url = `https://search.maven.org/solrsearch/select?q=${q}&core=gav&rows=1&wt=json`;
  const data = (await fetchJson(url)) as { response?: { docs?: Array<{ v?: string }> } } | null;
  return data?.response?.docs?.[0]?.v ?? null;
}

async function lookupRubygems(pkg: string): Promise<string | null> {
  const url = `https://rubygems.org/api/v1/gems/${encodeURIComponent(pkg)}.json`;
  const data = (await fetchJson(url)) as { version?: string } | null;
  return data?.version ?? null;
}

async function lookupCrates(pkg: string): Promise<string | null> {
  const url = `https://crates.io/api/v1/crates/${encodeURIComponent(pkg)}`;
  const data = (await fetchJson(url)) as
    | { crate?: { max_stable_version?: string; newest_version?: string } }
    | null;
  return data?.crate?.max_stable_version ?? data?.crate?.newest_version ?? null;
}

async function lookupPackagist(pkg: string): Promise<string | null> {
  // Expects "vendor/package".
  if (!pkg.includes("/")) throw new Error('Composer packages must be "vendor/package".');
  const url = `https://repo.packagist.org/p2/${pkg}.json`;
  const data = (await fetchJson(url)) as
    | { packages?: Record<string, Array<{ version?: string }>> }
    | null;
  const versions = data?.packages?.[pkg];
  if (!versions?.length) return null;
  // Packagist lists newest first; skip dev branches.
  const stable = versions.find((v) => v.version && isStableVersion(v.version));
  return (stable ?? versions[0])?.version ?? null;
}

async function lookupGo(pkg: string): Promise<string | null> {
  const url = `https://proxy.golang.org/${pkg.toLowerCase()}/@latest`;
  const data = (await fetchJson(url)) as { Version?: string } | null;
  if (data?.Version) return data.Version;
  // Some modules only expose the list endpoint.
  const list = await fetchText(`https://proxy.golang.org/${pkg.toLowerCase()}/@v/list`);
  if (!list) return null;
  const versions = list.split("\n").map((v) => v.trim()).filter(Boolean);
  return pickLatestStable(versions);
}

const LOOKUPS: Record<RegistryEcosystem, (pkg: string) => Promise<string | null>> = {
  npm: lookupNpm,
  pypi: lookupPypi,
  nuget: lookupNuget,
  maven: lookupMaven,
  rubygems: lookupRubygems,
  crates: lookupCrates,
  packagist: lookupPackagist,
  go: lookupGo,
};

/**
 * Resolve the latest published version of a package. Never throws — failures are
 * returned as an `error` field so the model can relay them to the user.
 */
export async function getLatestVersion(
  ecosystem: string,
  packageName: string,
): Promise<LatestVersionResult> {
  const pkg = packageName.trim();

  if (!isRegistryEcosystem(ecosystem)) {
    return {
      ecosystem: ecosystem as RegistryEcosystem,
      packageName: pkg,
      latestVersion: null,
      source: "unsupported",
      error: `Unsupported ecosystem "${ecosystem}". Supported: ${REGISTRY_ECOSYSTEMS.join(", ")}.`,
    };
  }
  if (!isValidPackageName(pkg)) {
    return {
      ecosystem,
      packageName: pkg,
      latestVersion: null,
      source: ecosystem,
      error: "Invalid package name.",
    };
  }

  const key = `${ecosystem}:${pkg.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  let result: LatestVersionResult;
  try {
    const latestVersion = await LOOKUPS[ecosystem](pkg);
    result = {
      ecosystem,
      packageName: pkg,
      latestVersion,
      source: ecosystem,
      ...(latestVersion ? {} : { error: "Package not found in registry." }),
    };
  } catch (error) {
    result = {
      ecosystem,
      packageName: pkg,
      latestVersion: null,
      source: ecosystem,
      error: error instanceof Error ? error.message : "Registry lookup failed.",
    };
  }

  cache.set(key, { value: result, expires: Date.now() + CACHE_TTL_MS });
  return result;
}

/** Test helper — clears the in-process cache. */
export function __clearRegistryCache() {
  cache.clear();
}
