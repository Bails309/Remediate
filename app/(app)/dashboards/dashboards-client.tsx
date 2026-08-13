"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { EmptyState } from "@/components/EmptyState";
import { ClientDate } from "@/components/ClientDate";
import { toast } from "@/lib/toast";
import { Globe, LayoutDashboard, Lock, Plus } from "lucide-react";

type DashboardSummary = {
  id: string;
  name: string;
  description: string | null;
  visibility: "Private" | "Published";
  updatedAt: string;
  owner?: { name: string };
  _count: { widgets: number };
};

function DashboardCard({ dashboard }: { dashboard: DashboardSummary }) {
  return (
    <Link
      href={`/dashboards/${dashboard.id}`}
      className="glass glass-edge group flex flex-col gap-2 rounded-2xl p-5 transition-transform hover:scale-[1.01]"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold">{dashboard.name}</p>
        {dashboard.visibility === "Published" ? (
          <Globe className="h-4 w-4 shrink-0 text-[color:var(--color-accent)]" />
        ) : (
          <Lock className="h-4 w-4 shrink-0 opacity-40" />
        )}
      </div>
      <p className="line-clamp-2 text-xs opacity-60">{dashboard.description || "No description"}</p>
      <p className="mt-auto pt-2 text-[10px] uppercase tracking-widest opacity-40">
        {dashboard._count.widgets} widgets · {dashboard.owner ? `${dashboard.owner.name} · ` : ""}
        <ClientDate date={dashboard.updatedAt} formatOptions={{ month: "short", day: "numeric" }} />
      </p>
    </Link>
  );
}

export function DashboardsClient() {
  const router = useRouter();
  const [mine, setMine] = useState<DashboardSummary[]>([]);
  const [published, setPublished] = useState<DashboardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const handle = requestAnimationFrame(async () => {
      const response = await fetch("/api/dashboards");
      if (response.ok) {
        const data = await response.json();
        setMine(data.mine ?? []);
        setPublished(data.published ?? []);
      }
      setLoading(false);
    });
    return () => cancelAnimationFrame(handle);
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const response = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(body.error ?? "Could not create that dashboard");
        return;
      }
      router.push(`/dashboards/${body.id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="glass glass-edge flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && create()}
          placeholder="New dashboard name"
          aria-label="New dashboard name"
          className="max-w-xs"
        />
        <Button onClick={create} loading={creating} disabled={!name.trim()}>
          <Plus className="mr-2 h-4 w-4" />
          Create
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-[10px] font-bold uppercase tracking-widest opacity-40">My dashboards</h2>
        {loading ? (
          <p className="text-sm opacity-70">Loading…</p>
        ) : mine.length === 0 ? (
          <EmptyState
            title="No dashboards yet"
            description="Create one above, then add widgets from your vulnerability, threat actor and upload data."
            icon={<LayoutDashboard size={32} />}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {mine.map((dashboard) => (
              <DashboardCard key={dashboard.id} dashboard={dashboard} />
            ))}
          </div>
        )}
      </section>

      {published.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[10px] font-bold uppercase tracking-widest opacity-40">Published by others</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {published.map((dashboard) => (
              <DashboardCard key={dashboard.id} dashboard={dashboard} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
