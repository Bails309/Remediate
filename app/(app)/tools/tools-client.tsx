"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import type { Session } from "next-auth";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/components/cn";
import {
  RefreshCw, Wrench, TerminalSquare, ShieldCheck,
  Info, X, ChevronRight, Search,
  Globe, Layout, Database, Lock, Activity,
  Cpu, Zap, Terminal as TerminalIcon,
  Compass, History, Target, CheckCircle2
} from "lucide-react";

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

type ToolHelp = {
  overview: string;
  commands: { command: string; description: string }[];
  ethics: string[];
};

type Tool = {
  id: string;
  name: string;
  description?: string;
  help?: ToolHelp;
  inputs: ToolInput[];
  variations?: { id: string; name: string; description: string; overrides?: Record<string, string>; duration_warning?: string }[];
};

type IconType = React.ComponentType<React.SVGProps<SVGSVGElement>>;
const TOOL_ICONS: Record<string, IconType> = {
  nmap: Globe,
  nuclei: Activity,
  ffuf: Search,
  http_head: Layout,
  subfinder: Database,
  whatweb: Cpu,
  nikto: Zap,
  wpscan: ShieldCheck,
  sqlmap: Database,
  dalfox: Lock,
  testssl: ShieldCheck,
  katana: Compass,
  gau: History,
  arjun: Target,
  curl: Globe,
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
            if (m === '31' || m === '91') currentClasses.add('text-rose-500');
            if (m === '32' || m === '92') currentClasses.add('text-emerald-500');
            if (m === '33' || m === '93') currentClasses.add('text-amber-500');
            if (m === '34' || m === '94') currentClasses.add('text-blue-500');
            if (m === '35' || m === '95') currentClasses.add('text-purple-500');
            if (m === '36' || m === '96') currentClasses.add('text-cyan-500');
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
  const [, setLoadingTools] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [configDraft, setConfigDraft] = useState<string>("");
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [runningStatus, setRunningStatus] = useState("");
  const [progressValue, setProgressValue] = useState(0);
  const [infoTool, setInfoTool] = useState<Tool | null>(null);
  const [selectedVariationId, setSelectedVariationId] = useState<string>("");
  const configRef = useRef<HTMLDivElement>(null);

  const isPentestAdmin = useMemo(() => {
    const roles = session.user?.roles || [];
    // Registry management is strictly for pentest_admin or site_admin
    return roles.includes("site_admin") || roles.includes("pentest_admin");
  }, [session.user?.roles]);

  useEffect(() => {
    const load = async () => {
      setLoadingTools(true);
      try {
        const res = await fetch("/api/tools/list");
        const payload = await res.json();
        if (!res.ok) {
          setError(payload.error || "Failed to load tools");
          return;
        }
        setTools(payload.tools || []);
      } catch {
        setError("Failed to load tools due to a network error");
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
    setSelectedVariationId("");
    setOutput("");
    setError("");
  }, [selectedToolId, tools]);

  const selectedTool = tools.find((tool) => tool.id === selectedToolId);

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
        body: JSON.stringify({
          toolId: selectedTool.id,
          inputs,
          variationId: selectedVariationId || undefined
        }),
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

  // Auto-scroll to config when tool is selected
  useEffect(() => {
    if (selectedToolId && configRef.current) {
      configRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedToolId]);

  // Tool Info Sidebar / Overlay (CyberDefend Aesthetic)
  const renderToolInfo = () => {
    if (!infoTool) return null;
    const Icon = TOOL_ICONS[infoTool.id] || Wrench;

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setInfoTool(null)}>
        <div
          className="h-full w-full max-w-xl bg-white dark:bg-slate-900/95 p-8 shadow-2xl backdrop-blur-xl border-l border-emerald-500/20 overflow-y-auto custom-scrollbar animate-in slide-in-from-right duration-500"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <Info className="h-5 w-5" /> Tool Information
            </h2>
            <button
              onClick={() => setInfoTool(null)}
              className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="space-y-8 text-left">
            <div className="flex items-start gap-6 bg-emerald-500/5 p-6 rounded-2xl border border-emerald-500/10">
              <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                <Icon className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-2xl font-bold text-slate-950 dark:text-white mb-1 uppercase tracking-tight truncate">{infoTool.name}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">{infoTool.description}</p>
              </div>
            </div>

            <button
              onClick={() => {
                setSelectedToolId(infoTool.id);
                setInfoTool(null);
              }}
              className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 group"
            >
              USE THIS TOOL <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </button>

            {infoTool.help && (
              <div className="space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
                <div className="flex items-center gap-3 text-emerald-400/80 border-b border-emerald-500/10 pb-4">
                  <ShieldCheck className="h-5 w-5" />
                  <span className="text-xs font-bold tracking-[0.2em] uppercase">Tool Instruction & Ethics</span>
                </div>

                <section>
                  <h4 className="text-[10px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-[0.2em] mb-4 opacity-70">Overview</h4>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-sm bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-200 dark:border-white/5 font-medium">
                    {infoTool.help.overview}
                  </p>
                </section>

                <section>
                  <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-4 opacity-70">Common Commands</h4>
                  <div className="overflow-hidden rounded-2xl border border-white/5 bg-slate-800/20 p-2">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-white/5 uppercase tracking-widest text-[10px] font-bold">
                          <th className="p-4 text-emerald-400/60">Command</th>
                          <th className="p-4 text-emerald-400/60 text-right">Function</th>
                        </tr>
                      </thead>
                      <tbody className="font-medium">
                        {infoTool.help.commands.map((cmd, i) => (
                          <tr key={i} className="border-t border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                            <td className="p-4 font-mono text-xs text-emerald-700 dark:text-emerald-300">{cmd.command}</td>
                            <td className="p-4 text-slate-500 dark:text-slate-400 text-xs text-right italic">{cmd.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section>
                  <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-4 opacity-70">Usage Ethics</h4>
                  <ul className="space-y-4">
                    {infoTool.help.ethics.map((item, i) => (
                      <li key={i} className="flex items-start gap-4 p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group border border-transparent hover:border-slate-200 dark:hover:border-white/5">
                        <div className="mt-1 h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] shrink-0 group-hover:scale-125 transition-transform" />
                        <span className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed font-medium">{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative min-h-[calc(100vh-120px)]">
      {/* Immersive CyberDefend Background */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.05] dark:opacity-[0.15] transition-opacity duration-1000 grayscale-[0.5] dark:grayscale-0"
        style={{
          backgroundImage: 'url("/cyberdefend-bg.png")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      <div className="relative z-10 flex flex-col gap-8 p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-500">Pentest Toolkit</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Execute Secure Tools</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Run curated scans from the isolated tools container with role-based access controls.
            </p>
          </div>
          <Button variant="outline" onClick={refreshLogs} disabled={loadingLogs} className="glass glass-edge">
            <RefreshCw className={cn("h-4 w-4 mr-2", loadingLogs && "animate-spin")} />
            Refresh logs
          </Button>
        </div>

        <div className="flex flex-col gap-10 w-full animate-in fade-in duration-700">
          <div className="flex items-center gap-4 text-xs font-bold tracking-[0.2em] text-emerald-500/60 uppercase">
            <span>Toolset</span>
            <ChevronRight className="h-3 w-3" />
            <span>Security Auditing</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {tools.map((tool: Tool) => {
              const Icon = TOOL_ICONS[tool.id] || Wrench;
              const isSelected = selectedToolId === tool.id;

              return (
                <div
                  key={tool.id}
                  className={cn(
                    "group relative glass glass-edge rounded-3xl p-6 transition-all duration-500 hover:scale-[1.02] active:scale-[0.98] cursor-pointer",
                    isSelected ? "bg-emerald-500/10 border-emerald-500/40 shadow-2xl shadow-emerald-500/10 ring-1 ring-emerald-500/20" : "hover:bg-white/5 border-white/5"
                  )}
                  onClick={() => setSelectedToolId(tool.id)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={cn(
                      "p-3 rounded-2xl border transition-colors duration-500",
                      isSelected
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 shadow-lg shadow-emerald-500/5"
                        : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 group-hover:border-emerald-500/20 group-hover:text-emerald-600 dark:group-hover:text-emerald-500/60"
                    )}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <button
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        setInfoTool(tool);
                      }}
                      className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-1 mb-6">
                    <h3 className={cn(
                      "font-bold uppercase tracking-tight transition-colors text-sm",
                      isSelected ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-300"
                    )}>
                      {tool.name}
                    </h3>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed font-medium">
                      {tool.description}
                    </p>
                  </div>

                  <button
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      setInfoTool(tool);
                    }}
                    className={cn(
                      "w-full py-2.5 rounded-xl text-[10px] font-bold tracking-widest uppercase flex items-center justify-center gap-2 transition-all border",
                      isSelected
                        ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-transparent shadow-lg shadow-emerald-500/20"
                        : "bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-emerald-500/40 hover:text-emerald-600 dark:hover:text-emerald-400"
                    )}
                  >
                    VIEW GUIDE <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {selectedTool && (
            <div ref={configRef} className="glass glass-edge rounded-[40px] p-8 mt-4 animate-in slide-in-from-bottom-8 fade-in duration-700 border-emerald-500/20 shadow-2xl shadow-emerald-500/10">
              <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                    <TerminalIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-950 dark:text-white uppercase tracking-tight">Configure {selectedTool.name}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Specify parameters and execute the secure audit.</p>
                  </div>
                </div>
                <Button
                  onClick={runTool}
                  loading={running}
                  disabled={running}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 py-6 rounded-2xl h-auto border-0 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all group"
                >
                  {running ? "EXECUTING..." : "RUN AUDIT"}
                  <Zap className="h-4 w-4 ml-2 group-hover:scale-125 transition-transform" />
                </Button>
              </div>

              {/* Variation Selector: CyberDefend Method Presets */}
              {selectedTool.variations && selectedTool.variations.length > 0 && (
                <div className="mb-10 p-6 bg-white dark:bg-black/20 rounded-[32px] border border-slate-200 dark:border-white/5 shadow-sm animate-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center gap-2 mb-4">
                    <Wrench className="h-3 w-3 text-emerald-500" />
                    <label className="text-[10px] uppercase font-black tracking-widest text-slate-500 dark:text-slate-400 leading-none">
                      Select Methodology / Speed Preset
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {selectedTool.variations.map((v: { id: string; name: string; description: string; overrides?: Record<string, string> }) => (
                      <div
                        key={v.id}
                        onClick={() => {
                          setSelectedVariationId(v.id);
                          if (v.overrides) {
                            setInputs((prev) => ({
                              ...prev,
                              ...v.overrides
                            }));
                          }
                        }}
                        className={cn(
                          "relative p-5 rounded-2xl border cursor-pointer transition-all duration-300 group/v group-hover/v:scale-[1.02]",
                          selectedVariationId === v.id
                            ? "bg-emerald-500/10 border-emerald-500/40 shadow-xl shadow-emerald-500/5 ring-1 ring-emerald-500/20"
                            : "bg-white/50 dark:bg-white/5 border-slate-200 dark:border-white/5 hover:border-emerald-500/30 hover:bg-white dark:hover:bg-white/10"
                        )}
                      >
                        <h4 className={cn(
                          "text-xs font-bold mb-1 transition-colors uppercase tracking-tight",
                          selectedVariationId === v.id ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white"
                        )}>{v.name}</h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium line-clamp-2">{v.description}</p>

                        {selectedVariationId === v.id ? (
                          <div className="absolute top-4 right-4 animate-in zoom-in duration-300">
                            <ShieldCheck className="h-4 w-4 text-emerald-500" />
                          </div>
                        ) : (
                          <div className="absolute top-4 right-4 opacity-0 group-hover/v:opacity-100 transition-opacity">
                            <ChevronRight className="h-4 w-4 text-emerald-500/40" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Duration warning banner — shown when selected variation is known to be slow */}
                  {(() => {
                    const selV = selectedTool.variations?.find((v: { id: string; duration_warning?: string }) => v.id === selectedVariationId);
                    return selV?.duration_warning ? (
                      <div className="mt-4 flex items-start gap-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 animate-in fade-in duration-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        <p className="text-[11px] font-semibold leading-relaxed">{selV.duration_warning}</p>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {selectedTool.inputs.length > 0 && (
                <div className="mt-8 pt-8 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {selectedTool.inputs.map((input: ToolInput) => {
                    const variation = selectedTool.variations?.find(v => v.id === selectedVariationId);
                    const isOverridden = !!(variation?.overrides &&
                      input.name in variation.overrides &&
                      String(inputs[input.name]).trim() === String(variation.overrides[input.name]).trim());

                    return (
                      <div key={input.name} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1 flex items-center gap-1.5">
                            {input.label}
                            {isOverridden && (
                              <span className="flex items-center gap-1 text-[9px] text-emerald-500 lowercase font-medium animate-in fade-in slide-in-from-left-1 duration-300">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                Preset Active
                              </span>
                            )}
                          </label>
                          {input.required && (
                            <span className="text-[9px] font-bold text-slate-300 dark:text-slate-600 px-1.5 py-0.5 rounded-full border border-slate-200 dark:border-white/5 uppercase tracking-tighter">Required</span>
                          )}
                        </div>
                        {input.type === 'select' || input.type === 'port_list' || input.type === 'wordlist' ? (
                          <Select
                            value={inputs[input.name] || ""}
                            onChange={(val) => setInputs((prev) => ({ ...prev, [input.name]: val }))}
                            options={input.choices || []}
                            className={cn(
                              "transition-all duration-300 rounded-2xl",
                              isOverridden ? "border-emerald-500/40 bg-emerald-500/[0.03] text-emerald-600 dark:text-emerald-400 ring-4 ring-emerald-500/10" : ""
                            )}
                          />
                        ) : (
                          <Input
                            value={inputs[input.name] || ""}
                            onChange={(event) => setInputs((prev) => ({ ...prev, [input.name]: event.target.value }))}
                            placeholder={
                              input.type === "url"
                                ? "https://target"
                                : input.type === "port_list"
                                  ? "e.g. 80,443,1-1024"
                                  : "target"
                            }
                            className={cn(
                              "bg-white/50 dark:bg-black/20 border-slate-200 dark:border-white/5 rounded-2xl h-12 focus:ring-emerald-500/20 focus:border-emerald-500/40 transition-all font-mono text-xs",
                              isOverridden ? "border-emerald-500/40 bg-emerald-500/[0.03] text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/10" : ""
                            )}
                          />
                        )}
                        {input.requireFuzz && (
                          <p className="text-[11px] text-emerald-500/60 font-medium">Include FUZZ in the URL where the wordlist should be injected.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {running && (
                <div className="mt-8 space-y-4 fade-up max-w-md mx-auto bg-emerald-500/5 p-6 rounded-3xl border border-emerald-500/10">
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden shadow-inner">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-1000 ease-in-out shadow-[0_0_12px_rgba(16,185,129,0.4)]"
                      style={{ width: `${progressValue}%` }}
                    />
                  </div>
                  <p className="text-[10px] font-black tracking-[0.3em] text-emerald-500 uppercase text-center animate-pulse">
                    {runningStatus}
                  </p>
                </div>
              )}
            </div>
          )}

          <section className="glass glass-edge rounded-[32px] p-8 w-full">
            <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500/60 mb-6">
              <TerminalSquare size={14} />
              Terminal Workspace
            </div>
            <div className="overflow-hidden rounded-3xl bg-[#0A0F1C] border border-white/5 shadow-2xl w-full">
              <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.4)]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80 shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Process Output</span>
                </div>
                <Activity className="h-4 w-4 text-emerald-500/20" />
              </div>
              <div className="min-h-[500px] w-full px-8 py-8 font-mono text-sm text-emerald-400/90 overflow-x-auto custom-scrollbar leading-relaxed">
                {running ? (
                  <div className="flex flex-col items-center justify-center min-h-[400px] text-center text-emerald-400/20 italic animate-pulse">
                    <TerminalIcon size={48} className="mb-6 opacity-5" />
                    <p className="text-xl font-bold tracking-[0.2em] opacity-10">EXECUTING COMMAND...</p>
                  </div>
                ) : error ? (
                  <pre className="whitespace-pre-wrap text-rose-400/90 font-medium leading-relaxed">
                    <TerminalText text={error} />
                  </pre>
                ) : (
                  <pre className="whitespace-pre-wrap leading-relaxed">
                    <TerminalText text={output} fallback="Terminal ready for input. Run an audit to see live results." />
                  </pre>
                )}
              </div>
            </div>
          </section>
        </div>

        <section className="glass glass-edge rounded-[32px] p-8">
          <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500/60 mb-8">
            <ShieldCheck size={14} />
            Execution log history
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/5 font-medium">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-50 dark:bg-white/5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-6 py-4">Security Tool</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Audit Timestamp</th>
                  <th className="px-6 py-4 text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12">
                      <EmptyState
                        title="No Audit Records"
                        description="Initialize an audit to capture security logs and terminal captures."
                        icon={<TerminalSquare className="h-10 w-10 text-slate-700" />}
                      />
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-white/5 cursor-pointer transition-colors group"
                      onClick={() => {
                        setOutput(log.output || "");
                        setError(log.error || "");
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors uppercase tracking-tight">{log.toolName}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-500 font-mono">{log.toolId}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest",
                          log.status === "completed" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                        )}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">{new Date(log.startedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                      <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400 font-mono text-right">{log.durationMs ? `${(log.durationMs / 1000).toFixed(2)}s` : "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {isPentestAdmin && (
          <section className="glass glass-edge rounded-[32px] p-8 border border-amber-500/10">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                  <Lock className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-600 dark:text-amber-500/60">Admin Protocol</p>
                  <h2 className="text-xl font-bold text-slate-950 dark:text-white tracking-tight uppercase">Registry Management</h2>
                </div>
              </div>
              <Button variant="outline" onClick={loadConfig} disabled={configLoading} className="glass border-white/10 hover:border-amber-500/40">
                <RefreshCw className={cn("h-4 w-4 mr-2", configLoading && "animate-spin")} />
                Reload Schema
              </Button>
            </div>
            <textarea
              value={configDraft}
              onChange={(event) => setConfigDraft(event.target.value)}
              className="h-80 w-full rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-black/40 p-6 text-xs text-slate-700 dark:text-slate-300 font-mono focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40 outline-none transition-all custom-scrollbar leading-relaxed"
              placeholder="JSON Configuration Registry..."
            />
            <div className="mt-6 flex justify-end gap-4">
              <Button
                onClick={saveConfig}
                disabled={configSaving}
                className="bg-amber-600 hover:bg-amber-500 text-black font-black px-8 py-2 rounded-xl h-auto transition-all shadow-lg shadow-amber-500/10 active:scale-95"
              >
                {configSaving ? "SYNCHRONIZING..." : "COMMIT CHANGES"}
              </Button>
            </div>
          </section>
        )}

        {renderToolInfo()}
      </div>
    </div>
  );
}
