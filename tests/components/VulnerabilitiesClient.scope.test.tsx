import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VulnerabilitiesClient } from "@/app/(app)/vulnerabilities/vulnerabilities-client";

const session = {
  user: {
    id: "u1",
    roles: ["web_app_admin"],
  },
};

describe("VulnerabilitiesClient archived scope", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("switches to archived findings without mixing them into the active queue", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const parsed = new URL(url, "http://localhost");
      const scope = parsed.searchParams.get("scope") ?? "active";

      const item = scope === "archived"
        ? {
          id: "vh1",
          name: "Remediated finding",
          host: "archived-host",
          port: "443",
          pluginId: "2002",
          cve: null,
          risk: "Low",
          status: "Remediated",
          lastSeenAt: "2026-03-11T00:00:00.000Z",
          archivedAt: "2026-03-12T00:00:00.000Z",
          assigneeId: null,
          assignee: null,
          askForHelp: false,
          collaborators: [],
          recordScope: "archived",
        }
        : {
          id: "v1",
          name: "Open finding",
          host: "active-host",
          port: "443",
          pluginId: "1001",
          cve: null,
          risk: "High",
          status: "Open",
          lastSeenAt: "2026-03-12T00:00:00.000Z",
          assigneeId: null,
          assignee: null,
          askForHelp: false,
          collaborators: [],
          recordScope: "active",
        };

      return Promise.resolve({
        ok: true,
        json: async () => ({ items: [item], total: 1, page: 1, pageSize: 25, scope }),
      } as Response);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    render(<VulnerabilitiesClient sites={[]} users={[]} session={session as never} />);

    expect(await screen.findByText("Open finding")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("scope=active"));

    fireEvent.click(screen.getByRole("button", { name: "Active Findings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Archived Findings" }));

    expect(await screen.findByText("Remediated finding")).toBeInTheDocument();
    expect(screen.queryByText("Open finding")).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("scope=archived")));
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(await screen.findByText(/This record is archived history/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assign in detail" })).toBeNull();
  }, 10000);

  it("sends archived date range filters only in archived mode", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const parsed = new URL(url, "http://localhost");
      const scope = parsed.searchParams.get("scope") ?? "active";

      return Promise.resolve({
        ok: true,
        json: async () => ({
          items: [
            {
              id: scope === "archived" ? "vh1" : "v1",
              name: scope === "archived" ? "Archived finding" : "Active finding",
              host: "host",
              port: "443",
              pluginId: "1001",
              cve: null,
              risk: scope === "archived" ? "Low" : "High",
              status: scope === "archived" ? "Remediated" : "Open",
              lastSeenAt: "2026-03-12T00:00:00.000Z",
              archivedAt: scope === "archived" ? "2026-03-12T00:00:00.000Z" : null,
              assigneeId: null,
              assignee: null,
              askForHelp: false,
              collaborators: [],
              recordScope: scope,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 25,
          scope,
        }),
      } as Response);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    render(<VulnerabilitiesClient sites={[]} users={[]} session={session as never} />);

    await screen.findByText("Active finding");
    expect(fetchMock).toHaveBeenCalledWith(expect.not.stringContaining("archivedFrom="));

    fireEvent.click(screen.getByRole("button", { name: "Active Findings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Archived Findings" }));

    const fromInput = await screen.findByLabelText("Archived from");
    const toInput = await screen.findByLabelText("Archived to");

    fireEvent.change(fromInput, { target: { value: "2026-03-01" } });
    fireEvent.change(toInput, { target: { value: "2026-03-12" } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("archivedFrom=2026-03-01"));
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("archivedTo=2026-03-12"));
    });
  }, 10000);

  it("applies and clears archived date presets", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const parsed = new URL(url, "http://localhost");
      const scope = parsed.searchParams.get("scope") ?? "active";

      return Promise.resolve({
        ok: true,
        json: async () => ({
          items: [
            {
              id: scope === "archived" ? "vh1" : "v1",
              name: scope === "archived" ? "Archived finding" : "Active finding",
              host: "host",
              port: "443",
              pluginId: "1001",
              cve: null,
              risk: scope === "archived" ? "Low" : "High",
              status: scope === "archived" ? "Remediated" : "Open",
              lastSeenAt: "2026-03-12T00:00:00.000Z",
              archivedAt: scope === "archived" ? "2026-03-12T00:00:00.000Z" : null,
              assigneeId: null,
              assignee: null,
              askForHelp: false,
              collaborators: [],
              recordScope: scope,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 25,
          scope,
        }),
      } as Response);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      render(<VulnerabilitiesClient sites={[]} users={[]} session={session as never} />);
      await vi.advanceTimersByTimeAsync(20);

      await screen.findByText("Active finding");
      fireEvent.click(screen.getByRole("button", { name: "Active Findings" }));
      fireEvent.click(await screen.findByRole("button", { name: "Archived Findings" }));
      await vi.advanceTimersByTimeAsync(20);

      fireEvent.click(await screen.findByRole("button", { name: "Last 7 Days" }));
      await vi.advanceTimersByTimeAsync(20);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("archivedFrom=2026-03-06"));
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("archivedTo=2026-03-12"));
      });

      expect((screen.getByLabelText("Archived from") as HTMLInputElement).value).toBe("2026-03-06");
      expect((screen.getByLabelText("Archived to") as HTMLInputElement).value).toBe("2026-03-12");

      fireEvent.click(screen.getByRole("button", { name: "Clear Dates" }));
      await vi.advanceTimersByTimeAsync(20);

      await waitFor(() => {
        const archivedCalls = fetchMock.mock.calls
          .map((call) => String(call[0]))
          .filter((url) => url.includes("scope=archived"));
        expect(archivedCalls.at(-1)).not.toContain("archivedFrom=");
        expect(archivedCalls.at(-1)).not.toContain("archivedTo=");
      });
    } finally {
      vi.useRealTimers();
    }
  }, 10000);
});