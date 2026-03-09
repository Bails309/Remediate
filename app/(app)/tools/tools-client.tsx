"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "next-auth";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { EmptyState } from "@/components/EmptyState";
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

function TerminalText({ text, fallback }: { text: string; fallback?: string }) {
  if (!text) return fallback ? <span>{fallback}</span> : null;

  // 1. Handle literal hex-escapes like \x20 and string literals
  const processed = text
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return `\\x${hex}`;
      }
    })
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");

  // 2. Support ANSI escape codes (colors, bold, etc.)
  const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  const segments = processed.split(ansiRegex);
  const codes = processed.match(ansiRegex) || [];

  const rendered: React.ReactNode[] = [];
  const currentClasses = new Set<string>();

  segments.forEach((content, i) => {
    if (content) {
      rendered.push(
        <span key={i} className={Array.from(currentClasses).join(' ')}>
          {content}
        </span>
      );
    }
    if (i < codes.length) {
      const code = codes[i];
      if (code.endsWith('m')) {
        const matches = (code.match(/\d+/g) || []) as string[];
        if (matches.length === 0 || matches.includes('0')) {
          currentClasses.clear();
        } else {
          matches.forEach(m => {
            if (m === '1') currentClasses.add('font-bold');
            if (m === '31' || m === '91') currentClasses.add('text-rose-500'); // Red
            if (m === '32' || m === '92') currentClasses.add('text-emerald-500'); // Green
            if (m === '33' || m === '93') currentClasses.add('text-amber-500'); // Yellow
            if (m === '34' || m === '94') currentClasses.add('text-blue-500'); // Blue
            if (m === '35' || m === '95') currentClasses.add('text-purple-500'); // Magenta
            if (m === '36' || m === '96') currentClasses.add('text-cyan-500'); // Cyan
          });
        }
      }
    }
  });

  return <>{rendered}</>;
}

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
  const [runningStatus, setRunningStatus] = useState("");
  const [progressValue, setProgressValue] = useState(0);

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
    setProgressValue(5);
    setRunningStatus("Initializing secure environment...");

    const statusInterval = setInterval(() => {
      const messages = [
        "Probing target connectivity...",
        "Executing security scan...",
        "Routing traffic through Pentest Internal...",
        "Analyzing target responses...",
        "Fetching latest vulnerability signatures...",
        "Parsing raw terminal output...",
        "Finalizing results..."
      ];
      setRunningStatus((prev) => {
        const next = messages[Math.floor(Math.random() * messages.length)];
        return next === prev ? messages[(messages.indexOf(next) + 1) % messages.length] : next;
      });
    }, 3500);

    const progressInterval = setInterval(() => {
      setProgressValue((prev) => {
        if (prev >= 92) return prev;
        return prev + Math.random() * 8;
      });
    }, 1500);

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
      setProgressValue(100);
      setRunningStatus("Execution complete.");
      setOutput(payload.output || "");
      if (payload.error) {
        setError(payload.error);
      }
      await refreshLogs();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Execution failed";
      setError(message);
      setRunningStatus("Execution failed.");
    } finally {
      clearInterval(statusInterval);
      clearInterval(progressInterval);
      setTimeout(() => {
        setRunning(false);
        setProgressValue(0);
        setRunningStatus("");
      }, 1000);
    }
  };

  const refreshLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/tools/logs");
      const payload = await res.json();
      setLogs(payload.logs || []);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  const loadConfig = useCallback(async () => {
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
  }, [isPentestAdmin]);

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
  }, [isPentestAdmin, loadConfig, refreshLogs]);

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

      <div className="flex flex-col gap-6 w-full">
        {/* Compact Configuration Card */}
        <section className="glass glass-edge rounded-[32px] p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
            {/* Tool Selection */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold opacity-50">
                <Wrench size={12} />
                Tool selection
              </div>
              <Select
                options={toolOptions}
                value={selectedToolId}
                onChange={setSelectedToolId}
                placeholder={loadingTools ? "Loading tools..." : "Select a tool"}
                disabled={loadingTools}
              />
            </div>

            {/* Dynamic Inputs */}
            {selectedTool ? (
              <>
                {selectedTool.inputs.map((input) => (
                  <div key={input.name} className="space-y-2">
                    <label className="text-[10px] uppercase font-bold tracking-widest opacity-50">
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

                {/* Run Button (3rd Column if 1 input, otherwise wraps naturally) */}
                <div className="space-y-2">
                  <Button
                    onClick={runTool}
                    loading={running}
                    disabled={running || !selectedToolId}
                    className="w-full bg-teal-600 hover:bg-teal-500 text-white font-semibold py-2 px-4 rounded-md shadow-sm transition-colors duration-200 h-10 border-0"
                  >
                    {running ? "Running..." : "Run tool"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="md:col-span-2 flex justify-end">
                <Button
                  disabled
                  className="w-full md:w-1/3 bg-teal-600/50 text-white font-semibold py-2 px-4 rounded-md shadow-sm h-10 border-0"
                >
                  Select tool first
                </Button>
              </div>
            )}
          </div>

          {/* Inline Progress Indicator */}
          {running && (
            <div className="mt-6 space-y-2 fade-up max-w-md mx-auto">
              <div className="h-1 w-full bg-foreground/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 transition-all duration-1000 ease-in-out"
                  style={{ width: `${progressValue}%` }}
                />
              </div>
              <p className="text-[10px] uppercase font-black tracking-widest text-teal-600 text-center animate-pulse">
                {runningStatus}
              </p>
            </div>
          )}
        </section>

        {/* Expanded Output Card */}
        <section className="glass glass-edge rounded-[32px] p-6 w-full">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] opacity-60">
            <TerminalSquare size={14} />
            Terminal Workspace
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl bg-[#0A0F1C] shadow-inner w-full">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <div className="flex gap-1.5">
                <span className="h-3 w-3 rounded-full bg-rose-500/80" />
                <span className="h-3 w-3 rounded-full bg-amber-500/80" />
                <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
              </div>
              <span className="ml-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white/30">Console Output</span>
            </div>
            <div className="min-h-[500px] w-full px-6 py-6 font-mono text-sm text-teal-400 overflow-x-auto custom-scrollbar">
              {running ? (
                <div className="flex flex-col items-center justify-center min-h-[400px] text-center text-teal-400/30 italic animate-pulse">
                  <TerminalSquare size={48} className="mb-6 opacity-10" />
                  <p className="text-xl font-bold tracking-tighter opacity-20">EXECUTING COMMAND...</p>
                </div>
              ) : error ? (
                <pre className="whitespace-pre-wrap text-rose-300 font-medium leading-relaxed">
                  <TerminalText text={error} />
                </pre>
              ) : (
                <pre className="whitespace-pre-wrap leading-relaxed">
                  <TerminalText text={output} fallback="Terminal ready for input. Run a tool to see output here." />
                </pre>
              )}
            </div>
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
            <thead className="text-xs font-semibold uppercase tracking-wider text-gray-500">
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
                  <td colSpan={4} className="px-4 py-6">
                    <EmptyState
                      title="No executions yet"
                      description="Run a tool to capture its output and timing here."
                      icon={<TerminalSquare className="h-8 w-8" />}
                    />
                  </td>
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
