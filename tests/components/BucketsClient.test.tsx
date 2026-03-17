import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { BucketsClient } from "@/app/(app)/buckets/buckets-client";
import { toast } from "@/lib/toast";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("BucketsClient", () => {
  it("creates and removes a bucket", async () => {
    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input instanceof URL ? input.toString() : input.url);
      if (url.includes("/api/buckets") && !url.includes("/api/buckets/")) {
        // POST create
        return Promise.resolve({ ok: true, json: async () => ({ id: "b-new", name: "New Bucket" }) } as Response);
      }
      if (url.includes("/api/buckets/") && url.includes("DELETE")) {
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    const toastSpy = vi.spyOn(toast, "success").mockImplementation(() => ({} as any));

    render(<BucketsClient initialBuckets={[{ id: "b1", name: "Bucket 1" }]} />);

    const input = screen.getByPlaceholderText("Create new bucket");
    fireEvent.change(input, { target: { value: "New Bucket" } });

    const btn = screen.getByText("Add Bucket");
    fireEvent.click(btn);

    await waitFor(() => expect(screen.getByText("New Bucket")).toBeTruthy());

    // Find the removal button for the newly added bucket by its aria-label
    const removeBtn = screen.getByLabelText("Remove New Bucket");
    fireEvent.click(removeBtn);

    // Wait for the modal to appear and click confirm
    const confirmDeleteBtn = await screen.findByText("Delete Permanently");
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => expect(screen.queryByText("New Bucket")).toBeNull());

    toastSpy.mockRestore();
  });
});
