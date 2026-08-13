"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { EmptyState } from "@/components/EmptyState";
import { ClientDate } from "@/components/ClientDate";
import { ScrollText } from "lucide-react";
import { toast } from "@/lib/toast";

type AuditEntry = {
  id: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue: string | null;
  newValue: string | null;
  ipAddress: string | null;
  createdAt: string;
};

const PAGE_SIZE = 50;

export function AuditLogClient() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (action.trim()) params.set("action", action.trim());
    if (entityType.trim()) params.set("entityType", entityType.trim());

    const response = await fetch(`/api/admin/audit-log?${params.toString()}`);
    if (response.status === 401 || response.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    if (!response.ok) {
      toast.error("Failed to load audit log");
      setLoading(false);
      return;
    }

    const data = await response.json();
    setLogs(data.logs ?? []);
    setTotal(data.total ?? 0);
    setForbidden(false);
    setLoading(false);
  }, [page, action, entityType]);

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(handle);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (forbidden) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Logs</h1>
          <p className="mt-2 text-lg opacity-60">Audit trail of security-relevant actions across the site.</p>
        </div>
        <EmptyState
          title="Site administrator access required"
          description="Only users with the site_admin role can read the audit log."
          icon={<ScrollText size={32} />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Logs</h1>
        <p className="mt-2 text-lg opacity-60">Audit trail of security-relevant actions across the site.</p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          void load();
        }}
        className="glass glass-edge flex flex-wrap items-center gap-3 rounded-2xl p-4"
      >
        <Input
          value={action}
          onChange={(event) => setAction(event.target.value)}
          placeholder="Filter by action, e.g. user.created"
          aria-label="Filter by action"
          className="max-w-xs"
        />
        <Input
          value={entityType}
          onChange={(event) => setEntityType(event.target.value)}
          placeholder="Entity type, e.g. User"
          aria-label="Filter by entity type"
          className="max-w-xs"
        />
        <Button type="submit">Apply</Button>
        {(action || entityType) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setAction("");
              setEntityType("");
              setPage(1);
            }}
          >
            Clear
          </Button>
        )}
        <span className="ml-auto text-sm opacity-60">{total} entries</span>
      </form>

      {loading ? (
        <p className="text-sm opacity-70">Loading audit log...</p>
      ) : logs.length === 0 ? (
        <EmptyState
          title="No audit entries"
          description="Nothing matches the current filters yet."
          icon={<ScrollText size={32} />}
        />
      ) : (
        <div className="glass glass-edge overflow-x-auto rounded-2xl">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-widest opacity-50">
              <tr>
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Entity</th>
                <th className="px-4 py-3 font-semibold">Change</th>
                <th className="px-4 py-3 font-semibold">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((entry) => (
                <tr key={entry.id} className="border-t border-white/5 align-top">
                  <td className="whitespace-nowrap px-4 py-3">
                    <ClientDate date={entry.createdAt} />
                  </td>
                  <td className="px-4 py-3">{entry.userEmail}</td>
                  <td className="px-4 py-3 font-medium">{entry.action}</td>
                  <td className="px-4 py-3">
                    <span className="opacity-80">{entry.entityType}</span>
                    {entry.entityId && (
                      <span className="block text-[10px] opacity-40">{entry.entityId}</span>
                    )}
                  </td>
                  <td className="max-w-md px-4 py-3 text-xs opacity-70">
                    {entry.oldValue || entry.newValue ? (
                      <span className="break-words">
                        {entry.oldValue ?? "—"} → {entry.newValue ?? "—"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs opacity-60">{entry.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          Previous
        </Button>
        <span className="text-sm opacity-60">
          Page {page} of {totalPages}
        </span>
        <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
