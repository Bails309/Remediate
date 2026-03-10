"use client";

import React, { useState, useEffect } from "react";
import { Save, Cloud, ShieldCheck } from "lucide-react";
import { cn } from "@/components/cn";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { toast } from "sonner";

export function StorageSettingsClient() {
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    const [provider, setProvider] = useState<"AZURE" | "REDIS">("REDIS");
    const [azureConnectionString, setAzureConnectionString] = useState("");
    const [azureAuthMethod, setAzureAuthMethod] = useState<"CONNECTION_STRING" | "ACCOUNT_KEY" | "SAS_TOKEN">("CONNECTION_STRING");
    const [azureAccountName, setAzureAccountName] = useState("");
    const [azureAccountKey, setAzureAccountKey] = useState("");
    const [azureSasToken, setAzureSasToken] = useState("");
    const [azureContainerName, setAzureContainerName] = useState("uploads");

    useEffect(() => {
        async function fetchConfig() {
            try {
                const res = await fetch("/api/admin/storage");
                if (res.ok) {
                    const data = await res.json();
                    setProvider(data.provider || "REDIS");
                    setAzureAuthMethod(data.azureAuthMethod || "CONNECTION_STRING");
                    setAzureConnectionString(data.azureConnectionStringMasked || "");
                    setAzureAccountName(data.azureAccountName || "");
                    setAzureAccountKey(data.azureAccountKeyMasked || "");
                    setAzureSasToken(data.azureSasTokenMasked || "");
                    setAzureContainerName(data.azureContainerName || "uploads");
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
                const body: any = { containerName: azureContainerName };
                if (azureAuthMethod === "CONNECTION_STRING") {
                    body.connectionString = azureConnectionString;
                } else if (azureAuthMethod === "ACCOUNT_KEY") {
                    body.azureAuthMethod = "ACCOUNT_KEY";
                    body.accountName = azureAccountName;
                    body.accountKey = azureAccountKey;
                } else if (azureAuthMethod === "SAS_TOKEN") {
                    body.azureAuthMethod = "SAS_TOKEN";
                    body.accountName = azureAccountName;
                    body.sasToken = azureSasToken;
                }

                const res = await fetch("/api/admin/storage/test", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
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
            const payload: any = {
                provider,
                azureAuthMethod,
                azureContainerName,
            };

            if (azureAuthMethod === "CONNECTION_STRING") {
                payload.azureConnectionString = azureConnectionString;
            } else if (azureAuthMethod === "ACCOUNT_KEY") {
                payload.azureAccountName = azureAccountName;
                payload.azureAccountKey = azureAccountKey;
            } else if (azureAuthMethod === "SAS_TOKEN") {
                payload.azureAccountName = azureAccountName;
                payload.azureSasToken = azureSasToken;
            }

            const res = await fetch("/api/admin/storage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
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
                    Manage where uploaded scan files are stored. Switch between Shared Redis or Azure Blob Storage.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <button
                    onClick={() => setProvider("REDIS")}
                    className={cn(
                        "flex flex-col items-start p-6 rounded-3xl border-2 transition-all text-left",
                        provider === "REDIS"
                            ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/5"
                            : "border-slate-200 dark:border-gray-800 hover:border-slate-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900/50"
                    )}
                >
                    <div className={cn(
                        "p-3 rounded-2xl mb-4",
                        provider === "REDIS" ? "bg-[color:var(--color-accent)] text-white" : "bg-slate-100 dark:bg-gray-800"
                    )}>
                        <ShieldCheck size={24} />
                    </div>
                    <span className="font-bold text-lg mb-1">Shared Redis</span>
                    <p className="text-sm opacity-70">Ideal for containerized environments to share data between App and Worker.</p>
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
                    <p className="text-sm opacity-70">Enterprise grade persistent storage for high-availability production.</p>
                </button>
            </div>

            <Card className="glass glass-edge rounded-3xl p-8">
                <form onSubmit={handleSave} className="space-y-8">
                    {provider === "REDIS" ? (
                        <div className="space-y-4">
                            <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20">
                                <p className="text-sm text-blue-500 font-medium">
                                    Shared Redis storage uses your existing Redis infrastructure to store scan files temporarily.
                                    Files are automatically cleared after 2 hours.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-foreground/70 uppercase tracking-widest mb-2">
                                    Azure Authentication Method
                                </label>
                                <div className="flex gap-2 mb-4">
                                    <button type="button" onClick={() => setAzureAuthMethod("CONNECTION_STRING")}
                                        className={cn("px-3 py-2 rounded-md border", azureAuthMethod === "CONNECTION_STRING" ? "bg-[color:var(--color-accent)] text-white" : "bg-white dark:bg-gray-900")}
                                    >Connection String</button>
                                    <button type="button" onClick={() => setAzureAuthMethod("ACCOUNT_KEY")}
                                        className={cn("px-3 py-2 rounded-md border", azureAuthMethod === "ACCOUNT_KEY" ? "bg-[color:var(--color-accent)] text-white" : "bg-white dark:bg-gray-900")}
                                    >Account Key</button>
                                    <button type="button" onClick={() => setAzureAuthMethod("SAS_TOKEN")}
                                        className={cn("px-3 py-2 rounded-md border", azureAuthMethod === "SAS_TOKEN" ? "bg-[color:var(--color-accent)] text-white" : "bg-white dark:bg-gray-900")}
                                    >SAS Token</button>
                                </div>

                                {azureAuthMethod === "CONNECTION_STRING" && (
                                    <>
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
                                    </>
                                )}

                                {azureAuthMethod === "ACCOUNT_KEY" && (
                                    <>
                                        <label className="block text-xs font-bold text-foreground/70 uppercase tracking-widest mb-2">
                                            Account Name
                                        </label>
                                        <Input value={azureAccountName} onChange={(e) => setAzureAccountName(e.target.value)} placeholder="mystorageaccount" />

                                        <label className="block text-xs font-bold text-foreground/70 uppercase tracking-widest mb-2 mt-3">
                                            Account Key
                                        </label>
                                        <Input type="password" value={azureAccountKey} onChange={(e) => setAzureAccountKey(e.target.value)} placeholder="account key" />
                                        <div className="mt-2 flex items-center gap-2 text-xs text-[color:var(--color-accent)] font-medium bg-[color:var(--color-accent)]/10 px-3 py-2 rounded-xl border border-[color:var(--color-accent)]/20">
                                            <ShieldCheck size={14} />
                                            Account key will be encrypted before storage.
                                        </div>
                                    </>
                                )}

                                {azureAuthMethod === "SAS_TOKEN" && (
                                    <>
                                        <label className="block text-xs font-bold text-foreground/70 uppercase tracking-widest mb-2">
                                            Account Name
                                        </label>
                                        <Input value={azureAccountName} onChange={(e) => setAzureAccountName(e.target.value)} placeholder="mystorageaccount" />

                                        <label className="block text-xs font-bold text-foreground/70 uppercase tracking-widest mb-2 mt-3">
                                            SAS Token
                                        </label>
                                        <Input type="password" value={azureSasToken} onChange={(e) => setAzureSasToken(e.target.value)} placeholder="?sv=...&ss=..." />
                                        <div className="mt-2 flex items-center gap-2 text-xs text-[color:var(--color-accent)] font-medium bg-[color:var(--color-accent)]/10 px-3 py-2 rounded-xl border border-[color:var(--color-accent)]/20">
                                            <ShieldCheck size={14} />
                                            SAS token will be encrypted before storage.
                                        </div>
                                    </>
                                )}

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
                                    disabled={
                                        (azureAuthMethod === "CONNECTION_STRING" && (!azureConnectionString || azureConnectionString === "********")) ||
                                        (azureAuthMethod === "ACCOUNT_KEY" && (!azureAccountName || !azureAccountKey || azureAccountKey === "********")) ||
                                        (azureAuthMethod === "SAS_TOKEN" && (!azureAccountName || !azureSasToken || azureSasToken === "********"))
                                    }
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
