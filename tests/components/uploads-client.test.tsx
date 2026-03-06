import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { UploadsClient } from "@/app/(app)/uploads/uploads-client";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("UploadsClient", () => {
  it("starts upload and updates progress via polling", async () => {
    const mockFetch = vi.fn();
    // first call: POST /api/uploads/nessus
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ uploadId: "u1" }) } as Response);
    // second call: /api/uploads/progress returns Completed
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ progress: { step: "Completed", progress: 100 } }) } as Response);
    // third call: /api/uploads/history
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ([]) } as Response);

    global.fetch = mockFetch as unknown as typeof fetch;

    // Mock EventSource to avoid network
    global.EventSource = class {
      addEventListener() { }
      close() { }
      onerror = null;
    } as unknown as typeof EventSource;

    const { container } = render(<UploadsClient initialSites={[{ id: "s1", name: "Site 1" }]} initialUploads={[]} />);

    // select site (hidden native select used by component)
    const nativeSelect = container.querySelector("select") as HTMLSelectElement | null;
    if (!nativeSelect) throw new Error("native select not found");
    fireEvent.change(nativeSelect, { target: { value: "s1" } });

    // attach file (find native file input)
    const input = container.querySelector("input[type=file]") as HTMLInputElement | null;
    if (!input) throw new Error("file input not found");
    const file = new File(["content"], "test.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    const button = screen.getByText("Start Upload");
    fireEvent.click(button);

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    // progress UI should at least show Queued (initial queued state)
    await waitFor(() => screen.getByText("Queued"));
  });
});
