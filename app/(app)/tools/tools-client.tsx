"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "next-auth";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { cn } from "@/components/cn";
import { RefreshCw, Wrench, TerminalSquare, ShieldCheck } from "lucide-react";

type ToolInputChoice = {
  value: string;
  label: string;
};

type ToolInput = {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  choices?: ToolInputChoice[];
  requireFuzz?: boolean;
};

type Tool = {
  id: string;
  name: string;
  description?: string;
  inputs: ToolInput[];
};

type ExecutionLog = {
  id: string;
  toolId: string;
  toolName: string;
  status: string;
  output?: string | null;
  error?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
};

export function ToolsClient({ session }: { session: Session }) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedToolId, setSelectedToolId] = useState<string>("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [output, setOutput] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loadingTools, setLoadingTools] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [configDraft, setConfigDraft] = useState<string>("");
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  const isPentestAdmin = useMemo(() => {
    const roles = session.user?.roles || [];
    return roles.includes("site_admin") || roles.includes("pentest_admin");
  }, [session.user?.roles]);

  useEffect(() => {
    const load = async () => {
      setLoadingTools(true);
      try {
        const res = await fetch("/api/tools/list");
        const payload = await res.json();
        setTools(payload.tools || []);
      } catch {
        setError("Failed to load tools");
      } finally {
        setLoadingTools(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedToolId) return;
    const tool = tools.find((item) => item.id === selectedToolId);
    if (!tool) return;
    const defaults: Record<string, string> = {};
    tool.inputs.forEach((input) => {
      defaults[input.name] = "";
    });
    setInputs(defaults);
    setOutput("");
    setError("");
  }, [selectedToolId, tools]);

  const selectedTool = tools.find((tool) => tool.id === selectedToolId);

  const toolOptions = tools.map((tool) => ({
    value: tool.id,
    label: tool.name,
  }));

  const runTool = async () => {
    if (!selectedTool) return;
    setRunning(true);
    setOutput("");
    setError("");
    try {
      const res = await fetch("/api/tools/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: selectedTool.id, inputs }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Execution failed");
      }
      setOutput(payload.output || "");
      if (payload.error) {
        setError(payload.error);
      }
      await refreshLogs();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Execution failed";
      setError(message);
    } finally {
      setRunning(false);
    }
  };

  const refreshLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/tools/logs");
      const payload = await res.json();
      setLogs(payload.logs || []);
    } finally {
      setLoadingLogs(false);
    }
  };

  const loadConfig = async () => {
    if (!isPentestAdmin) return;
    setConfigLoading(true);
    try {
      const res = await fetch("/api/tools/config");
      const payload = await res.json();
      if (res.ok) {
        setConfigDraft(JSON.stringify(payload.config || [], null, 2));
      }
    } finally {
      setConfigLoading(false);
    }
  };

  const saveConfig = async () => {
    setConfigSaving(true);
    try {
      const parsed = JSON.parse(configDraft);
      const res = await fetch("/api/tools/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to save config");
      }
      await refreshLogs();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid JSON";
      setError(message);
    } finally {
      setConfigSaving(false);
    }
  };

  useEffect(() => {
    refreshLogs();
    if (isPentestAdmin) {
      loadConfig();
    }
  }, [isPentestAdmin]);

  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[color:var(--color-accent-2)]">Pentest Toolkit</p>
          <h1 className="text-3xl font-bold tracking-tight">Execute Secure Tools</h1>
          <p className="text-sm text-[color:var(--color-foreground)] opacity-60">
            Run curated scans from the isolated tools container with role-based access controls.
          </p>
        </div>
        <Button variant="outline" onClick={refreshLogs} disabled={loadingLogs} className="glass glass-edge">
          <RefreshCw className={cn("h-4 w-4 mr-2", loadingLogs && "animate-spin")} />
          Refresh logs
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="glass glass-edge rounded-[32px] p-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] opacity-60">
            <Wrench size={14} />
            Tool selection
          </div>

          <div className="mt-6 space-y-4">
            <Select
              options={toolOptions}
              value={selectedToolId}
              onChange={setSelectedToolId}
              placeholder={loadingTools ? "Loading tools..." : "Select a tool"}
              disabled={loadingTools}
            />

            {selectedTool && (
              <div className="space-y-4">
                {selectedTool.description && (
                  <p className="text-sm opacity-70">{selectedTool.description}</p>
                )}

                {selectedTool.inputs.map((input) => (
                  <div key={input.name} className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider opacity-60">
                      {input.label}
                    </label>
                    {input.type === "wordlist" && input.choices?.length ? (
                      <Select
                        options={input.choices.map((choice) => ({ label: choice.label, value: choice.value }))}
                        value={inputs[input.name] || ""}
                        onChange={(value) => setInputs((prev) => ({ ...prev, [input.name]: value }))}
                        placeholder="Select wordlist"
                      />
                    ) : (
                      <Input
                        value={inputs[input.name] || ""}
                        onChange={(event) => setInputs((prev) => ({ ...prev, [input.name]: event.target.value }))}
                        placeholder={input.type === "url" ? "https://target" : "target"}
                      />
                    )}
                    {input.requireFuzz && (
                      <p className="text-[11px] opacity-50">Include FUZZ in the URL where the wordlist should be injected.</p>
                    )}
                  </div>
                ))}

                <Button
                  onClick={runTool}
                  disabled={running}
                  className="glass glass-edge w-full"
                >
                  {running ? "Running..." : "Run tool"}
                </Button>
              </div>
            )}
          </div>
        </section>

        <section className="glass glass-edge rounded-[32px] p-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] opacity-60">
            <TerminalSquare size={14} />
            Output
          </div>
          <div className="mt-4 rounded-2xl bg-black/80 p-4 text-xs text-emerald-200 min-h-[280px]">
            {error ? (
              <pre className="whitespace-pre-wrap text-rose-300">{error}</pre>
            ) : (
              <pre className="whitespace-pre-wrap">{output || "Output will appear here."}</pre>
            )}
          </div>
        </section>
      </div>

      <section className="glass glass-edge rounded-[32px] p-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] opacity-60">
          <ShieldCheck size={14} />
          Execution log
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-wider opacity-60">
              <tr>
                <th className="px-4 py-3">Tool</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-xs opacity-60">No executions yet.</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-white/5 cursor-pointer"
                    onClick={() => {
                      setOutput(log.output || "");
                      setError(log.error || "");
                    }}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{log.toolName}</div>
                      <div className="text-xs opacity-60">{log.toolId}</div>
                    </td>
                    <td className="px-4 py-3 uppercase text-xs">{log.status}</td>
                    <td className="px-4 py-3 text-xs opacity-70">{new Date(log.startedAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs opacity-70">{log.durationMs ? `${log.durationMs} ms` : "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isPentestAdmin && (
        <section className="glass glass-edge rounded-[32px] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-60">Tools configuration</p>
              <h2 className="text-xl font-semibold">Manage tools.json</h2>
            </div>
            <Button variant="outline" onClick={loadConfig} disabled={configLoading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", configLoading && "animate-spin")} />
              Reload
            </Button>
          </div>
          <textarea
            value={configDraft}
            onChange={(event) => setConfigDraft(event.target.value)}
            className="mt-4 h-64 w-full rounded-2xl border border-white/10 bg-black/70 p-4 text-xs text-white/80"
          />
          <div className="mt-4 flex justify-end">
            <Button onClick={saveConfig} disabled={configSaving}>
              {configSaving ? "Saving..." : "Save config"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
