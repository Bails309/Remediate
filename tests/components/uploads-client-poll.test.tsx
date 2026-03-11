import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, vi, beforeEach, afterEach, expect } from "vitest";

import { UploadsClient } from "@/app/(app)/uploads/uploads-client";

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  try {
    vi.useRealTimers();
  } catch { }
});

describe("UploadsClient polling + history", () => {
  it("polls progress and refreshes history on completion", async () => {
    // use real timers in this test to allow fetch and EventSource flows

    const historyPayload = [
      { id: "u2", status: "Completed", uploadDate: new Date().toISOString(), fileName: "f.csv", site: { id: "s1", name: "Site 1" } }
    ];

    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input instanceof URL ? input.toString() : (input as any).url);
      if (url.includes("/api/uploads/nessus")) {
        return Promise.resolve({ ok: true, json: async () => ({ uploadId: "u2" }) } as Response);
      }
      if (url.includes("/api/uploads/progress")) {
        return Promise.resolve({ ok: true, json: async () => ({ progress: { step: "Completed", progress: 100 } }) } as Response);
      }
      if (url.includes("/api/uploads/history")) {
        return Promise.resolve({ ok: true, json: async () => historyPayload } as Response);
      }
      if (url.includes("/api/uploads/events")) {
        return Promise.resolve({ ok: true, status: 200 } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    // @ts-expect-error
    global.fetch = mockFetch as unknown as typeof fetch;
    // Provide a minimal EventSource mock for jsdom/node
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

    // render and start upload
    render(<UploadsClient initialSites={[{ id: "s1", name: "Site 1" }]} initialUploads={[]} />);

    const nativeSelect = document.querySelector("select") as HTMLSelectElement;
    fireEvent.change(nativeSelect, { target: { value: "s1" } });

    const fileInput = document.querySelector("input[type=file]") as HTMLInputElement;
    const testFile = new File(["csv"], "test.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const btn = screen.getByText("Start Upload");
    fireEvent.click(btn);

    // wait for fetch to be called (poller/refresh should trigger history fetch)
    await waitFor(() => expect(mockFetch).toHaveBeenCalled(), { timeout: 5000 });

    // Wait for the history fetch to be called (poller runs every ~2000ms)
    await waitFor(() => {
      const calledHistory = mockFetch.mock.calls.some((c) => String(c[0]).includes("/api/uploads/history"));
      if (!calledHistory) throw new Error("history not called yet");
      return true;
    }, { timeout: 6000 });

    // Uploaded entry should be rendered (file name shown)
    await waitFor(() => expect(screen.getByText("f.csv")).toBeDefined(), { timeout: 5000 });
  }, 20000);
});
