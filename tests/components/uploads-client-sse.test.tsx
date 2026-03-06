import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { UploadsClient } from "@/app/(app)/uploads/uploads-client";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("UploadsClient SSE", () => {
  it("updates progress when EventSource emits progress events", async () => {
    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input instanceof URL ? input.toString() : input.url);
      if (url.includes("/api/uploads/nessus")) {
        return Promise.resolve({ ok: true, json: async () => ({ uploadId: "u1" }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    // Mock EventSource
    class MockEventSource {
      listeners: Record<string, (ev: MessageEvent) => void> = {};
      constructor(public url: string) {
        (global as Record<string, unknown>).__lastEventSource = this;
      }
      addEventListener(name: string, cb: (ev: MessageEvent) => void) {
        this.listeners[name] = cb;
      }
      close() { }
      emit(name: string, data: unknown) {
        const cb = this.listeners[name];
        if (cb) cb({ data: JSON.stringify(data) } as MessageEvent);
      }
    }
    (global as any).EventSource = MockEventSource as any;

    render(<UploadsClient initialSites={[{ id: "s1", name: "Site 1" }]} initialUploads={[]} />);

    const container = document.body;
    // select native select and file input
    const nativeSelect = container.querySelector("select") as HTMLSelectElement;
    expect(nativeSelect).toBeTruthy();
    fireEvent.change(nativeSelect, { target: { value: "s1" } });

    const fileInput = container.querySelector("input[type=file]") as HTMLInputElement;
    const testFile = new File(["csv"], "test.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const btn = screen.getByText("Start Upload");
    fireEvent.click(btn);

    // Wait for EventSource instance to be created
    await waitFor(() => expect((global as Record<string, any>).__lastEventSource).toBeDefined());
    const es = (global as Record<string, any>).__lastEventSource;

    // Emit a processing event
    es.emit("progress", { step: "Processing", progress: 15 });
    await waitFor(() => screen.getByText("Processing"));

    // Emit completed
    es.emit("progress", { step: "Completed", progress: 100 });
    await waitFor(() => screen.getByText("Completed"));
  });

  it("handles EventSource/network errors and shows an error toast", async () => {
    const mockFetch = vi.fn((input: any) => {
      if (typeof input === "string" && input.includes("/api/uploads/nessus")) {
        return Promise.resolve({ ok: true, json: async () => ({ uploadId: "u1" }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = mockFetch as any;

    // Spy on toast.error
    const { toast } = await import("sonner");
    const toastSpy = vi.spyOn(toast, "error").mockImplementation(() => ({} as any));

    // Mock EventSource to support onerror
    class MockEventSourceErr {
      onerror: ((ev?: any) => void) | null = null;
      constructor(public url: string) {
        (global as any).__lastEventSource = this;
      }
      addEventListener(_name: string, _cb: any) {
        // progress handled elsewhere in other test
      }
      close() { }
      emitError() {
        if (this.onerror) this.onerror();
      }
    }
    (global as any).EventSource = MockEventSourceErr as any;

    render(<UploadsClient initialSites={[{ id: "s1", name: "Site 1" }]} initialUploads={[]} />);

    const container = document.body;
    const nativeSelect = container.querySelector("select") as HTMLSelectElement;
    fireEvent.change(nativeSelect, { target: { value: "s1" } });

    const fileInput = container.querySelector("input[type=file]") as HTMLInputElement;
    const testFile = new File(["csv"], "test.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const btn = screen.getByText("Start Upload");
    fireEvent.click(btn);

    await waitFor(() => expect((global as any).__lastEventSource).toBeDefined());
    const es = (global as any).__lastEventSource as any;

    // Trigger error
    es.emitError();

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());

    toastSpy.mockRestore();
  });
});
