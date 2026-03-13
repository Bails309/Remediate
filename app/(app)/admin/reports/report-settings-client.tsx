"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { Card } from "@/components/Card";
import { toast } from "@/lib/toast";

const days = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export function ReportSettingsClient() {
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    enabled: false,
    recipients: "",
    dayOfWeek: 1,
    hour: 9,
    minute: 0,
    timezone: "UTC",
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPass: "",
    smtpSecure: false,
    smtpFrom: "",
  });

  const detectTransport = (port: number, secure: boolean) => {
    if (port === 465 && secure) return "smtps";
    if (port === 587 && !secure) return "starttls";
    if (port === 25 && !secure) return "smtp";
    return "custom";
  };

  const [transport, setTransport] = useState<string>(detectTransport(587, false));

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/reports/config");
      if (response.ok) {
        const data = await response.json();
        if (data.config) {
          setForm({
            enabled: data.config.enabled,
            recipients: data.config.recipients,
            dayOfWeek: data.config.dayOfWeek,
            hour: data.config.hour,
            minute: data.config.minute,
            timezone: data.config.timezone,
            smtpHost: data.config.smtpHost,
            smtpPort: data.config.smtpPort,
            smtpUser: data.config.smtpUser ?? "",
            smtpPass: data.config.smtpPass ?? "",
            smtpSecure: data.config.smtpSecure,
            smtpFrom: data.config.smtpFrom,
          });
          setTransport(detectTransport(data.config.smtpPort, data.config.smtpSecure));
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  const updateField = (field: string, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const save = async () => {
    const response = await fetch("/api/reports/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        transport,
        smtpPort: Number(form.smtpPort),
        hour: Number(form.hour),
        minute: Number(form.minute),
        dayOfWeek: Number(form.dayOfWeek),
      }),
    });

    if (!response.ok) {
      toast.error("Failed to save report settings");
      return;
    }

    toast.success("Report settings saved");
  };

  const sendTest = async () => {
    const response = await fetch("/api/reports/test", { method: "POST" });
    if (!response.ok) {
      const data = await response.json();
      toast.error(data.error ?? "Test email failed");
      return;
    }
    toast.success("Test email sent");
  };

  if (loading) {
    return <p className="text-sm opacity-70">Loading report settings...</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Weekly Reports</h2>
        <p className="text-sm opacity-70">Configure SMTP and schedule weekly critical/high reports.</p>
      </div>

      <Card className="bg-white dark:bg-gray-800/50 border border-slate-200 dark:border-gray-700 shadow-sm rounded-xl p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Day of Week
            </label>
            <Select
              value={String(form.dayOfWeek)}
              onChange={(val) => updateField("dayOfWeek", Number(val))}
              options={days.map((day) => ({ label: String(day.label), value: String(day.value) }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Send Time (Hour / Minute)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                value={String(form.hour)}
                onChange={(event) => updateField("hour", event.target.value)}
                placeholder="Hour"
              />
              <Input
                value={String(form.minute)}
                onChange={(event) => updateField("minute", event.target.value)}
                placeholder="Minute"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Timezone
            </label>
            <Select
              value={form.timezone}
              onChange={(val) => updateField("timezone", String(val))}
              options={Intl.supportedValuesOf("timeZone").map((tz) => ({ label: tz, value: tz }))}
              title="Select your local timezone to automatically handle Daylight Saving Time adjustments."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Recipients
            </label>
            <Input
              value={form.recipients}
              onChange={(event) => updateField("recipients", event.target.value)}
              placeholder="Recipients (comma separated)"
              title="Comma-separated email addresses. Example: alice@example.com, bob@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              SMTP Host
            </label>
            <Input
              value={form.smtpHost}
              onChange={(event) => updateField("smtpHost", event.target.value)}
              placeholder="SMTP Host"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Transport
            </label>
            <Select
              value={transport}
              onChange={(val) => {
                const t = String(val);
                setTransport(t);
                if (t === "smtps") {
                  updateField("smtpPort", 465);
                  updateField("smtpSecure", true);
                } else if (t === "starttls") {
                  updateField("smtpPort", 587);
                  updateField("smtpSecure", false);
                } else if (t === "smtp") {
                  updateField("smtpPort", 25);
                  updateField("smtpSecure", false);
                }
                // custom leaves existing values
              }}
              title="Choose how the SMTP connection is secured. STARTTLS (port 587) upgrades the connection; SMTPS (port 465) uses implicit TLS. Use Custom to specify a non-standard port or mode."
              options={[
                { label: "SMTP (no TLS) — port 25", value: "smtp" },
                { label: "STARTTLS (SMTP) — port 587", value: "starttls" },
                { label: "SMTPS (implicit TLS) — port 465", value: "smtps" },
                { label: "Custom", value: "custom" },
              ]}
            />
          </div>
          {transport === "custom" && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                SMTP Port
              </label>
              <Input
                value={String(form.smtpPort)}
                onChange={(event) => updateField("smtpPort", Number(event.target.value))}
                placeholder="SMTP Port"
                title="Specify a custom SMTP port when using non-standard ports or Custom transport."
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              SMTP Username
            </label>
            <Input
              value={form.smtpUser}
              onChange={(event) => updateField("smtpUser", event.target.value)}
              placeholder="SMTP Username"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              SMTP Password
            </label>
            <Input
              value={form.smtpPass}
              onChange={(event) => updateField("smtpPass", event.target.value)}
              placeholder="SMTP Password"
              type="password"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              From Address
            </label>
            <Input
              value={form.smtpFrom}
              onChange={(event) => updateField("smtpFrom", event.target.value)}
              placeholder="From Address"
            />
          </div>
          {/* TLS behavior is derived from the Transport selection above. */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => updateField("enabled", event.target.checked)}
            />
            <span className="text-sm">Enable weekly emails</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={save} title="Save report and SMTP configuration">Save Settings</Button>
          <Button variant="outline" onClick={sendTest} title="Send a one-off test email using the current SMTP settings">
            Send Test Email
          </Button>
        </div>
      </Card>
    </div>
  );
}
