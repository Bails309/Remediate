import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

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
    vi.spyOn(toast, "success").mockImplementation(() => ({} as never));
    vi.spyOn(toast, "error").mockImplementation(() => ({} as never));
  });

  it("prompts before reassigning an already assigned issue", async () => {
    const mockFetch = createFetchMock({
      id: "v1",
      name: "TLS finding",
      assignee: { id: "u1", name: "Tech One" },
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    render(<VulnerabilitiesClient sites={[]} users={baseUsers} session={session as never} />);

    await screen.findByText("TLS finding");

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    await screen.findByText("1 selected");

    fireEvent.click(screen.getByRole("button", { name: "Assign to user" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Tech Two" })).toBeInTheDocument(), { timeout: 10000 });
    fireEvent.click(screen.getByRole("button", { name: "Tech Two" }));

    await waitFor(() => expect(screen.getByText("Confirm Reassignment")).toBeInTheDocument(), { timeout: 10000 });
    expect(screen.getByText(/already assigned/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalledWith(
      "/api/vulnerabilities/bulk",
      expect.objectContaining({ method: "POST" })
    );

    fireEvent.click(screen.getByRole("button", { name: "Swap Assignee" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/vulnerabilities/bulk",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ ids: ["v1"], assigneeId: "u2" }),
        })
      );
    });
    }, 10000);

  it("assigns immediately when the issue is currently unassigned", async () => {
    const mockFetch = createFetchMock({
      id: "v2",
      name: "OpenSSH finding",
      assignee: null,
      assigneeId: null,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    render(<VulnerabilitiesClient sites={[]} users={baseUsers} session={session as never} />);

    await screen.findByText("OpenSSH finding");

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    await screen.findByText("1 selected");

    fireEvent.click(screen.getByRole("button", { name: "Assign to user" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Tech Two" })).toBeInTheDocument(), { timeout: 10000 });
    fireEvent.click(screen.getByRole("button", { name: "Tech Two" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/vulnerabilities/bulk",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ ids: ["v2"], assigneeId: "u2" }),
        })
      );
    }, { timeout: 10000 });

    expect(screen.queryByText("Confirm Reassignment")).toBeNull();
  });

  it("prompts before reassigning from the detail sheet", async () => {
    const mockFetch = createFetchMock({
      id: "v3",
      name: "Kernel finding",
      assignee: { id: "u1", name: "Tech One" },
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    render(<VulnerabilitiesClient sites={[]} users={baseUsers} session={session as never} />);

    await screen.findByText("Kernel finding");
    fireEvent.click(screen.getByRole("button", { name: "View" }));

    await screen.findByText("Collaboration");
    fireEvent.click(screen.getByRole("button", { name: "Assign in detail" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Tech Two" })).toBeInTheDocument(), { timeout: 10000 });
    fireEvent.click(screen.getByRole("button", { name: "Tech Two" }));

    await waitFor(() => expect(screen.getAllByText("Confirm Reassignment")).toHaveLength(1), { timeout: 10000 });
    expect(screen.getByText(/This issue already has an owner/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Swap Assignee" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/vulnerabilities/v3",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ assigneeId: "u2" }),
        })
      );
    });
  });

  it("updates directly from the detail sheet when the issue is unassigned", async () => {
    const mockFetch = createFetchMock({
      id: "v4",
      name: "HTTP finding",
      assignee: null,
      assigneeId: null,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    render(<VulnerabilitiesClient sites={[]} users={baseUsers} session={session as never} />);

    await screen.findByText("HTTP finding");
    fireEvent.click(screen.getByRole("button", { name: "View" }));

    await screen.findByText("Collaboration");
    fireEvent.click(screen.getByRole("button", { name: "Assign in detail" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Tech Two" })).toBeInTheDocument(), { timeout: 10000 });
    fireEvent.click(screen.getByRole("button", { name: "Tech Two" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/vulnerabilities/v4",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ assigneeId: "u2" }),
        })
      );
    }, { timeout: 10000 });

    expect(screen.queryByText("Confirm Reassignment")).toBeNull();
  });
});