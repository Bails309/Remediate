import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/lib/toast";

import { VulnerabilitiesClient } from "@/app/(app)/vulnerabilities/vulnerabilities-client";

const baseUsers = [
  { id: "u1", name: "Tech One" },
  { id: "u2", name: "Tech Two" },
  { id: "u3", name: "Current User" },
];

const session = {
  user: {
    id: "u3",
    roles: ["web_app_admin"],
  },
};

function createFetchMock(item: {
  id: string;
  name: string;
  assignee?: { id: string; name: string } | null;
  assigneeId?: string | null;
}) {
  const currentItem = {
    ...item,
    assignee: item.assignee ?? null,
    assigneeId: item.assigneeId ?? item.assignee?.id ?? null,
  };

  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.startsWith("/api/vulnerabilities?") || url === "/api/vulnerabilities") {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          items: [
            {
              id: item.id,
              name: item.name,
              host: "host-1",
              port: "443",
              pluginId: "1001",
              cve: null,
              risk: "High",
              status: "Open",
              lastSeenAt: "2026-03-12T00:00:00.000Z",
              assignee: currentItem.assignee,
              assigneeId: currentItem.assigneeId,
              askForHelp: false,
              collaborators: [],
            },
          ],
          total: 1,
        }),
      } as Response);
    }

    if (url === "/api/vulnerabilities/bulk" && init?.method === "POST") {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response);
    }

    if (url === `/api/vulnerabilities/${currentItem.id}` && init?.method === "PATCH") {
      const parsed = JSON.parse(String(init.body ?? "{}")) as { assigneeId?: string | null };
      currentItem.assigneeId = parsed.assigneeId ?? null;
      currentItem.assignee = parsed.assigneeId
        ? baseUsers.find((user) => user.id === parsed.assigneeId) ?? null
        : null;

      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: currentItem.id,
          name: currentItem.name,
          host: "host-1",
          port: "443",
          pluginId: "1001",
          cve: null,
          risk: "High",
          status: "Open",
          lastSeenAt: "2026-03-12T00:00:00.000Z",
          assignee: currentItem.assignee,
          assigneeId: currentItem.assigneeId,
          askForHelp: false,
          collaborators: [],
        }),
      } as Response);
    }

    return Promise.resolve({
      ok: true,
      json: async () => ([]),
    } as Response);
  });
}

describe("VulnerabilitiesClient assignment confirmation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
    vi.spyOn(toast, "success").mockImplementation(() => ({} as never));
    vi.spyOn(toast, "error").mockImplementation(() => ({} as never));
  });

  afterEach(() => {
    if ((vi as any).unstubAllGlobals) (vi as any).unstubAllGlobals();
  });

  it("prompts before reassigning an already assigned issue", async () => {
    const mockFetch = createFetchMock({
      id: "v1",
      name: "TLS finding",
      assignee: { id: "u1", name: "Tech One" },
    });
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    render(<VulnerabilitiesClient sites={[]} users={baseUsers} session={session as never} />);

    await screen.findByText("TLS finding");

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    await screen.findByText("1 selected");

    fireEvent.click(screen.getByRole("button", { name: "Assign to user" }));
    // Use the native hidden select inside the action bar for deterministic tests
    const actionBar = screen.getByText("1 selected").closest("div");
    const assignSelect = Array.from(actionBar?.querySelectorAll("select") ?? []).find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.text === "Tech Two")) as HTMLSelectElement | undefined;
    if (!assignSelect) throw new Error("Assign select not found");
    await userEvent.selectOptions(assignSelect, "u2");

    // For an already-assigned issue we should see a confirmation first
    await screen.findByText(/Confirm Reassignment/i, {}, { timeout: 10000 });
    expect(screen.getByText(/already assigned/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Swap Assignee" }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled(), { timeout: 10000 });
    const calls = (mockFetch as any).mock.calls as Array<any[]>;
    const bulkCall = calls.find((c) => String(c[0]).includes("/api/vulnerabilities/bulk") && c[1] && (c[1] as RequestInit).method === "POST");
    expect(bulkCall).toBeTruthy();
    const init = bulkCall![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ ids: ["v1"], assigneeId: "u2" });
    }, 10000);

  it("assigns immediately when the issue is currently unassigned", async () => {
    const mockFetch = createFetchMock({
      id: "v2",
      name: "OpenSSH finding",
      assignee: null,
      assigneeId: null,
    });
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    render(<VulnerabilitiesClient sites={[]} users={baseUsers} session={session as never} />);

    await screen.findByText("OpenSSH finding");

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    await screen.findByText("1 selected");

    fireEvent.click(screen.getByRole("button", { name: "Assign to user" }));
    const actionBar2 = screen.getByText("1 selected").closest("div");
    const assignSelect2 = Array.from(actionBar2?.querySelectorAll("select") ?? []).find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.text === "Tech Two")) as HTMLSelectElement | undefined;
    if (!assignSelect2) throw new Error("Assign select not found");
    await userEvent.selectOptions(assignSelect2, "u2");

    await waitFor(() => expect(mockFetch).toHaveBeenCalled(), { timeout: 10000 });
    const calls2 = (mockFetch as any).mock.calls as Array<any[]>;
    const bulkCall2 = calls2.find((c) => String(c[0]).includes("/api/vulnerabilities/bulk") && c[1] && (c[1] as RequestInit).method === "POST");
    expect(bulkCall2).toBeTruthy();
    const init2 = bulkCall2![1] as RequestInit;
    expect(init2.method).toBe("POST");
    expect(JSON.parse(String(init2.body))).toEqual({ ids: ["v2"], assigneeId: "u2" });

    expect(screen.queryByText(/Confirm Reassignment/i)).toBeNull();
  });

  it("prompts before reassigning from the detail sheet", async () => {
    const mockFetch = createFetchMock({
      id: "v3",
      name: "Kernel finding",
      assignee: { id: "u1", name: "Tech One" },
    });
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    render(<VulnerabilitiesClient sites={[]} users={baseUsers} session={session as never} />);

    await screen.findByText("Kernel finding");
    fireEvent.click(screen.getByRole("button", { name: "View" }));

    await screen.findByText("Collaboration");
    fireEvent.click(screen.getByRole("button", { name: "Assign in detail" }));
    const assignButtonEl = screen.getByRole("button", { name: "Assign in detail" });
    const detailPanel = assignButtonEl.closest("div");
    const assignSelect3 = Array.from(detailPanel?.querySelectorAll("select") ?? []).find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.text === "Tech Two")) as HTMLSelectElement | undefined;
    if (!assignSelect3) throw new Error("Assign select not found");
    await userEvent.selectOptions(assignSelect3, "u2");

    // For detail reassign, expect confirmation before PATCH
    await screen.findAllByText(/Confirm Reassignment/i, {}, { timeout: 10000 });
    expect(screen.getByText(/This issue already has an owner/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Swap Assignee" }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled(), { timeout: 10000 });
    const calls3 = (mockFetch as any).mock.calls as Array<any[]>;
    const patchCall3 = calls3.find((c) => String(c[0]).includes("/api/vulnerabilities/v3") && c[1] && (c[1] as RequestInit).method === "PATCH");
    expect(patchCall3).toBeTruthy();
    const init3 = patchCall3![1] as RequestInit;
    expect(init3.method).toBe("PATCH");
    expect(JSON.parse(String(init3.body))).toEqual({ assigneeId: "u2" });
  }, 30000);

  it("updates directly from the detail sheet when the issue is unassigned", async () => {
    const mockFetch = createFetchMock({
      id: "v4",
      name: "HTTP finding",
      assignee: null,
      assigneeId: null,
    });
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    render(<VulnerabilitiesClient sites={[]} users={baseUsers} session={session as never} />);

    await screen.findByText("HTTP finding");
    fireEvent.click(screen.getByRole("button", { name: "View" }));

    await screen.findByText("Collaboration");
    fireEvent.click(screen.getByRole("button", { name: "Assign in detail" }));
    const assignButtonEl2 = screen.getByRole("button", { name: "Assign in detail" });
    const detailPanel2 = assignButtonEl2.closest("div");
    const assignSelect4 = Array.from(detailPanel2?.querySelectorAll("select") ?? []).find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.text === "Tech Two")) as HTMLSelectElement | undefined;
    if (!assignSelect4) throw new Error("Assign select not found");
    await userEvent.selectOptions(assignSelect4, "u2");

    await waitFor(() => expect(mockFetch).toHaveBeenCalled(), { timeout: 10000 });
    const calls4 = (mockFetch as any).mock.calls as Array<any[]>;
    const patchCall4 = calls4.find((c) => String(c[0]).includes("/api/vulnerabilities/v4") && c[1] && (c[1] as RequestInit).method === "PATCH");
    expect(patchCall4).toBeTruthy();
    const init4 = patchCall4![1] as RequestInit;
    expect(init4.method).toBe("PATCH");
    expect(JSON.parse(String(init4.body))).toEqual({ assigneeId: "u2" });

    expect(screen.queryByText(/Confirm Reassignment/i)).toBeNull();
  }, 30000);
});