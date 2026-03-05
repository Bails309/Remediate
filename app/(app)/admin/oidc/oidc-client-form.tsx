"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { toast } from "sonner";

type OidcState = {
  clientId: string;
  clientSecret: string;
  issuerUrl: string;
  tenantId?: string;
};

export function OidcClientForm() {
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<OidcState>({
    clientId: "",
    clientSecret: "",
    issuerUrl: "",
    tenantId: "",
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
            tenantId: data.tenantId ?? "",
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Input
          value={form.clientId}
          onChange={(event) => updateField("clientId", event.target.value)}
          placeholder="OIDC Client ID"
        />
        <Input
          value={form.clientSecret}
          onChange={(event) => updateField("clientSecret", event.target.value)}
          placeholder="OIDC Client Secret"
          type="password"
        />
        <Input
          value={form.issuerUrl}
          onChange={(event) => updateField("issuerUrl", event.target.value)}
          placeholder="Issuer URL"
        />
        <Input
          value={form.tenantId}
          onChange={(event) => updateField("tenantId", event.target.value)}
          placeholder="Tenant ID (optional)"
        />
      </div>

      <Button onClick={save}>Save Settings</Button>
    </div>
  );
}
