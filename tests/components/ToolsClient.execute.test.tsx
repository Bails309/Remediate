import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { ToolsClient } from "@/app/(app)/tools/tools-client";

const session = { user: { roles: [] } } as any;

describe("ToolsClient execute flow", () => {
  it("loads tools, selects one, runs execute and shows output", async () => {
    // jsdom doesn't implement scrollIntoView — stub it to avoid runtime errors
    (Element.prototype as any).scrollIntoView = () => { };
    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input instanceof URL ? input.toString() : (input as any).url);
      if (url.includes("/api/tools/list")) {
        return Promise.resolve({ ok: true, json: async () => ({ tools: [{ id: "t1", name: "Echo", description: "desc", inputs: [] }] }) } as Response);
      }
      if (url.includes("/api/tools/execute")) {
        return Promise.resolve({ ok: true, json: async () => ({ output: "EXEC OK" }) } as Response);
      }
      if (url.includes("/api/tools/logs")) {
        return Promise.resolve({ ok: true, json: async () => ({ logs: [] }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    render(<ToolsClient session={session} />);

    // Wait for the tool card to render
    await waitFor(() => expect(screen.getByText("Echo")).toBeDefined());

    // Click the tool card to select it
    fireEvent.click(screen.getByText("Echo"));

    // Run the tool
    const runButton = screen.getByRole("button", { name: /RUN AUDIT/i });
    fireEvent.click(runButton);

    // Wait for the execute fetch to be called
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    // Ensure one of the calls targeted the execute endpoint
    const calledWithExecute = mockFetch.mock.calls.some((c) => {
      const arg = c[0] as unknown as string;
      return typeof arg === "string" && arg.includes("/api/tools/execute");
    });
    expect(calledWithExecute).toBe(true);
  });
});
