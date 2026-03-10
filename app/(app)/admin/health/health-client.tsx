"use client";

import { useEffect, useState } from "react";
import {
    Database,
    Zap,
    FileCode,
    Clock,
    Cpu,
    Terminal,
    Activity,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    Cloud
} from "lucide-react";
import { cn } from "@/components/cn";

interface HealthData {
    database: { status: string; latency: string; type: string };
    redis: { status: string; latency: string; memory: string };
    worker: { status: string };
    pentestBackend: { status: string; url: string | null };
    schema: { status: string; version: string };
    process: {
        uptime: string;
        memory: string;
        nodeVersion: string;
        environment: string;
    };
    storage: {
        provider: "REDIS" | "AZURE";
        status: string;
        details: string;
    };
    app?: { version: string };
    timestamp: string;
}

export function HealthClient() {
    const [data, setData] = useState<HealthData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [nextRefresh, setNextRefresh] = useState(60);

    const fetchHealth = async () => {
        try {
            const res = await fetch("/api/admin/health");
            if (!res.ok) {
                if (res.status === 401) {
                    setError("Unauthorized. Please sign in as an admin.");
                } else {
                    setError(`Failed to fetch health (Status: ${res.status})`);
                }
                return;
            }
            const json = await res.json();
            setData(json);
            setError(null);
            setNextRefresh(60);
        } catch (err) {
            console.error("Failed to fetch health", err);
            setError("Connection error. Is the server running?");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHealth();
        const timer = setInterval(() => {
            setNextRefresh((prev) => {
                if (prev <= 1) {
                    fetchHealth();
                    return 60;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    if (loading && !data) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <RefreshCw className="h-8 w-8 animate-spin opacity-20" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-[400px] flex-col items-center justify-center gap-4">
                <AlertCircle className="h-12 w-12 text-red-500 opacity-50" />
                <div className="text-center">
                    <h2 className="text-xl font-bold">Health Monitor Unavailable</h2>
                    <p className="text-sm opacity-60">{error}</p>
                </div>
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight">System Health</h1>
                    <p className="mt-2 text-lg opacity-60">Real-time status and diagnostics for core infrastructure.</p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-border bg-foreground/10 px-4 py-2 text-xs font-medium backdrop-blur-md">
                    <RefreshCw className={`h-3 w-3 text-accent ${nextRefresh === 60 ? 'animate-spin' : ''}`} />
                    <span className="text-foreground/70">Auto-refreshing in {nextRefresh}s</span>
                </div>
            </div>

            <div className={cn(
                "grid gap-6 md:grid-cols-2",
                data.storage.provider === "AZURE" ? "lg:grid-cols-4" : "lg:grid-cols-3"
            )}>
                {/* Database */}
                <HealthCard
                    title="Database"
                    subtitle="PostgreSQL Persistence Layer"
                    icon={<Database className="h-5 w-5 text-blue-400" />}
                    status={data.database.status}
                    metrics={[
                        { label: "Latency", value: data.database.latency },
                        { label: "Type", value: data.database.type }
                    ]}
                    glowColor="rgba(59, 130, 246, 0.1)"
                />

                <HealthCard
                    title="Redis Cache"
                    subtitle="Distributed In-memory Store"
                    icon={<Zap className="h-5 w-5 text-yellow-400" />}
                    status={data.redis.status}
                    metrics={[
                        { label: "Latency", value: data.redis.latency },
                        { label: "Memory Usage", value: data.redis.memory },
                        ...(data.storage.provider === "REDIS" ? [{ label: "Storage Integration", value: data.storage.status }] : [])
                    ]}
                    glowColor="rgba(234, 179, 8, 0.1)"
                />

                {/* Azure Blob Storage (if active) */}
                {data.storage.provider === "AZURE" && (
                    <HealthCard
                        title="Azure Blob Storage"
                        subtitle="Enterprise Persistence"
                        icon={<Cloud className="h-5 w-5 text-blue-400" />}
                        status={data.storage.status}
                        metrics={[
                            { label: "Storage Status", value: data.storage.status },
                            { label: "Details", value: data.storage.details }
                        ]}
                        glowColor="rgba(59, 130, 246, 0.1)"
                    />
                )}

                {/* Schema */}
                <HealthCard
                    title="Schema"
                    subtitle="Database Configuration"
                    icon={<FileCode className="h-5 w-5 text-emerald-400" />}
                    status={data.schema.status}
                    metrics={[
                        { label: "Status", value: "Schema is in sync" },
                        { label: "Prisma Version", value: data.schema.version }
                    ]}
                    glowColor="rgba(16, 185, 129, 0.1)"
                />
            </div>

            <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-7">
                <SmallHealthCard label="UPTIME" value={data.process.uptime} icon={<Clock className="h-4 w-4" />} />
                <SmallHealthCard label="RSS MEMORY" value={data.process.memory} icon={<Cpu className="h-4 w-4" />} />
                <SmallHealthCard label="NODE VERSION" value={data.process.nodeVersion} icon={<Terminal className="h-4 w-4" />} />
                <SmallHealthCard label="ENVIRONMENT" value={data.process.environment} icon={<Activity className="h-4 w-4" />} />
                <SmallHealthCard label="APP VERSION" value={data.app?.version ?? "unknown"} icon={<FileCode className="h-4 w-4" />} />
                <SmallHealthCard
                    label="WORKER"
                    value={data.worker?.status ?? "unknown"}
                    status={data.worker?.status}
                    icon={<Zap className="h-4 w-4" />}
                />
                <SmallHealthCard
                    label="PENTEST BACKEND"
                    value={data.pentestBackend?.status ?? "Not configured"}
                    status={data.pentestBackend?.status}
                    icon={<Terminal className="h-4 w-4" />}
                />
            </div>

            <div className="text-right text-[10px] uppercase tracking-widest text-foreground/30">
                Last Checked: {new Date(data.timestamp).toLocaleString()}
            </div>
        </div>
    );
}

interface HealthCardProps {
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    status: string;
    metrics: { label: string; value: string }[];
    glowColor: string;
}

function HealthCard({ title, subtitle, icon, status, metrics, glowColor }: HealthCardProps) {
    const isHealthy = status === "Healthy";
    return (
        <div
            className="glass glass-edge group relative overflow-hidden rounded-[32px] p-8 transition-all hover:border-accent/50"
            style={{ boxShadow: `0 0 40px -10px ${glowColor}` }}
        >
            <div className="flex items-start justify-between">
                <div className="rounded-2xl bg-foreground/5 p-3 ring-1 ring-foreground/10 group-hover:ring-foreground/20">
                    {icon}
                </div>
                <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${isHealthy ? 'bg-emerald-500/10 text-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.2)]' : 'bg-red-500/10 text-red-500 shadow-[0_0_10px_rgba(248,113,113,0.2)]'}`}>
                    {isHealthy ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                    {status}
                </div>
            </div>

            <div className="mt-6">
                <h3 className="text-xl font-bold">{title}</h3>
                <p className="text-xs opacity-50">{subtitle}</p>
            </div>

            <div className="mt-8 space-y-4 border-t border-foreground/5 pt-6">
                {metrics.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-foreground/60">{m.label}</span>
                        <span className="font-mono font-bold uppercase text-foreground">{m.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

interface SmallHealthCardProps {
    label: string;
    value: string;
    icon: React.ReactNode;
    status?: string;
}

function SmallHealthCard({ label, value, icon, status }: SmallHealthCardProps) {
    const isHealthy = status === "Healthy";
    const hasStatus = status !== undefined;

    return (
        <div className={`glass flex items-center gap-4 rounded-[20px] p-4 transition-all hover:bg-foreground/5 ${hasStatus ? (isHealthy ? 'ring-1 ring-emerald-500/20 bg-emerald-500/5' : 'ring-1 ring-red-500/20 bg-red-500/5') : ''}`}>
            <div className={`rounded-lg p-2 ${hasStatus ? (isHealthy ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500') : 'bg-foreground/10 text-foreground/70'}`}>
                {icon}
            </div>
            <div>
                <p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${hasStatus ? (isHealthy ? 'text-emerald-500/60' : 'text-red-500/60') : 'text-foreground/50'}`}>{label}</p>
                <p className="text-sm font-bold tracking-tight text-foreground">{value}</p>
            </div>
        </div>
    );
}
