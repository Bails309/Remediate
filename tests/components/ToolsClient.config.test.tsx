import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { ToolsClient } from "@/app/(app)/tools/tools-client";

describe("ToolsClient config & logs", () => {
  it("loads config, saves changes (PUT) and refreshes logs", async () => {
    // stub scrollIntoView to be safe
    (Element.prototype as any).scrollIntoView = () => { };

    const session = { user: { roles: ["toolkit_admin"] } } as any;

    const configPayload = [{ id: "t1", name: "Echo" }];
    const logsPayload = { logs: [{ id: "l1", toolId: "t1", toolName: "Echo", status: "completed", startedAt: new Date().toISOString() }] };

    const mockFetch = vi.fn((input: RequestInfo | URL, opts?: RequestInit) => {
      const url = typeof input === "string" ? input : (input instanceof URL ? input.toString() : (input as any).url);
      if (url.includes("/api/tools/list")) {
        return Promise.resolve({ ok: true, json: async () => ({ tools: [] }) } as Response);
      }
      if (url.includes("/api/tools/config")) {
        // GET
        if (!opts || (opts && (opts as any).method === undefined)) {
          return Promise.resolve({ ok: true, json: async () => ({ config: configPayload }) } as Response);
        }
        // PUT
        if (opts && (opts as any).method === "PUT") {
          return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
        }
      }
      if (url.includes("/api/tools/logs")) {
        return Promise.resolve({ ok: true, json: async () => logsPayload } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    // @ts-expect-error mocking global fetch
    global.fetch = mockFetch as unknown as typeof fetch;

    render(<ToolsClient session={session} />);

    // Wait for config GET to be requested and applied
    await waitFor(() => {
      const calledConfig = mockFetch.mock.calls.some((c) => String(c[0]).includes("/api/tools/config") && (!c[1] || !(c[1] as any).method));
      if (!calledConfig) throw new Error("config GET not called yet");
      return true;
    }, { timeout: 3000 });

    // Textarea should contain the config JSON
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    await waitFor(() => expect(textarea.value).toContain('"id": "t1"'));

    // Modify config and click Commit Changes (PUT)
    const newConfig = [{ id: "t1", name: "Echo", foo: "bar" }];
    fireEvent.change(textarea, { target: { value: JSON.stringify(newConfig, null, 2) } });

    const commitBtn = screen.getByRole("button", { name: /COMMIT CHANGES/i });
    fireEvent.click(commitBtn);

    // Expect a PUT to /api/tools/config
    await waitFor(() => {
      const putCalled = mockFetch.mock.calls.some((c) => {
        const url = String(c[0]);
        const opts = c[1] as RequestInit | undefined;
        return url.includes("/api/tools/config") && opts && (opts as any).method === "PUT";
      });
      if (!putCalled) throw new Error("config PUT not called yet");
      return true;
    }, { timeout: 3000 });

    // Click Refresh logs and ensure logs endpoint is requested
    const refreshBtn = screen.getByRole("button", { name: /Refresh logs/i });
    const initialLogsCalls = mockFetch.mock.calls.filter((c) => String(c[0]).includes("/api/tools/logs")).length;
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      const laterLogsCalls = mockFetch.mock.calls.filter((c) => String(c[0]).includes("/api/tools/logs")).length;
      if (laterLogsCalls <= initialLogsCalls) throw new Error("logs not refreshed yet");
      return true;
    }, { timeout: 3000 });
  }, 10000);
});
