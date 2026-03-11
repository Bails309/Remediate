import React from "react";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { UsersClient } from "@/app/(app)/admin/users/users-client";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("UsersClient focused error and delete flows", () => {
  it("shows a toast error when fetching users fails", async () => {
    const mockFetch = vi.fn(() => Promise.resolve({ ok: false, json: async () => ({ error: 'nope' }) } as Response));
    // @ts-expect-error
    global.fetch = mockFetch as unknown as typeof fetch;

    const { toast } = await import("sonner");
    const toastSpy = vi.spyOn(toast, "error").mockImplementation(() => ({} as any));

    render(<UsersClient />);

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());

    toastSpy.mockRestore();
  });

  it("shows toast error when PATCH update fails", async () => {
    const user = { id: "u1", name: "Bob", email: "b@x.com", roles: ["web_app_user"], authSource: "LOCAL", createdAt: new Date().toISOString() };

    const mockFetch = vi.fn((input: RequestInfo | URL, opts?: RequestInit) => {
      const url = typeof input === "string" ? input : (input instanceof URL ? input.toString() : (input as any).url);
      if (url.includes("/api/admin/users") && (!opts || !(opts as any).method)) {
        return Promise.resolve({ ok: true, json: async () => [user] } as Response);
      }
      if (url.includes("/api/admin/users") && opts && (opts as any).method === "PATCH") {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'patch-failed' }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });
    // @ts-expect-error
    global.fetch = mockFetch as unknown as typeof fetch;

    const { toast } = await import("sonner");
    const toastSpy = vi.spyOn(toast, "error").mockImplementation(() => ({} as any));

    render(<UsersClient />);

    // Wait for user row
    await waitFor(() => expect(screen.getByText("Bob")).toBeDefined());

    const rows = screen.getAllByRole("row");
    const row = rows.find(r => r.textContent?.includes("Bob"));
    expect(row).toBeDefined();

    // Toggle a role and click Save roles
    const toggle = within(row as HTMLElement).getByText("Toolkit Admin");
    fireEvent.click(toggle);
    const saveBtn = within(row as HTMLElement).getByText(/Save roles/i);
    fireEvent.click(saveBtn);

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());

    toastSpy.mockRestore();
  });

  it("cancels delete when confirm is dismissed and performs delete when confirmed", async () => {
    const user = { id: "u2", name: "Carol", email: "c@x.com", roles: ["web_app_user"], authSource: "LOCAL", createdAt: new Date().toISOString() };

    let deleteCalled = false;
    const mockFetch = vi.fn((input: RequestInfo | URL, opts?: RequestInit) => {
      const url = typeof input === "string" ? input : (input instanceof URL ? input.toString() : (input as any).url);
      if (url.includes("/api/admin/users") && (!opts || !(opts as any).method)) {
        return Promise.resolve({ ok: true, json: async () => [user] } as Response);
      }
      if (url.includes("/api/admin/users") && opts && (opts as any).method === "DELETE") {
        deleteCalled = true;
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });
    // @ts-expect-error
    global.fetch = mockFetch as unknown as typeof fetch;

    // stub confirm to cancel first
    const origConfirm = (global as any).confirm;
    (global as any).confirm = () => false;

    render(<UsersClient />);

    await waitFor(() => expect(screen.getByText("Carol")).toBeDefined());

    const rows = screen.getAllByRole("row");
    const row = rows.find(r => r.textContent?.includes("Carol")) as HTMLElement;
    expect(row).toBeDefined();

    const deleteBtn = within(row).getByText(/Delete/i);
    fireEvent.click(deleteBtn);

    // Ensure delete fetch not called when confirm is false
    await new Promise((res) => setTimeout(res, 50));
    expect(deleteCalled).toBe(false);

    // Now confirm true and click delete
    (global as any).confirm = () => true;
    const deleteBtn2 = within(row).getByText(/Delete/i);
    fireEvent.click(deleteBtn2);

    await waitFor(() => expect(deleteCalled).toBe(true));

    // restore
    (global as any).confirm = origConfirm;
  });
});
