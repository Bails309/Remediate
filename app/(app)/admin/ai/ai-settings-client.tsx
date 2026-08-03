"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { toast } from "@/lib/toast";

type ProviderType = "azure-openai" | "foundry" | "openai-compatible";

type FormState = {
  enabled: boolean;
  providerType: ProviderType;
  baseUrl: string;
  apiKey: string;
  model: string;
  apiVersion: string;
};

const DEFAULTS: FormState = {
  enabled: true,
  providerType: "azure-openai",
  baseUrl: "",
  apiKey: "",
  model: "",
  apiVersion: "",
};

const PROVIDER_OPTIONS = [
  { label: "Azure OpenAI", value: "azure-openai" },
  { label: "Azure AI Foundry", value: "foundry" },
  { label: "OpenAI-compatible (/v1)", value: "openai-compatible" },
];

const HINTS: Record<ProviderType, { baseUrl: string; model: string; apiVersion?: string; needsApiVersion: boolean }> = {
  "azure-openai": {
    baseUrl: "https://my-resource.openai.azure.com",
    model: "Deployment name (e.g. gpt-4o-mini)",
    apiVersion: "2024-10-21",
    needsApiVersion: true,
  },
  foundry: {
    baseUrl: "https://my-resource.services.ai.azure.com/models",
    model: "Model name (e.g. gpt-4o-mini)",
    apiVersion: "2024-05-01-preview",
    needsApiVersion: true,
  },
  "openai-compatible": {
    baseUrl: "https://api.openai.com/v1",
    model: "Model name (e.g. gpt-4o-mini)",
    needsApiVersion: false,
  },
};

export function AiSettingsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [source, setSource] = useState<"db" | "env" | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULTS);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/admin/ai");
      if (res.ok) {
        const data = await res.json();
        if (data.configured) {
          setSource(data.source ?? null);
          setForm({
            enabled: Boolean(data.enabled),
            providerType: data.providerType ?? "azure-openai",
            baseUrl: data.baseUrl ?? "",
            apiKey: data.apiKeyMasked ?? "********",
            model: data.model ?? "",
            apiVersion: data.apiVersion ?? "",
          });
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  const hint = HINTS[form.providerType];
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, apiVersion: form.apiVersion || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to save AI settings");
        return;
      }
      toast.success("AI insights settings saved");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/admin/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerType: form.providerType,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          model: form.model,
          apiVersion: form.apiVersion || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Connection test failed");
        return;
      }
      toast.success(`Connected to ${data.model}`);
    } catch {
      toast.error("Network error during connection test");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <p className="text-sm opacity-70">Loading configuration...</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">AI Insights</h2>
        <p className="text-sm opacity-70">
          Power the natural-language search on the Vulnerabilities page. The model only translates a
          question into a database filter — your vulnerability data is never sent to the provider.
        </p>
        {source === "env" && (
          <p className="mt-2 text-xs rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 w-fit">
            Currently sourced from environment variables. Saving here will store an encrypted override in the database.
          </p>
        )}
      </div>

      <div className="glass glass-edge rounded-3xl p-8 transition-all hover:shadow-md space-y-8">
        <label className="flex items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => update("enabled", e.target.checked)}
            className="h-4 w-4 rounded border-border accent-accent"
          />
          Enable AI-powered insights
        </label>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div>
            <label className="block text-xs font-bold text-foreground/70 uppercase tracking-widest mb-2">
              Provider
            </label>
            <Select
              value={form.providerType}
              onChange={(v) => update("providerType", v as ProviderType)}
              options={PROVIDER_OPTIONS}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              All providers use the OpenAI chat-completions format.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-foreground/70 uppercase tracking-widest mb-2">
              {form.providerType === "azure-openai" ? "Deployment" : "Model"}
            </label>
            <Input
              value={form.model}
              onChange={(e) => update("model", e.target.value)}
              placeholder={hint.model}
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-foreground/70 uppercase tracking-widest mb-2">
              Endpoint / Base URL
            </label>
            <Input
              value={form.baseUrl}
              onChange={(e) => update("baseUrl", e.target.value)}
              placeholder={hint.baseUrl}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Example:{" "}
              <code className="bg-foreground/5 px-2 py-0.5 rounded border border-foreground/10 text-[10px]">
                {hint.baseUrl}
              </code>
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-foreground/70 uppercase tracking-widest mb-2">
              API Key
            </label>
            <Input
              value={form.apiKey}
              onChange={(e) => update("apiKey", e.target.value)}
              placeholder="Provider API key"
              type="password"
            />
          </div>

          {hint.needsApiVersion && (
            <div>
              <label className="block text-xs font-bold text-foreground/70 uppercase tracking-widest mb-2">
                API Version
              </label>
              <Input
                value={form.apiVersion}
                onChange={(e) => update("apiVersion", e.target.value)}
                placeholder={hint.apiVersion}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-4 border-t border-foreground/5 pt-6">
          <Button onClick={save} loading={saving} title="Save AI insights configuration">
            Save Settings
          </Button>
          <Button
            variant="outline"
            onClick={testConnection}
            loading={testing}
            title="Send a tiny prompt to verify connectivity and credentials"
          >
            Test Connection
          </Button>
        </div>
      </div>
    </div>
  );
}
