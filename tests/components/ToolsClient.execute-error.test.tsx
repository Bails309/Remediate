import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { ToolsClient } from "@/app/(app)/tools/tools-client";

describe("ToolsClient execute error handling", () => {
  it("shows error text when execute returns non-ok", async () => {
    (Element.prototype as any).scrollIntoView = () => { };
    const session = { user: { roles: [] } } as any;

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input instanceof URL ? input.toString() : (input as any).url);
      if (url.includes("/api/tools/list")) {
        return { ok: true, json: async () => ({ tools: [{ id: "t1", name: "Echo", inputs: [] }] }) } as Response;
      }
      if (url.includes("/api/tools/execute")) {
        return { ok: false, json: async () => ({ error: "bad" }) } as Response;
      }
      if (url.includes("/api/tools/logs")) {
        return { ok: true, json: async () => ({ logs: [] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    // @ts-expect-error mocking global fetch
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    render(<ToolsClient session={session} />);

    await waitFor(() => expect(screen.getByText("Echo")).toBeDefined());

    fireEvent.click(screen.getByText("Echo"));
    const runBtn = screen.getByRole("button", { name: /RUN AUDIT/i });
    fireEvent.click(runBtn);

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    // Expect an error displayed in the terminal area
    await waitFor(() => {
      const pre = document.querySelector("pre");
      if (!pre || !pre.textContent?.includes("bad")) throw new Error("error not shown");
      return true;
    }, { timeout: 3000 });
  });
});
