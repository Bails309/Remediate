import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getLatestVersion, __clearRegistryCache, REGISTRY_ECOSYSTEMS } from "@/lib/ai/registry";

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response;
}

beforeEach(() => {
  __clearRegistryCache();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getLatestVersion", () => {
  it("reads dist-tags.latest for npm and hits the npm registry host", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ "dist-tags": { latest: "4.18.2" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getLatestVersion("npm", "express");

    expect(result.latestVersion).toBe("4.18.2");
    expect(result.error).toBeUndefined();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://registry.npmjs.org/express");
  });

  it("preserves scoped npm package slashes and @", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ "dist-tags": { latest: "1.0.0" } }));
    vi.stubGlobal("fetch", fetchMock);

    await getLatestVersion("npm", "@scope/pkg");
    expect(fetchMock.mock.calls[0][0]).toBe("https://registry.npmjs.org/@scope/pkg");
  });

  it("reads info.version for pypi", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ info: { version: "2.31.0" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getLatestVersion("pypi", "requests");
    expect(result.latestVersion).toBe("2.31.0");
    expect(fetchMock.mock.calls[0][0]).toBe("https://pypi.org/pypi/requests/json");
  });

  it("picks the latest stable version for nuget (skips prereleases)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ versions: ["12.0.0", "13.0.0", "14.0.0-beta1"] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getLatestVersion("nuget", "Newtonsoft.Json");
    expect(result.latestVersion).toBe("13.0.0");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.nuget.org/v3-flatcontainer/newtonsoft.json/index.json",
    );
  });

  it("requires group:artifact for maven and returns an error otherwise", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getLatestVersion("maven", "just-artifact");
    expect(result.latestVersion).toBeNull();
    expect(result.error).toMatch(/group:artifact/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported ecosystems without calling the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getLatestVersion("cargo-typo", "serde");
    expect(result.error).toMatch(/Unsupported ecosystem/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid package names (SSRF/traversal guard)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getLatestVersion("npm", "../../etc/passwd");
    expect(result.error).toBe("Invalid package name.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a not-found error for 404 responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null, { ok: false, status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getLatestVersion("npm", "definitely-not-a-real-pkg-xyz");
    expect(result.latestVersion).toBeNull();
    expect(result.error).toBe("Package not found in registry.");
  });

  it("caches results so repeat lookups do not re-hit the registry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ "dist-tags": { latest: "1.2.3" } }));
    vi.stubGlobal("fetch", fetchMock);

    await getLatestVersion("npm", "lodash");
    await getLatestVersion("npm", "lodash");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("exposes exactly the supported ecosystems", () => {
    expect([...REGISTRY_ECOSYSTEMS]).toEqual([
      "npm",
      "pypi",
      "nuget",
      "maven",
      "rubygems",
      "crates",
      "packagist",
      "go",
    ]);
  });
});
