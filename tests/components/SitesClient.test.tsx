import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { SitesClient } from "@/app/(app)/sites/sites-client";
import { toast } from "sonner";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("SitesClient", () => {
  it("creates and removes a site", async () => {
    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input instanceof URL ? input.toString() : input.url);
      if (url.includes("/api/sites") && !url.includes("/api/sites/")) {
        // POST create
        return Promise.resolve({ ok: true, json: async () => ({ id: "s-new", name: "New Site" }) } as Response);
      }
      if (url.includes("/api/sites/") && url.includes("DELETE")) {
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    const toastSpy = vi.spyOn(toast, "success").mockImplementation(() => ({} as any));

    render(<SitesClient initialSites={[{ id: "s1", name: "Site 1" }]} />);

    const input = screen.getByPlaceholderText("Create new bucket");
    fireEvent.change(input, { target: { value: "New Site" } });

    const btn = screen.getByText("Add Bucket");
    fireEvent.click(btn);

    await waitFor(() => expect(screen.getByText("New Site")).toBeTruthy());

    // Find the removal button for the newly added site by its aria-label
    const removeBtn = screen.getByLabelText("Remove New Site");
    fireEvent.click(removeBtn);

    // Wait for the modal to appear and click confirm
    const confirmDeleteBtn = await screen.findByText("Delete Permanently");
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => expect(screen.queryByText("New Site")).toBeNull());

    toastSpy.mockRestore();
  });
});
