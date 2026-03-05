"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { Badge } from "@/components/Badge";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { SideSheet } from "@/components/SideSheet";

const riskToneMap: Record<string, "critical" | "high" | "medium" | "low" | "neutral"> = {
  Critical: "critical",
  High: "high",
  Medium: "medium",
  Low: "low",
  None: "neutral",
};

type Site = { id: string; name: string };

type User = { id: string; name: string };

type Vulnerability = {
  id: string;
  name: string;
  host: string;
  port: string;
  pluginId: string;
  cve?: string | null;
  risk: string;
  status: string;
  lastSeenAt: string;
  assignee?: { id: string; name: string } | null;
  synopsis?: string | null;
  description?: string | null;
  solution?: string | null;
  pluginOutput?: string | null;
};

type Props = {
  sites: Site[];
  users: User[];
};

export function VulnerabilitiesClient({ sites, users }: Props) {
  const { data: session } = useSession();
  const [data, setData] = useState<Vulnerability[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [siteId, setSiteId] = useState("");
  const [status, setStatus] = useState("");
  const [risk, setRisk] = useState("");
  const [query, setQuery] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [detail, setDetail] = useState<Vulnerability | null>(null);
  const [bulkStatus, setBulkStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  const fetchData = async () => {
    const params = new URLSearchParams();
    if (siteId) params.set("siteId", siteId);
    if (status) params.set("status", status);
    if (risk) params.set("risk", risk);
    if (query) params.set("q", query);
    if (assigneeId) params.set("assigneeId", assigneeId);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    const response = await fetch(`/api/vulnerabilities?${params.toString()}`);
    if (!response.ok) {
      toast.error("Failed to load vulnerabilities");
      return;
    }
    const payload = await response.json();
    setData(payload.items ?? []);
    setTotal(payload.total ?? 0);
  };

  useEffect(() => {
    fetchData();
  }, [siteId, status, risk, assigneeId, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [siteId, status, risk, assigneeId, query, pageSize]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const assignTo = async (assigneeId: string | null) => {
    if (selected.length === 0) return;
    const response = await fetch("/api/vulnerabilities/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selected, assigneeId }),
    });

    if (!response.ok) {
      toast.error("Bulk update failed");
      return;
    }

    toast.success("Assignments updated");
    setSelected([]);
    fetchData();
  };

  const updateStatus = async (value: string) => {
    if (selected.length === 0) return;
    const response = await fetch("/api/vulnerabilities/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selected, status: value }),
    });

    if (!response.ok) {
      toast.error("Status update failed");
      return;
    }

    toast.success("Status updated");
    setSelected([]);
    setBulkStatus("");
    fetchData();
  };

  const selectedCount = selected.length;
  const allSelected = useMemo(() => data.length > 0 && selected.length === data.length, [data, selected]);

  const toggleAll = () => {
    if (allSelected) {
      setSelected([]);
    } else {
      setSelected(data.map((item) => item.id));
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Vulnerabilities</h2>
        <p className="text-sm opacity-70">Filter, assign, and triage vulnerabilities.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1fr_2fr]">
        <Select value={siteId} onChange={(event) => setSiteId(event.target.value)}>
          <option value="">All sites</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All status</option>
          <option value="Open">Open</option>
          <option value="FalsePositive">False Positive</option>
          <option value="NoFixAvailable">No Fix</option>
          <option value="Remediated">Remediated</option>
        </Select>
        <Select value={risk} onChange={(event) => setRisk(event.target.value)}>
          <option value="">All risk</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
          <option value="None">None</option>
        </Select>
        <Select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
          <option value="">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </Select>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by host, plugin, CVE"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              fetchData();
            }
          }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm opacity-70">
          Showing {(page - 1) * pageSize + (data.length ? 1 : 0)}
          -{(page - 1) * pageSize + data.length} of {total}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))}>
            <option value="25">25 / page</option>
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
          </Select>
          <Button variant="outline" onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
            Previous
          </Button>
          <span className="text-sm opacity-70">Page {page}</span>
          <Button
            variant="outline"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={page * pageSize >= total}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => {
            if (session?.user?.id) {
              setAssigneeId((current) => (current === session.user.id ? "" : session.user.id));
            } else {
              toast.error("Missing user session");
            }
          }}
          variant="outline"
        >
          {session?.user?.id && assigneeId === session.user.id ? "All Assignments" : "My Assignments"}
        </Button>
        <Button
          onClick={() => {
            if (session?.user?.id) {
              assignTo(session.user.id);
            } else {
              toast.error("Missing user session");
            }
          }}
          variant="outline"
        >
          Assign to Me
        </Button>
        <Button onClick={() => assignTo(null)} variant="outline">
          Unassign ({selectedCount})
        </Button>
        <Select onChange={(event) => assignTo(event.target.value)} defaultValue="">
          <option value="" disabled>
            Assign to user
          </option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </Select>
        <Select
          value={bulkStatus}
          onChange={(event) => {
            const nextValue = event.target.value;
            setBulkStatus(nextValue);
            updateStatus(nextValue);
          }}
        >
          <option value="" disabled>
            Change status
          </option>
          <option value="Open">Open</option>
          <option value="FalsePositive">False Positive</option>
          <option value="NoFixAvailable">No Fix</option>
          <option value="Remediated">Remediated</option>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-[28px] border border-[color:var(--color-border)]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[color:var(--color-border)] text-xs uppercase tracking-[0.2em]">
            <tr>
              <th className="p-4">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              <th className="p-4">Issue</th>
              <th className="p-4">Host</th>
              <th className="p-4">Risk</th>
              <th className="p-4">Status</th>
              <th className="p-4">Assignee</th>
              <th className="p-4">Last Seen</th>
              <th className="p-4">Details</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td className="p-6 text-sm opacity-60" colSpan={7}>
                  No vulnerabilities match the current filters.
                </td>
              </tr>
            )}
            {data.map((item) => (
              <tr key={item.id} className="border-b border-[color:var(--color-border)] last:border-none">
                <td className="p-4">
                  <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSelect(item.id)} />
                </td>
                <td className="p-4">
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-xs opacity-60">Plugin {item.pluginId}</p>
                </td>
                <td className="p-4">
                  <p className="font-semibold">{item.host}:{item.port}</p>
                  <p className="text-xs opacity-60">{item.cve ?? "No CVE"}</p>
                </td>
                <td className="p-4">
                  <Badge tone={riskToneMap[item.risk] ?? "neutral"}>{item.risk}</Badge>
                </td>
                <td className="p-4">{item.status}</td>
                <td className="p-4">{item.assignee?.name ?? "Unassigned"}</td>
                <td className="p-4 text-xs opacity-70">{new Date(item.lastSeenAt).toLocaleString()}</td>
                <td className="p-4">
                  <Button variant="ghost" onClick={() => setDetail(item)}>
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SideSheet
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name ?? "Vulnerability"}
      >
        <div>
          <p className="text-xs uppercase tracking-[0.3em] opacity-60">Synopsis</p>
          <p className="mt-2">{detail?.synopsis ?? "No synopsis provided."}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.3em] opacity-60">Description</p>
          <p className="mt-2">{detail?.description ?? "No description available."}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.3em] opacity-60">Solution</p>
          <p className="mt-2">{detail?.solution ?? "No solution provided."}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.3em] opacity-60">Plugin Output</p>
          <p className="mt-2 whitespace-pre-wrap">{detail?.pluginOutput ?? "No plugin output."}</p>
        </div>
      </SideSheet>
    </div>
  );
}
