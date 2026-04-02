import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThreatFeed } from "../../components/ThreatFeed";

describe("ThreatFeed component", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders loading state initially", () => {
    (fetch as any).mockReturnValue(new Promise(() => {})); // Never resolves
    render(<ThreatFeed />);
    expect(screen.getByText("Live Threat Intelligence")).toBeInTheDocument();
    // Pulse divs are present during loading
  });

  it("renders threats and correct external links", async () => {
    const mockThreats = [
      {
        id: "1",
        osvId: "CVE-2024-0001",
        cveId: "CVE-2024-0001",
        summary: "NVD Threat",
        source: "NVD",
        cvssScore: 9.8,
        cisaKevStatus: true,
        publishedAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      },
      {
        id: "2",
        osvId: "GHSA-xxxx",
        cveId: null,
        summary: "OSV Threat",
        source: "OSV",
        cvssScore: 7.5,
        cisaKevStatus: false,
        publishedAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      }
    ];

    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockThreats,
    });

    render(<ThreatFeed />);

    await waitFor(() => {
      expect(screen.getByText("NVD Threat")).toBeInTheDocument();
      expect(screen.getByText("OSV Threat")).toBeInTheDocument();
    });

    // Check links
    const links = screen.getAllByRole("link");
    
    // NVD Link
    const nvdLink = links.find(l => l.getAttribute("href")?.includes("nvd.nist.gov"));
    expect(nvdLink).toBeDefined();
    expect(nvdLink?.getAttribute("href")).toBe("https://nvd.nist.gov/vuln/detail/CVE-2024-0001");

    // OSV Link
    const osvLink = links.find(l => l.getAttribute("href")?.includes("osv.dev"));
    expect(osvLink).toBeDefined();
    expect(osvLink?.getAttribute("href")).toBe("https://osv.dev/vulnerability/GHSA-xxxx");
  });

  it("renders empty state if no threats found", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    render(<ThreatFeed />);

    await waitFor(() => {
      expect(screen.getByText("No active threats detected in feed.")).toBeInTheDocument();
    });
  });

  it("handles fetch throwing an error gracefully", async () => {
    (fetch as any).mockRejectedValue(new Error("Network error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<ThreatFeed />);

    await waitFor(() => {
      expect(screen.getByText("No active threats detected in feed.")).toBeInTheDocument();
    });
    expect(consoleSpy).toHaveBeenCalledWith("Failed to fetch threat feed", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("handles non-ok response without crashing", async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 500 });

    render(<ThreatFeed />);

    await waitFor(() => {
      expect(screen.getByText("No active threats detected in feed.")).toBeInTheDocument();
    });
  });
});
