import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, vi } from "vitest";

import { ToolsClient } from "@/app/(app)/tools/tools-client";

describe("ToolsClient logs click behavior", () => {
  it("clicking a log row loads its output into the terminal area", async () => {
    (Element.prototype as any).scrollIntoView = () => { };
    const session = { user: { roles: [] } } as any;

    const mockLog = { id: "l1", toolId: "t1", toolName: "Echo", status: "completed", output: "SAMPLE OUTPUT", startedAt: new Date().toISOString() };

    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input instanceof URL ? input.toString() : (input as any).url);
      if (url.includes("/api/tools/list")) {
        return Promise.resolve({ ok: true, json: async () => ({ tools: [{ id: "t1", name: "Echo", inputs: [] }] }) } as Response);
      }
      if (url.includes("/api/tools/logs")) {
        return Promise.resolve({ ok: true, json: async () => ({ logs: [mockLog] }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    // @ts-expect-error mocking global fetch
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    render(<ToolsClient session={session} />);

    // Wait for the log row to appear and click the data row (not headings/cards)
    await waitFor(() => {
      const rows = screen.getAllByRole("row");
      const target = rows.find((r) => r.textContent?.includes("Echo") && r.querySelector("td"));
      if (!target) throw new Error("log row not found");
      fireEvent.click(target);
      return true;
    });

    // Terminal pre should contain the output
    await waitFor(() => {
      const pre = document.querySelector("pre");
      if (!pre || !pre.textContent?.includes("SAMPLE OUTPUT")) throw new Error("output not loaded");
      return true;
    });
  });
});
