import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { SitesClient } from "@/app/(app)/sites/sites-client";
import { toast } from "sonner";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("SitesClient error flows", () => {
  it("shows error when create fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "boom" }) } as any);

    const toastErr = vi.spyOn(toast, "error").mockImplementation(() => ({} as any));

    render(<SitesClient initialSites={[]} />);

    const input = screen.getByPlaceholderText("Create new bucket");
    fireEvent.change(input, { target: { value: "Cannot Create" } });

    const btn = screen.getByText("Add Bucket");
    fireEvent.click(btn);

    await waitFor(() => expect(toastErr).toHaveBeenCalledWith("Failed to create bucket"));

    toastErr.mockRestore();
  });

  it("shows error when delete fails and keeps the site", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input instanceof URL ? input.toString() : (input as any).url);
      if (url.includes("/api/sites/") && url.includes("/api/sites/") ) {
        // DELETE path
        return Promise.resolve({ ok: false, json: async () => ({ error: "boom" }) } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    }) as unknown as typeof fetch;

    const toastErr = vi.spyOn(toast, "error").mockImplementation(() => ({} as any));

    render(<SitesClient initialSites={[{ id: "s1", name: "Site 1" }]} />);

    const removeBtn = screen.getByLabelText("Remove Site 1");
    fireEvent.click(removeBtn);

    // Click the modal confirm button
    const confirmBtn = await screen.findByText("Delete Permanently");
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(toastErr).toHaveBeenCalled());
    expect(screen.getByText("Site 1")).toBeTruthy();

    toastErr.mockRestore();
  });
});
