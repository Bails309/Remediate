import React from "react";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { UsersClient } from "@/app/(app)/admin/users/users-client";

describe("UsersClient", () => {
  it("loads users, toggles role and PATCHes updated roles", async () => {
    const user = { id: "u1", name: "Alice", email: "a@b.com", roles: ["web_app_user"], authSource: "LOCAL", createdAt: new Date().toISOString() };

    const mockFetch = vi.fn((input: RequestInfo | URL, opts?: RequestInit) => {
      const url = typeof input === "string" ? input : (input instanceof URL ? input.toString() : (input as any).url);
      if (url.includes("/api/admin/users") && (!opts || !(opts as any).method)) {
        return Promise.resolve({ ok: true, json: async () => [user] } as Response);
      }
      if (url.includes("/api/admin/users") && opts && (opts as any).method === "PATCH") {
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    // @ts-expect-error mocking global fetch
    global.fetch = mockFetch as unknown as typeof fetch;

    render(<UsersClient />);

    // Wait for user row
    await waitFor(() => expect(screen.getByText("Alice")).toBeDefined());

    // Find the table row containing this user
    const rows = screen.getAllByRole("row");
    const row = rows.find(r => r.textContent?.includes("Alice"));
    expect(row).toBeDefined();

    // Toggle 'Toolkit Admin' role within that row
    const toggle = within(row as HTMLElement).getByText("Toolkit Admin");
    fireEvent.click(toggle);

    // Click Save roles within the row
    const saveBtn = within(row as HTMLElement).getByText(/Save roles/i);
    fireEvent.click(saveBtn);

    // Expect a PATCH call with the new role included
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const patchCall = mockFetch.mock.calls.find(c => String(c[0]).includes("/api/admin/users") && c[1] && (c[1] as any).method === "PATCH");
    expect(patchCall).toBeDefined();
    const body = JSON.parse((patchCall as any)[1].body as string);
    expect(body.userId).toBe("u1");
    expect(body.roles).toContain("toolkit_admin");
  });
});
