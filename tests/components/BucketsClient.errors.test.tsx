import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { BucketsClient } from "@/app/(app)/buckets/buckets-client";
import { toast } from "@/lib/toast";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("BucketsClient error flows", () => {
  it("shows error when create fails", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "boom" }) } as any) as unknown as typeof fetch);

    const toastErr = vi.spyOn(toast, "error").mockImplementation(() => ({} as any));

    render(<BucketsClient initialBuckets={[]} />);

    const input = screen.getByPlaceholderText("Create new bucket");
    fireEvent.change(input, { target: { value: "Cannot Create" } });

    const btn = screen.getByText("Add Bucket");
    fireEvent.click(btn);

    await waitFor(() => expect(toastErr).toHaveBeenCalledWith("Failed to create bucket"));

    toastErr.mockRestore();
  });

  it("shows error when delete fails and keeps the bucket", async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input instanceof URL ? input.toString() : (input as any).url);
      if (url.includes("/api/buckets/") && url.includes("/api/buckets/") ) {
        // DELETE path
        return Promise.resolve({ ok: false, json: async () => ({ error: "boom" }) } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    }) as unknown as typeof fetch);

    const toastErr = vi.spyOn(toast, "error").mockImplementation(() => ({} as any));

    render(<BucketsClient initialBuckets={[{ id: "b1", name: "Bucket 1" }]} />);

    const removeBtn = screen.getByLabelText("Remove Bucket 1");
    fireEvent.click(removeBtn);

    // Click the modal confirm button
    const confirmBtn = await screen.findByText("Delete Permanently");
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(toastErr).toHaveBeenCalled());
    expect(screen.getByText("Bucket 1")).toBeTruthy();

    toastErr.mockRestore();
  });
});
