"use client";

import React, { useState, useEffect } from "react";
import { Save, HardDrive, Cloud, ShieldCheck } from "lucide-react";
import { cn } from "@/components/cn";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { toast } from "sonner";

export function StorageSettingsClient() {
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    const [provider, setProvider] = useState<"LOCAL" | "AZURE">("LOCAL");
    const [azureConnectionString, setAzureConnectionString] = useState("");
    const [azureContainerName, setAzureContainerName] = useState("uploads");
    const [localStoragePath, setLocalStoragePath] = useState("/tmp/uploads");

    useEffect(() => {
        async function fetchConfig() {
            try {
                const res = await fetch("/api/admin/storage");
                if (res.ok) {
                    const data = await res.json();
                    setProvider(data.provider);
                    setAzureConnectionString(data.azureConnectionStringMasked || "");
                    setAzureContainerName(data.azureContainerName || "uploads");
                    setLocalStoragePath(data.localStoragePath || "/tmp/uploads");
                }
            } catch (err) {
                console.error("Failed to load config", err);
            } finally {
                setLoading(false);
            }
        }
        fetchConfig();
    }, []);

    const testConnection = async () => {
        if (provider !== "AZURE") return;
        setTesting(true);
        try {
            const res = await fetch("/api/admin/storage/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    connectionString: azureConnectionString,
                    containerName: azureContainerName
                }),
            });

            const data = await res.json();
            if (res.ok) {
                toast.success(data.message);
            } else {
                toast.error(data.error + (data.details ? `: ${data.details}` : ""));
            }
        } catch {
            toast.error("Failed to test connection");
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        try {
            const res = await fetch("/api/admin/storage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider,
                    azureConnectionString,
                    azureContainerName,
                    localStoragePath
                }),
            });

            if (!res.ok) throw new Error("Failed to save configuration");

            toast.success("Storage settings saved successfully");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "An unexpected error occurred");
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return <p className="p-8 text-sm opacity-70">Loading storage configuration...</p>;
    }

    return (
        <div className="space-y-8 max-w-4xl">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Storage Settings</h1>
                <p className="text-muted-foreground mt-2">
                    Manage where uploaded scan files are stored. Switch between local disk and Azure Blob Storage.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <button
                    onClick={() => setProvider("LOCAL")}
                    className={cn(
                        "flex flex-col items-start p-6 rounded-3xl border-2 transition-all text-left",
                        provider === "LOCAL"
                            ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/5"
                            : "border-slate-200 dark:border-gray-800 hover:border-slate-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900/50"
                    )}
                >
                    <div className={cn(
                        "p-3 rounded-2xl mb-4",
                        provider === "LOCAL" ? "bg-[color:var(--color-accent)] text-white" : "bg-slate-100 dark:bg-gray-800"
                    )}>
                        <HardDrive size={24} />
                    </div>
                    <span className="font-bold text-lg mb-1">Local Filesystem</span>
                    <p className="text-sm opacity-70">Recommended for development and simple deployments.</p>
                </button>

                <button
                    onClick={() => setProvider("AZURE")}
                    className={cn(
                        "flex flex-col items-start p-6 rounded-3xl border-2 transition-all text-left",
                        provider === "AZURE"
                            ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/5"
                            : "border-slate-200 dark:border-gray-800 hover:border-slate-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900/50"
                    )}
                >
                    <div className={cn(
                        "p-3 rounded-2xl mb-4",
                        provider === "AZURE" ? "bg-[color:var(--color-accent)] text-white" : "bg-slate-100 dark:bg-gray-800"
                    )}>
                        <Cloud size={24} />
                    </div>
                    <span className="font-bold text-lg mb-1">Azure Blob Storage</span>
                    <p className="text-sm opacity-70">Enterprise grade storage for high-availability production environments.</p>
                </button>
            </div>

            <Card className="glass glass-edge rounded-3xl p-8">
                <form onSubmit={handleSave} className="space-y-8">
                    {provider === "LOCAL" ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-foreground/70 uppercase tracking-widest mb-2">
                                    Local Storage Path
                                </label>
                                <Input
                                    value={localStoragePath}
                                    onChange={(e) => setLocalStoragePath(e.target.value)}
                                    placeholder="/tmp/uploads"
                                />
                                <p className="mt-2 text-xs text-muted-foreground">
                                    The absolute path on the server where files will be saved. Ensure the application has write permissions.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-foreground/70 uppercase tracking-widest mb-2">
                                    Azure Connection String
                                </label>
                                <Input
                                    type="password"
                                    value={azureConnectionString}
                                    onChange={(e) => setAzureConnectionString(e.target.value)}
                                    placeholder="DefaultEndpointsProtocol=https;..."
                                />
                                <div className="mt-2 flex items-center gap-2 text-xs text-[color:var(--color-accent)] font-medium bg-[color:var(--color-accent)]/10 px-3 py-2 rounded-xl border border-[color:var(--color-accent)]/20">
                                    <ShieldCheck size={14} />
                                    This string will be encrypted before storage.
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-foreground/70 uppercase tracking-widest mb-2">
                                    Container Name
                                </label>
                                <Input
                                    value={azureContainerName}
                                    onChange={(e) => setAzureContainerName(e.target.value)}
                                    placeholder="uploads"
                                />
                            </div>

                            <div className="pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={testConnection}
                                    loading={testing}
                                    disabled={!azureConnectionString || azureConnectionString === "********"}
                                >
                                    Test Azure Connection
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="pt-6 border-t border-slate-200 dark:border-gray-800">
                        <Button
                            type="submit"
                            className="bg-accent hover:bg-accent/90 px-8 rounded-full h-12"
                            loading={isSaving}
                        >
                            <Save size={18} className="mr-2" />
                            Apply Storage Configuration
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
