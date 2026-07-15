"use client";

import { useEffect, useState } from "react";
import { Save, AlertCircle, CheckCircle2, Zap, Database } from "lucide-react";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { toast } from "@/lib/toast";

type AuthMethod = "CONNECTION_STRING" | "ACCOUNT_KEY" | "SAS_TOKEN";

type Config = {
  enabled: boolean;
  authMethod: AuthMethod;
  accountName: string | null;
  containerName: string | null;
  prefix: string | null;
  defaultSiteId: string | null;
  pollIntervalMinutes: number;
  deleteAfterImport: boolean;
  connectionStringEnc: string | null;
  accountKeyEnc: string | null;
  sasTokenEnc: string | null;
  lastPollAt: string | null;
};

type Site = { id: string; name: string };

const AUTH_LABEL: Record<AuthMethod, string> = {
  CONNECTION_STRING: "Connection String",
  ACCOUNT_KEY: "Account Key",
  SAS_TOKEN: "SAS Token",
};

export function AzureBlobIngestClient({ sites }: { sites: Site[] }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [config, setConfig] = useState<Config>({
    enabled: false,
    authMethod: "CONNECTION_STRING",
    accountName: "",
    containerName: "acr-vulnerabilities",
    prefix: "",
    defaultSiteId: null,
    pollIntervalMinutes: 60,
    deleteAfterImport: true,
    connectionStringEnc: null,
    accountKeyEnc: null,
    sasTokenEnc: null,
    lastPollAt: null,
  });

  // Raw secret fields. "****" sentinel means "keep the existing encrypted value".
  const [connectionString, setConnectionString] = useState("");
  const [accountKey, setAccountKey] = useState("");
  const [sasToken, setSasToken] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/azure-blob-ingest");
        if (res.ok) {
          const data = (await res.json()) as Config;
          setConfig(data);
          setConnectionString(data.connectionStringEnc ? "****" : "");
          setAccountKey(data.accountKeyEnc ? "****" : "");
          setSasToken(data.sasTokenEnc ? "****" : "");
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/azure-blob-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...config,
          connectionString,
          accountKey,
          sasToken,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      const updated = (await res.json()) as Config;
      setConfig(updated);
      setConnectionString(updated.connectionStringEnc ? "****" : "");
      setAccountKey(updated.accountKeyEnc ? "****" : "");
      setSasToken(updated.sasTokenEnc ? "****" : "");
      setSuccess("Configuration saved");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/admin/azure-blob-ingest/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...config,
          // Send unmasked secrets only when the user actually typed a new value.
          connectionString: connectionString === "****" ? null : connectionString,
          accountKey: accountKey === "****" ? null : accountKey,
          sasToken: sasToken === "****" ? null : sasToken,
        }),
      });
      const data = await res.json();
      if (data.success) toast.success(data.message || "Connection successful");
      else toast.error(data.error || "Connection failed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  const runNow = async () => {
    setPolling(true);
    try {
      const res = await fetch("/api/admin/azure-blob-ingest/poll", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success("Poll complete");
        // Refresh lastPollAt.
        const refreshed = await fetch("/api/admin/azure-blob-ingest");
        if (refreshed.ok) {
          const updated = (await refreshed.json()) as Config;
          setConfig(updated);
        }
      } else {
        toast.error(data.error || "Poll failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPolling(false);
    }
  };

  if (loading) {
    return (
      <Card className="max-w-3xl">
        <p className="text-sm opacity-70">Loading configuration...</p>
      </Card>
    );
  }

  return (
    <Card className="max-w-3xl space-y-6">
      {error && (
        <div className="flex items-center gap-3 rounded-2xl bg-red-500/10 p-4 text-red-500">
          <AlertCircle size={20} />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 rounded-2xl bg-green-500/10 p-4 text-green-500">
          <CheckCircle2 size={20} />
          <p className="text-sm font-medium">{success}</p>
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl border border-[color:var(--color-border)] p-4">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-purple-500" />
          <div>
            <p className="font-bold">Automation</p>
            <p className="text-xs opacity-60">
              {config.enabled ? "Enabled" : "Disabled"}
              {config.lastPollAt && ` — last poll ${new Date(config.lastPollAt).toLocaleString()}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.enabled ? "bg-purple-600" : "bg-slate-300 dark:bg-slate-700"}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.enabled ? "translate-x-6" : "translate-x-1"}`}
          />
        </button>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Authentication Method</label>
        <Select
          value={config.authMethod}
          onChange={(v) => setConfig({ ...config, authMethod: v as AuthMethod })}
          options={(Object.keys(AUTH_LABEL) as AuthMethod[]).map((k) => ({ label: AUTH_LABEL[k], value: k }))}
        />
      </div>

      {config.authMethod !== "CONNECTION_STRING" && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Account Name</label>
          <Input
            value={config.accountName || ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setConfig({ ...config, accountName: e.target.value })
            }
            placeholder="e.g. acrexports"
          />
        </div>
      )}

      {config.authMethod === "CONNECTION_STRING" && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Connection String</label>
          <Input
            type="password"
            value={connectionString}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConnectionString(e.target.value)}
            placeholder="DefaultEndpointsProtocol=https;..."
          />
        </div>
      )}
      {config.authMethod === "ACCOUNT_KEY" && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Account Key</label>
          <Input
            type="password"
            value={accountKey}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAccountKey(e.target.value)}
          />
        </div>
      )}
      {config.authMethod === "SAS_TOKEN" && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest opacity-40">SAS Token</label>
          <Input
            type="password"
            value={sasToken}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSasToken(e.target.value)}
            placeholder="?sv=... or sv=..."
          />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Container Name</label>
          <Input
            value={config.containerName || ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setConfig({ ...config, containerName: e.target.value })
            }
            placeholder="acr-vulnerabilities"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Blob Prefix (optional)</label>
          <Input
            value={config.prefix || ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setConfig({ ...config, prefix: e.target.value })
            }
            placeholder="e.g. daily/"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Default Bucket for Ingested CSVs</label>
        <Select
          value={config.defaultSiteId || ""}
          onChange={(v) => setConfig({ ...config, defaultSiteId: v || null })}
          placeholder="Select bucket"
          options={sites.map((s) => ({ label: s.name, value: s.id }))}
        />
        <p className="text-xs opacity-60">All ACR CSVs found in the container land in this bucket.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Poll Interval (minutes)</label>
          <Input
            type="number"
            min={1}
            value={config.pollIntervalMinutes}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setConfig({ ...config, pollIntervalMinutes: parseInt(e.target.value) || 60 })
            }
          />
        </div>
        <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--color-border)] p-3">
          <input
            type="checkbox"
            checked={config.deleteAfterImport}
            onChange={(e) => setConfig({ ...config, deleteAfterImport: e.target.checked })}
          />
          <div>
            <p className="text-sm font-bold">Delete blob after ingest</p>
            <p className="text-xs opacity-60">Removes the CSV from the container once queued.</p>
          </div>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Button onClick={testConnection} loading={testing} className="h-11">
          <Zap size={16} className="mr-2" />
          Test
        </Button>
        <Button onClick={runNow} loading={polling} disabled={!config.enabled} className="h-11">
          <Zap size={16} className="mr-2" />
          Run Now
        </Button>
        <Button onClick={save} loading={saving} className="h-11">
          <Save size={16} className="mr-2" />
          Save
        </Button>
      </div>
    </Card>
  );
}
