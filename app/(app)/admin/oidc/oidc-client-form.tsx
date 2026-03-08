"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Card } from "@/components/Card";
import { toast } from "sonner";

type OidcState = {
  clientId: string;
  clientSecret: string;
  issuerUrl: string;
};

export function OidcClientForm() {
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState<OidcState>({
    clientId: "",
    clientSecret: "",
    issuerUrl: "",
  });

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/oidc");
      if (response.ok) {
        const data = await response.json();
        if (data.configured) {
          setForm({
            clientId: data.clientId ?? "",
            clientSecret: data.clientSecretMasked ?? "********",
            issuerUrl: data.issuerUrl ?? "",
          });
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  const updateField = (field: keyof OidcState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const response = await fetch("/api/oidc/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issuerUrl: form.issuerUrl }),
      });

      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || "Connection test failed");
        return;
      }

      toast.success(`Successfully connected to ${data.issuer}`);
    } catch {
      toast.error("Network error during connection test");
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    const response = await fetch("/api/oidc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!response.ok) {
      toast.error("Failed to save OIDC config");
      return;
    }

    toast.success("OIDC settings saved");
  };

  if (loading) {
    return <p className="text-sm opacity-70">Loading configuration...</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">SSO Configuration</h2>
        <p className="text-sm opacity-70">Manage Keycloak OIDC parameters securely.</p>
        <div className="mt-2 text-xs font-mono opacity-50 bg-white/5 p-2 rounded w-fit">
          Callback URL: [your-domain]/api/auth/callback/keycloak
        </div>
      </div>

      <div className="glass glass-edge rounded-3xl p-8 transition-all hover:shadow-md">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div>
            <label className="block text-xs font-bold text-foreground/70 uppercase tracking-widest mb-2">
              Client ID
            </label>
            <Input
              value={form.clientId}
              onChange={(event) => updateField("clientId", event.target.value)}
              placeholder="e.g. remediate-app"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              The unique identifier for the Remediate application in Keycloak.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-foreground/70 uppercase tracking-widest mb-2">
              Client Secret
            </label>
            <Input
              value={form.clientSecret}
              onChange={(event) => updateField("clientSecret", event.target.value)}
              placeholder="OIDC Client Secret"
              type="password"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              The confidential secret used to authenticate with the OIDC provider.
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-foreground/70 uppercase tracking-widest mb-2">
              Issuer URL
            </label>
            <Input
              value={form.issuerUrl}
              onChange={(event) => updateField("issuerUrl", event.target.value)}
              placeholder="https://keycloak.example.com/realms/myrealm"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>Format:</strong>{" "}
              <code className="bg-foreground/5 px-2 py-0.5 rounded border border-foreground/10 text-[10px]">
                https://[domain]/realms/[realm_name]
              </code>
              <br />
              This must be the full OIDC discovery URL path for your Keycloak realm.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-4 border-t border-foreground/5 pt-6">
          <Button onClick={save} className="bg-accent hover:bg-accent/90">Save Settings</Button>
          <Button variant="outline" onClick={testConnection} loading={testing}>
            Test Connection
          </Button>
        </div>
      </div>
    </div>
  );
}
