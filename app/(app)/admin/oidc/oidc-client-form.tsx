"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { toast } from "sonner";

type OidcState = {
  clientId: string;
  clientSecret: string;
  issuerUrl: string;
};

export function OidcClientForm() {
  const [loading, setLoading] = useState(true);
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
            clientSecret: "",
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
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Client ID</label>
          <Input
            value={form.clientId}
            onChange={(event) => updateField("clientId", event.target.value)}
            placeholder="e.g. remediate-app"
          />
          <p className="text-xs opacity-60">The unique identifier for the Remedate application in Keycloak.</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Client Secret</label>
          <Input
            value={form.clientSecret}
            onChange={(event) => updateField("clientSecret", event.target.value)}
            placeholder="OIDC Client Secret"
            type="password"
          />
          <p className="text-xs opacity-60">The confidential secret used to authenticate with the OIDC provider.</p>
        </div>

        <div className="space-y-2 lg:col-span-2">
          <label className="text-sm font-medium">Issuer URL</label>
          <Input
            value={form.issuerUrl}
            onChange={(event) => updateField("issuerUrl", event.target.value)}
            placeholder="https://keycloak.example.com/realms/myrealm"
          />
          <p className="text-xs opacity-60">
            <strong>Format:</strong> <code className="bg-white/10 px-1 rounded">https://[domain]/realms/[realm_name]</code>.
            This must be the full OIDC discovery URL path for your Keycloak realm.
          </p>
        </div>
      </div>

      <Button onClick={save}>Save Settings</Button>
    </div>
  );
}
