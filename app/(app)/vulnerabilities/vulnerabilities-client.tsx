"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { Badge } from "@/components/Badge";
import { toast } from "sonner";
import type { Session } from "next-auth";
import { SideSheet } from "@/components/SideSheet";
import { ClientDate } from "@/components/ClientDate";
import { cn } from "@/components/cn";
import { ChevronDown, ChevronRight } from "lucide-react";

const riskToneMap: Record<string, "critical" | "high" | "medium" | "low" | "neutral"> = {
  Critical: "critical",
  High: "high",
  Medium: "medium",
  Low: "low",
  None: "neutral",
};

const statusDotMap: Record<string, string> = {
  Open: "bg-red-500",
  Remediated: "bg-emerald-500",
  FalsePositive: "bg-amber-500",
  NoFixAvailable: "bg-slate-400",
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
  assigneeId?: string | null;
  synopsis?: string | null;
  description?: string | null;
  solution?: string | null;
  pluginOutput?: string | null;
  groupCount?: number;
  groupIds?: string;
  groupCves?: string;
  askForHelp: boolean;
  collaborators: { id: string; name: string }[];
};

type Props = {
  sites: Site[];
  users: User[];
};

type Comment = {
  id: string;
  content: string;
  isPrivate: boolean;
  createdAt: string;
  author: {
    name: string | null;
    email: string | null;
  };
};

export function VulnerabilitiesClient({ sites, users, session }: Props & { session?: Session | null }) {
  const [data, setData] = useState<Vulnerability[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [siteId, setSiteId] = useState("");
  const [status, setStatus] = useState("Open");
  const [risk, setRisk] = useState("");
  const [query, setQuery] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [detail, setDetail] = useState<Vulnerability | null>(null);
  const [bulkStatus, setBulkStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [foldDuplicates, setFoldDuplicates] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [subItems, setSubItems] = useState<Record<string, Vulnerability[]>>({});
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isUpdatingCollaboration, setIsUpdatingCollaboration] = useState(false);

  const roles = session?.user?.roles ?? [];
  const isWebAdmin = roles.includes("site_admin") || roles.includes("web_app_admin");
  const isAssignee = Boolean(session?.user?.id && detail?.assigneeId && session.user.id === detail.assigneeId);
  const canEditCollaboration = isWebAdmin || isAssignee;
  const fetchData = useMemo(() => async () => {
    const params = new URLSearchParams();
    if (siteId) params.set("siteId", siteId);
    if (status) params.set("status", status);
    if (risk) params.set("risk", risk);
    if (query) params.set("q", query);
    if (assigneeId) params.set("assigneeId", assigneeId);
    if (foldDuplicates) params.set("fold", "true");
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
  }, [siteId, status, risk, query, assigneeId, foldDuplicates, page, pageSize]);

  const fetchComments = async (id: string) => {
    const res = await fetch(`/api/vulnerabilities/${id}/comments`);
    if (res.ok) {
      setComments(await res.json());
    }
  };

  useEffect(() => {
    if (detail?.id) {
      fetchComments(detail.id);
    } else {
      setComments([]);
    }
  }, [detail?.id]);

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      void fetchData();
    });
    return () => cancelAnimationFrame(handle);
  }, [fetchData]);

  // Reset to first page when filters change: perform reset inline in handlers

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
    setSubItems({});
    setExpandedGroups(new Set());
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
    setSubItems({});
    setExpandedGroups(new Set());
    fetchData();
  };

  const selectedCount = selected.length;
  const allSelected = useMemo(() => data.length > 0 && selected.length === data.length, [data, selected]);

  const renderStatusBadge = (value: string) => {
    const dotClass = statusDotMap[value] ?? "bg-slate-400";
    return (
      <Badge className="inline-flex items-center gap-2 px-3 py-1 normal-case">
        <span className={cn("h-2 w-2 rounded-full", dotClass)} />
        {value}
      </Badge>
    );
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected([]);
    } else {
      setSelected(data.map((item) => item.id));
    }
  };

  const groupedData = useMemo(() => {
    return data.map(item => {
      if (foldDuplicates && item.groupCount && item.groupCount > 1) {
        return { type: 'group' as const, key: item.id, item };
      }
      return { type: 'single' as const, item };
    });
  }, [data, foldDuplicates]);

  const toggleGroup = async (group: Vulnerability) => {
    const key = group.id;
    if (expandedGroups.has(key)) {
      setExpandedGroups(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      return;
    }

    // Expanding: fetch sub-items if not already loaded
    if (!subItems[key]) {
      const gParams = new URLSearchParams();
      gParams.set("gName", group.name);
      gParams.set("gHost", group.host);
      gParams.set("gPort", group.port);
      gParams.set("gPluginId", group.pluginId);
      if (siteId) gParams.set("siteId", siteId);

      const response = await fetch(`/api/vulnerabilities?${gParams.toString()}`);
      if (response.ok) {
        const payload = await response.json();
        setSubItems(prev => ({ ...prev, [key]: payload.items }));
      }
    }

    setExpandedGroups(prev => new Set(prev).add(key));
  };

  const isGroupSelected = (group: Vulnerability) => {
    const ids = group.groupIds?.split(",") || [group.id];
    return ids.every(id => selected.includes(id));
  };

  const toggleGroupSelect = (group: Vulnerability) => {
    const ids = group.groupIds?.split(",") || [group.id];
    const allSelected = isGroupSelected(group);

    if (allSelected) {
      setSelected(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelected(prev => [...new Set([...prev, ...ids])]);
    }
  };

  const addComment = async () => {
    if (!detail || !commentText.trim()) return;
    setIsSubmittingComment(true);
    try {
      const res = await fetch(`/api/vulnerabilities/${detail.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: commentText }),
      });
      if (res.ok) {
        setCommentText("");
        await fetchComments(detail.id);
      } else {
        toast.error("Failed to add comment");
      }
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const toggleAskForHelp = async () => {
    if (!detail) return;
    setIsUpdatingCollaboration(true);
    try {
      const res = await fetch(`/api/vulnerabilities/${detail.id}`, {
        method: "PATCH",
        body: JSON.stringify({ askForHelp: !detail.askForHelp }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDetail(updated);
        // Refresh main list to update state there too
        void fetchData();
      } else {
        toast.error("Failed to update collaboration");
      }
    } finally {
      setIsUpdatingCollaboration(false);
    }
  };

  const updateCollaborators = async (userId: string, isRemoving: boolean) => {
    if (!detail) return;
    const currentIds = detail.collaborators.map(c => c.id);
    const newIds = isRemoving
      ? currentIds.filter(id => id !== userId)
      : [...currentIds, userId];

    setIsUpdatingCollaboration(true);
    try {
      const res = await fetch(`/api/vulnerabilities/${detail.id}`, {
        method: "PATCH",
        body: JSON.stringify({ collaboratorIds: newIds }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDetail(updated);
        void fetchData();
      } else {
        toast.error("Failed to update collaborators");
      }
    } finally {
      setIsUpdatingCollaboration(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Vulnerabilities</h2>
        <p className="text-sm opacity-70">Filter, assign, and triage vulnerabilities.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1fr_2fr]">
        <Select
          value={siteId}
          onChange={(v) => { setSiteId(v); setPage(1); }}
          placeholder="All sites"
          options={[
            { label: "All sites", value: "" },
            ...sites.map((site) => ({ label: site.name, value: site.id }))
          ]}
        />
        <Select
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          placeholder="All status"
          options={[
            { label: "All status", value: "" },
            { label: "Open", value: "Open" },
            { label: "False Positive", value: "FalsePositive" },
            { label: "No Fix", value: "NoFixAvailable" },
            { label: "Remediated", value: "Remediated" },
          ]}
        />
        <Select
          value={risk}
          onChange={(v) => { setRisk(v); setPage(1); }}
          placeholder="All risk"
          options={[
            { label: "All risk", value: "" },
            { label: "Critical", value: "Critical" },
            { label: "High", value: "High" },
            { label: "Medium", value: "Medium" },
            { label: "Low", value: "Low" },
          ]}
        />
        <Select
          value={assigneeId}
          onChange={(v) => { setAssigneeId(v); setPage(1); }}
          placeholder="All assignees"
          options={[
            { label: "All assignees", value: "" },
            { label: "Unassigned", value: "unassigned" },
            ...users.map((user) => ({ label: user.name, value: user.id }))
          ]}
        />
        <Input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setPage(1); }}
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
          <Select
            value={String(pageSize)}
            onChange={(val) => { setPageSize(Number(val)); setPage(1); }}
            options={[
              { label: "25 / page", value: "25" },
              { label: "50 / page", value: "50" },
              { label: "100 / page", value: "100" },
            ]}
          />
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled={page === 1} onClick={() => setPage(prev => Math.max(1, prev - 1))}>
              Previous
            </Button>
            <span className="text-sm opacity-60">Page {page}</span>
            <Button variant="ghost" disabled={page * pageSize >= total} onClick={() => setPage(prev => prev + 1)}>
              Next
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => {
            if (session?.user?.id) {
              const currentUserId = session.user.id;
              setAssigneeId((current) => (current === currentUserId ? "" : currentUserId));
            } else {
              toast.error("Missing user session");
            }
          }}
          variant="outline"
          className="text-slate-700 dark:text-gray-300"
        >
          {session?.user?.id && assigneeId === session.user.id ? "All Assignments" : "My Assignments"}
        </Button>
        <Button
          variant="outline"
          onClick={() => { setFoldDuplicates(!foldDuplicates); setPage(1); }}
          className={cn("text-slate-700 dark:text-gray-300", foldDuplicates && "bg-[color:var(--color-primary)] text-white")}
        >
          {foldDuplicates ? "Folding Active" : "Fold Duplicates"}
        </Button>
      </div>

      {selectedCount > 0 && (
        <div className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full border border-gray-200 bg-white/90 px-6 py-3 shadow-2xl backdrop-blur-md transition-all duration-300 dark:border-gray-700 dark:bg-gray-900/90">
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <span className="h-6 w-px bg-slate-200 dark:bg-gray-700" />
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
            Unassign
          </Button>
          <div className="w-52">
            <Select
              value=""
              onChange={(val) => assignTo(val)}
              placeholder="Assign to user"
              direction="up"
              options={[
                ...users.map((user) => ({ label: user.name, value: user.id }))
              ]}
            />
          </div>
          <div className="w-48">
            <Select
              value={bulkStatus}
              onChange={(val) => {
                setBulkStatus(val);
                updateStatus(val);
              }}
              placeholder="Change status"
              direction="up"
              options={[
                { label: "Open", value: "Open" },
                { label: "False Positive", value: "FalsePositive" },
                { label: "No Fix", value: "NoFixAvailable" },
                { label: "Remediated", value: "Remediated" },
              ]}
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-[28px] border border-[color:var(--color-border)]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[color:var(--color-border)] text-xs font-semibold uppercase tracking-wider text-gray-500">
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
            {groupedData.flatMap((entry) => {
              if (entry.type === 'single') {
                const { item } = entry;
                return (
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
                    <td className="p-4">{renderStatusBadge(item.status)}</td>
                    <td className="p-4">{item.assignee?.name ?? "Unassigned"}</td>
                    <td className="p-4">
                      <ClientDate date={item.lastSeenAt} className="text-xs opacity-70" />
                    </td>
                    <td className="p-4">
                      <Button variant="ghost" onClick={() => setDetail(item)}>
                        View
                      </Button>
                    </td>
                  </tr>
                );
              }

              const isExpanded = expandedGroups.has(entry.key);
              const { item: group } = entry;
              const groupMembers = subItems[entry.key] || [];

              return [
                <tr key={`group-${entry.key}`} className="bg-[color:var(--color-surface-hover)] border-b border-[color:var(--color-border)]">
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={isGroupSelected(group)}
                      onChange={() => toggleGroupSelect(group)}
                    />
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleGroup(group)} className="p-1 hover:bg-white/10 rounded transition-colors">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      <div>
                        <p className="font-semibold">{group.name}</p>
                        <p className="text-xs opacity-60">Plugin {group.pluginId} • {group.groupCount} issues</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <p className="font-semibold">{group.host}:{group.port}</p>
                    <p className="text-xs opacity-60 truncate max-w-[200px]" title={group.groupCves ?? ""}>
                      {group.groupCount} CVEs: {group.groupCves}
                    </p>
                  </td>
                  <td className="p-4">
                    <Badge tone={riskToneMap[group.risk] ?? "neutral"}>{group.risk}</Badge>
                  </td>
                  <td className="p-4">{renderStatusBadge(group.status)}</td>
                  <td className="p-4">{group.assignee?.name ?? "Unassigned"}</td>
                  <td className="p-4">
                    <ClientDate date={group.lastSeenAt} className="text-xs opacity-70" />
                  </td>
                  <td className="p-4">
                    <Button variant="ghost" onClick={() => toggleGroup(group)}>
                      {isExpanded ? "Collapse" : "Expand"}
                    </Button>
                  </td>
                </tr>,
                ...(isExpanded ? (groupMembers.length > 0 ? [
                  <tr key={`${entry.key}-expanded`}>
                    <td colSpan={8} className="p-0">
                      <div className="bg-white/95 backdrop-blur-xl border border-slate-200 shadow-inner rounded-b-lg px-8 py-6 dark:bg-gray-900/90 dark:border-gray-700/50 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        {groupMembers.map((member) => (
                          <div key={member.id} className="flex items-center justify-between border-b border-slate-100 dark:border-gray-800 last:border-none pb-4 last:pb-0">
                            <div className="flex items-center gap-6 flex-1">
                              <input
                                type="checkbox"
                                checked={selected.includes(member.id)}
                                onChange={() => toggleSelect(member.id)}
                                className="mt-1"
                              />
                              <div className="min-w-[200px]">
                                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Issue</p>
                                <p className="text-sm text-slate-900 dark:text-gray-100 font-medium">{member.name}</p>
                              </div>
                              <div className="min-w-[150px]">
                                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">CVE</p>
                                <p className="text-sm font-mono text-slate-900 dark:text-gray-100">{member.cve ?? "None"}</p>
                              </div>
                              <div className="min-w-[100px]">
                                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Risk</p>
                                <div className="mt-1 scale-90 origin-left">
                                  <Badge tone={riskToneMap[member.risk] ?? "neutral"}>{member.risk}</Badge>
                                </div>
                              </div>
                              <div className="min-w-[120px]">
                                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Status</p>
                                <div className="mt-1">{renderStatusBadge(member.status)}</div>
                              </div>
                              <div className="min-w-[120px]">
                                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Assignee</p>
                                <p className="text-sm text-slate-900 dark:text-gray-100">{member.assignee?.name ?? "Unassigned"}</p>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setDetail(member)}>
                              View Output
                            </Button>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ] : [
                  <tr key={`${entry.key}-loading`}>
                    <td colSpan={8} className="p-4 pl-12 text-xs opacity-50 italic">Loading group members...</td>
                  </tr>
                ]) : [])
              ];
            })}
          </tbody>
        </table>
      </div>

      <SideSheet
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name ?? "Vulnerability"}
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Synopsis</p>
            <p className="mt-2 text-slate-900 dark:text-gray-100">{detail?.synopsis ?? "No synopsis provided."}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Description</p>
            <p className="mt-2 text-slate-900 dark:text-gray-100 leading-relaxed">{detail?.description ?? "No description available."}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Solution</p>
            <p className="mt-2 text-slate-900 dark:text-gray-100 leading-relaxed">{detail?.solution ?? "No solution provided."}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Plugin Output</p>
            <div className="mt-2 bg-slate-50/50 dark:bg-gray-950/50 p-4 rounded-xl border border-slate-200/50 dark:border-gray-800/50 overflow-x-auto">
              <pre className="text-[11px] font-mono text-slate-900 dark:text-gray-100 leading-relaxed">{detail?.pluginOutput ?? "No plugin output."}</pre>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-[color:var(--color-border)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white italic">Collaboration</h3>
            <Button
              size="sm"
              variant={detail?.askForHelp ? "outline" : "primary"}
              onClick={() => {
                if (!canEditCollaboration) {
                  toast.error("Only the assignee or an admin can toggle collaboration");
                  return;
                }
                void toggleAskForHelp();
              }}
              disabled={isUpdatingCollaboration || !canEditCollaboration}
              title={!canEditCollaboration ? "Only the assignee or an admin can toggle collaboration" : undefined}
            >
              {detail?.askForHelp ? "Disable Help" : "Ask for Help"}
            </Button>
          </div>

          {detail?.askForHelp && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Collaborators</p>
                <div className="flex flex-wrap gap-2">
                  {users.filter(u => u.id !== detail.assigneeId).map(user => {
                    const isCollaborator = (detail?.collaborators ?? []).some(c => c.id === user.id);
                    return (
                      <Badge
                        key={user.id}
                        tone={isCollaborator ? "low" : "neutral"}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => {
                          if (!canEditCollaboration) {
                            toast.error("Only the assignee or an admin can modify collaborators");
                            return;
                          }
                          void updateCollaborators(user.id, isCollaborator);
                        }}
                        title={!canEditCollaboration ? "Only the assignee or an admin can modify collaborators" : undefined}
                      >
                        {user.name} {isCollaborator ? "✓" : "+"}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="pt-6 border-t border-slate-200 dark:border-gray-800 space-y-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white italic">Comments</h3>

          <div className="space-y-4">
            {comments.map((comment) => (
              <div key={comment.id} className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-2">
                <div className="flex justify-between items-center text-xs opacity-60">
                  <span className="font-semibold">{comment.author.name}</span>
                  <ClientDate date={comment.createdAt} />
                </div>
                <p className="text-sm">{comment.content}</p>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-sm opacity-50 italic">No comments yet.</p>
            )}
          </div>

          <div className="space-y-3 pt-2">
            <textarea
              className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none min-h-[100px]"
              placeholder="Add a private comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <div className="flex justify-end">
              <Button
                onClick={addComment}
                disabled={isSubmittingComment || !commentText.trim()}
                loading={isSubmittingComment}
              >
                Post Comment
              </Button>
            </div>
          </div>
        </div>
      </SideSheet>
    </div >
  );
}
