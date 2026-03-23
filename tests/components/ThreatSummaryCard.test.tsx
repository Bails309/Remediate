import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock fetch for the threat feed API call
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

// Mock lucide-react
vi.mock("lucide-react", () => ({
  ChevronRight: () => <span data-testid="chevron-right" />,
  Activity: () => <span data-testid="activity" />,
}));

import { ThreatSummaryCard } from "../../components/ThreatSummaryCard";

beforeEach(() => vi.clearAllMocks());

describe("ThreatSummaryCard", () => {
  it("shows loading state initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ThreatSummaryCard />);
    // During loading, animate-pulse should be present
    const container = document.querySelector(".animate-pulse");
    expect(container).not.toBeNull();
  });

  it("renders threats after fetch", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "t1", osvId: "OSV-1", cveId: "CVE-2024-001", summary: "SQL Injection", cvssScore: 9.8, cisaKevStatus: true, source: "NVD" },
        { id: "t2", osvId: "OSV-2", cveId: null, summary: "XSS Found", cvssScore: 6.5, cisaKevStatus: false, source: "OSV" },
      ],
    });

    render(<ThreatSummaryCard />);

    // Wait for threats to render
    expect(await screen.findByText("SQL Injection")).toBeInTheDocument();
    expect(screen.getByText("XSS Found")).toBeInTheDocument();
  });

  it("shows empty state when no threats", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    render(<ThreatSummaryCard />);

    expect(await screen.findByText(/Scanning global vectors/i)).toBeInTheDocument();
  });

  it("shows empty state on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    render(<ThreatSummaryCard />);

    expect(await screen.findByText(/Scanning global vectors/i)).toBeInTheDocument();
  });

  it("renders Live Intelligence heading", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    render(<ThreatSummaryCard />);

    expect(await screen.findByText("Live Intelligence")).toBeInTheDocument();
  });
});
