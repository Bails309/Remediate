import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, vi, beforeEach } from "vitest";

import { SitesClient } from "@/app/(app)/sites/sites-client";
import { toast } from "sonner";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("SitesClient", () => {
  it("creates and removes a site", async () => {
    const mockFetch = vi.fn((input: any) => {
      if (typeof input === "string" && input.includes("/api/sites") && !(input.includes("/api/sites/"))) {
        // POST create
        return Promise.resolve({ ok: true, json: async () => ({ id: "s-new", name: "New Site" }) });
      }
      if (typeof input === "string" && input.includes("/api/sites/") && input.includes("DELETE")) {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = mockFetch as any;

    const toastSpy = vi.spyOn(toast, "success").mockImplementation(() => ({} as any));

    render(<SitesClient initialSites={[{ id: "s1", name: "Site 1" }]} />);

    const input = screen.getByPlaceholderText("Create new site");
    fireEvent.change(input, { target: { value: "New Site" } });

    const btn = screen.getByText("Add Site");
    fireEvent.click(btn);

    await waitFor(() => expect(screen.getByText("New Site")).toBeTruthy());

    // Mock confirm to allow removal
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    // There may be multiple Remove buttons; click the last one (the newly added site)
    const removeButtons = screen.getAllByText("Remove");
    fireEvent.click(removeButtons[removeButtons.length - 1]);

    await waitFor(() => expect(screen.queryByText("New Site")).toBeNull());

    confirmSpy.mockRestore();
    toastSpy.mockRestore();
  });
});
