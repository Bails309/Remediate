"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { MultiSelect } from "@/components/MultiSelect";
import { Badge } from "@/components/Badge";
import { toast } from "@/lib/toast";
import type { Session } from "next-auth";
import { SideSheet } from "@/components/SideSheet";
import { ClientDate } from "@/components/ClientDate";
import { cn } from "@/components/cn";
import { ChevronDown, ChevronRight, Globe, MessageSquare } from "lucide-react";

// Pentest issues (imported from Trustmarque PDF) all target internet-facing systems and
// carry a `PT`-prefixed pluginId. Surface them visually so operators triage them first.
const isInternetFacing = (pluginId: string | null | undefined) => /^PT/i.test(pluginId ?? "");
const InternetFacingBadge = ({ className = "" }: { className?: string }) => (
  <span
    title="Internet-facing — pentest finding (prioritise)"
    className={`inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-tight text-amber-800 ring-1 ring-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30 ${className}`}
  >
    <Globe size={10} />
    Internet-facing
  </span>
);

// Render the Examples / Plugin Output. PDF-imported findings embed `\u0001HL\u0002 … \u0001/HL\u0002`
// markers around phrases that were yellow-highlighted in the source PDF. We HTML-escape the
// whole string first, then unwrap the markers into `<mark>` so the highlights survive into
// the side sheet. Other (CSV-imported) records carry no markers and render as plain text.
function renderPluginOutput(raw: string | null | undefined): string {
  const text = raw ?? "No examples or plugin output recorded.";
  const esc = text.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
  return esc.replace(
    /\u0001HL\u0002([\s\S]*?)\u0001\/HL\u0002/g,
    '<mark class="bg-yellow-300/80 dark:bg-yellow-400/40 text-slate-900 dark:text-slate-50 rounded px-0.5">$1</mark>',
  );
}
import { InfoTooltip } from "@/components/InfoTooltip";
import { Dialog } from "@/components/Dialog";

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
  InProgress: "bg-blue-500",
  InProgressWithCR: "bg-indigo-500",
  Sunset: "bg-orange-400",
};

type Site = { id: string; name: string };

type User = { id: string; name: string };

type ViewScope = "active" | "archived";
type ArchivedPreset = "7d" | "30d" | "quarter";

function formatDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getArchivedPresetRange(preset: ArchivedPreset, now = new Date()) {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);

  if (preset === "7d") {
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    return { from: formatDateInputValue(start), to: formatDateInputValue(end) };
  }

  if (preset === "30d") {
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 29);
    return { from: formatDateInputValue(start), to: formatDateInputValue(end) };
  }

  const quarter = Math.floor(end.getUTCMonth() / 3);
  const start = new Date(Date.UTC(end.getUTCFullYear(), quarter * 3, 1));
  return { from: formatDateInputValue(start), to: formatDateInputValue(end) };
}

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
  group?: { id: string; name: string } | null;
  groupId?: string | null;
  synopsis?: string | null;
  description?: string | null;
  solution?: string | null;
  pluginOutput?: string | null;
  seeAlso?: string | null;
  groupCount?: number;
  groupIds?: string;
  groupCves?: string;
  askForHelp: boolean;
  collaborators: { id: string; name: string }[];
  archivedAt?: string | null;
  crNumber?: string | null;
  commentCount?: number;
  recordScope?: ViewScope;
};

type Props = {
  sites: Site[];
  users: User[];
  groups?: GroupInfo[];
};

type GroupInfo = {
  id: string;
  name: string;
  viewerRole: "member" | "leader" | null;
};

type Comment = {
  id: string;
  content: string;
  isPrivate: boolean;
  createdAt: string;
  authorId: string;
  author: {
    name: string | null;
    email: string | null;
  };
};

type SelectedAssignmentMeta = {
  assigneeId: string | null;
  assigneeName: string | null;
  name: string;
};

type PendingAssignment = {
  assigneeId: string | null;
  assigneeName: string;
  conflicts: Array<{
    id: string;
    name: string;
    currentAssigneeName: string;
  }>;
};

type PendingDetailAssignment = {
  assigneeId: string | null;
  assigneeName: string;
  currentAssigneeName: string;
};

export function VulnerabilitiesClient({ sites, users, groups = [], session }: Props & { session?: Session | null }) {
  const [data, setData] = useState<Vulnerability[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedMeta, setSelectedMeta] = useState<Record<string, SelectedAssignmentMeta>>({});
  const [viewScope, setViewScope] = useState<ViewScope>("active");
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [risk, setRisk] = useState("");
  const [archivedFrom, setArchivedFrom] = useState("");
  const [archivedTo, setArchivedTo] = useState("");
  const [query, setQuery] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [groupFilterIds, setGroupFilterIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<Vulnerability | null>(null);
  const [idFilter, setIdFilter] = useState("");
  const [autoOpenTarget, setAutoOpenTarget] = useState<string | null>(null);
  
  const searchParams = useSearchParams();
  const router = useRouter();
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
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [isUpdatingCollaboration, setIsUpdatingCollaboration] = useState(false);
  const [pendingAssignment, setPendingAssignment] = useState<PendingAssignment | null>(null);
  const [pendingDetailAssignment, setPendingDetailAssignment] = useState<PendingDetailAssignment | null>(null);
  const [bulkCrDialogOpen, setBulkCrDialogOpen] = useState(false);
  const [bulkCrValue, setBulkCrValue] = useState("");

  const roles = session?.user?.roles ?? [];
  const isArchivedView = viewScope === "archived";
  const isWebAdmin = roles.includes("site_admin") || roles.includes("web_app_admin");
  const leaderGroupIds = useMemo(() => new Set(groups.filter((g) => g.viewerRole === "leader").map((g) => g.id)), [groups]);
  const memberGroupIds = useMemo(() => new Set(groups.filter((g) => g.viewerRole !== null).map((g) => g.id)), [groups]);
  const isAssignee = Boolean(session?.user?.id && detail?.assigneeId && session.user.id === detail.assigneeId);
  const isLeaderOfDetail = Boolean(detail?.groupId && leaderGroupIds.has(detail.groupId));
  const isMemberOfDetail = Boolean(detail?.groupId && memberGroupIds.has(detail.groupId));
  const canSelfAssignDetail = isWebAdmin || !detail?.groupId || isMemberOfDetail;
  const canEditDetail = isWebAdmin || isAssignee || isLeaderOfDetail;
  const canChangeGroupDetail = isWebAdmin;
  const isCollaborator = Boolean(session?.user?.id && detail?.askForHelp && (detail?.collaborators ?? []).some(c => c.id === session.user!.id));
  const canEditCollaboration = canEditDetail;
  const canComment = isWebAdmin || isAssignee || isLeaderOfDetail || isCollaborator || (detail?.askForHelp && isMemberOfDetail);
  const fetchData = useMemo(() => async () => {
    const params = new URLSearchParams();
    params.set("scope", viewScope);
    if (siteIds.length === 1) params.set("siteId", siteIds[0]);
    else if (siteIds.length > 1) params.set("siteIds", siteIds.join(","));
    if (status) params.set("status", status);
    if (risk) params.set("risk", risk);
    if (isArchivedView && archivedFrom) params.set("archivedFrom", archivedFrom);
    if (isArchivedView && archivedTo) params.set("archivedTo", archivedTo);
    if (query) params.set("q", query);
    if (assigneeId) params.set("assigneeId", assigneeId);
    if (groupFilterIds.length > 0) params.set("groupIds", groupFilterIds.join(","));
    if (idFilter) params.set("id", idFilter);
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
  }, [viewScope, siteIds, status, risk, archivedFrom, archivedTo, query, assigneeId, groupFilterIds, idFilter, foldDuplicates, page, pageSize, isArchivedView]);

  const fetchComments = async (id: string) => {
    const res = await fetch(`/api/vulnerabilities/${id}/comments`);
    if (res.ok) {
      setComments(await res.json());
    }
  };

  useEffect(() => {
    if (detail?.id && detail.recordScope !== "archived") {
      fetchComments(detail.id);
    } else {
      setComments([]);
    }
  }, [detail?.id, detail?.recordScope]);

  useEffect(() => {
    setPendingDetailAssignment(null);
  }, [detail?.id]);

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      setIdFilter(id);
      setAutoOpenTarget(id);
    }
  }, [searchParams]);

  useEffect(() => {
    // If we have data and an autoOpenTarget filter match, auto-open the detail ONCE
    if (autoOpenTarget && data.length === 1 && data[0].id === autoOpenTarget) {
      setDetail(data[0]);
      setAutoOpenTarget(null); // Clear target to prevent infinite reopening
    }
  }, [data, autoOpenTarget]);

  useEffect(() => {
    // Call immediately; avoid requestAnimationFrame scheduling so tests with fake timers
    // behave deterministically and don't hang waiting for RAF to run.
    void fetchData();
    return;
  }, [fetchData]);

  // Reset to first page when filters change: perform reset inline in handlers

  const rememberSelectedItems = (items: Vulnerability[], ids?: string[]) => {
    setSelectedMeta((prev) => {
      const next = { ...prev };
      for (const item of items) {
        const targetIds = ids ?? (item.groupIds?.split(",") || [item.id]);
        for (const targetId of targetIds) {
          next[targetId] = {
            assigneeId: item.assignee?.id ?? item.assigneeId ?? null,
            assigneeName: item.assignee?.name ?? null,
            name: item.name,
          };
        }
      }
      return next;
    });
  };

  const forgetSelectedItems = (ids: string[]) => {
    setSelectedMeta((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        delete next[id];
      }
      return next;
    });
  };

  const toggleSelect = (item: Vulnerability) => {
    const id = item.id;
    setPendingAssignment(null);

    if (selected.includes(id)) {
      forgetSelectedItems([id]);
      setSelected((prev) => prev.filter((itemId) => itemId !== id));
      return;
    }

    rememberSelectedItems([item], [id]);
    setSelected((prev) => [...prev, id]);
  };

  const commitAssignment = async (assigneeId: string | null) => {
    if (selected.length === 0) return;
    const response = await fetch("/api/vulnerabilities/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selected, assigneeId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      toast.error(errorData.error || "Failed to update assignee");
      return;
    }

    toast.success("Assignments updated");
    setPendingAssignment(null);
    forgetSelectedItems(selected);
    setSelected([]);
    setSubItems({});
    setExpandedGroups(new Set());
    fetchData();
  };

  const startAssignment = (nextAssigneeId: string | null) => {
    if (selected.length === 0) return;

    const conflicts = selected
      .map((id) => ({ id, meta: selectedMeta[id] }))
      .filter(
        (entry): entry is { id: string; meta: SelectedAssignmentMeta } =>
          Boolean(entry.meta && entry.meta.assigneeId && entry.meta.assigneeId !== nextAssigneeId)
      )
      .map((entry) => ({
        id: entry.id,
        name: entry.meta.name,
        currentAssigneeName: entry.meta.assigneeName ?? "Another assignee",
      }));

    if (nextAssigneeId && conflicts.length > 0) {
      const nextAssigneeName = users.find((user) => user.id === nextAssigneeId)?.name ?? "the selected assignee";
      setPendingAssignment({
        assigneeId: nextAssigneeId,
        assigneeName: nextAssigneeName,
        conflicts,
      });
      return;
    }

    void commitAssignment(nextAssigneeId);
  };

  const commitGroupAssignment = async (groupId: string | null | "none") => {
    if (selected.length === 0) return;
    const normalized = groupId === "none" || groupId === "" ? null : groupId;
    const response = await fetch("/api/vulnerabilities/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selected, groupId: normalized }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      toast.error(errorData.error || "Failed to update group");
      return;
    }
    toast.success("Group updated");
    setSelected([]);
    setSubItems({});
    setExpandedGroups(new Set());
    fetchData();
  };

  const commitBulkStatus = async (value: string, crNumber?: string) => {
    const response = await fetch("/api/vulnerabilities/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selected, status: value, crNumber }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      toast.error(errorData.error || "Status update failed");
      return;
    }

    toast.success("Status updated");
    setSelected([]);
    setBulkStatus("");
    setSubItems({});
    setExpandedGroups(new Set());
    setBulkCrDialogOpen(false);
    setBulkCrValue("");
    fetchData();
  };

  const updateStatus = async (value: string) => {
    if (selected.length === 0) return;

    if (value === "InProgressWithCR") {
      setBulkCrDialogOpen(true);
      return;
    }

    void commitBulkStatus(value);
  };

  const selectedCount = selected.length;
  const allSelected = useMemo(() => {
    if (data.length === 0) return false;
    return data.every(item => {
      const ids = item.groupIds?.split(",") || [item.id];
      return ids.every(id => selected.includes(id));
    });
  }, [data, selected]);

  const renderStatusBadge = (value: string) => {
    const dotClass = statusDotMap[value] ?? "bg-slate-400";
    return (
      <Badge className="inline-flex items-center gap-2 px-3 py-1 font-bold normal-case bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-white/10">
        <span className={cn("h-2 w-2 rounded-full", dotClass, "shadow-[0_0_8px_currentColor]")} />
        {value}
      </Badge>
    );
  };

  const toggleAll = () => {
    const currentPageIds = data.flatMap(item => item.groupIds?.split(",") || [item.id]);
    if (allSelected) {
      // Deselect all items shown on the current page
      setPendingAssignment(null);
      forgetSelectedItems(currentPageIds);
      setSelected(prev => prev.filter(id => !currentPageIds.includes(id)));
    } else {
      // Select all items shown on the current page
      rememberSelectedItems(data);
      setSelected(prev => [...new Set([...prev, ...currentPageIds])]);
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
      gParams.set("scope", viewScope);
      if (siteIds.length === 1) gParams.set("siteId", siteIds[0]);
      else if (siteIds.length > 1) gParams.set("siteIds", siteIds.join(","));
      if (isArchivedView && archivedFrom) gParams.set("archivedFrom", archivedFrom);
      if (isArchivedView && archivedTo) gParams.set("archivedTo", archivedTo);

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
      setPendingAssignment(null);
      forgetSelectedItems(ids);
      setSelected(prev => prev.filter(id => !ids.includes(id)));
    } else {
      rememberSelectedItems([group], ids);
      setSelected(prev => [...new Set([...prev, ...ids])]);
    }
  };

  const conflictingAssigneeNames = pendingAssignment
    ? Array.from(new Set(pendingAssignment.conflicts.map((conflict) => conflict.currentAssigneeName))).slice(0, 3)
    : [];

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

  const editComment = async (commentId: string) => {
    if (!detail || !editingCommentText.trim()) return;
    try {
      const res = await fetch(`/api/vulnerabilities/${detail.id}/comments`, {
        method: "PATCH",
        body: JSON.stringify({ commentId, content: editingCommentText }),
      });
      if (res.ok) {
        setEditingCommentId(null);
        setEditingCommentText("");
        await fetchComments(detail.id);
      } else {
        toast.error("Failed to edit comment");
      }
    } catch {
      toast.error("Failed to edit comment");
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!detail) return;
    try {
      const res = await fetch(`/api/vulnerabilities/${detail.id}/comments`, {
        method: "DELETE",
        body: JSON.stringify({ commentId }),
      });
      if (res.ok) {
        await fetchComments(detail.id);
      } else {
        toast.error("Failed to delete comment");
      }
    } catch {
      toast.error("Failed to delete comment");
    }
  };

  const toggleAskForHelp = async () => {
    if (!detail) return;
    setIsUpdatingCollaboration(true);
    try {
      const res = await fetch(`/api/vulnerabilities/${detail.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          askForHelp: !detail.askForHelp,
          ...(detail.askForHelp ? { collaboratorIds: [] } : {})
        }),
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

  const commitDetailAssignment = async (nextAssigneeId: string | null) => {
    if (!detail) return;

    const res = await fetch(`/api/vulnerabilities/${detail.id}`, {
      method: "PATCH",
      body: JSON.stringify({ assigneeId: nextAssigneeId }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      toast.error(errorData.error || "Failed to update assignee");
      return;
    }

    const updated = await res.json();
    setDetail(updated);
    setPendingDetailAssignment(null);
    setSelectedMeta((prev) => ({
      ...prev,
      [detail.id]: {
        assigneeId: updated.assignee?.id ?? updated.assigneeId ?? null,
        assigneeName: updated.assignee?.name ?? null,
        name: updated.name ?? detail.name,
      },
    }));
    void fetchData();
    toast.success("Assignee updated");
  };

  const commitDetailUpdate = async (update: Partial<Vulnerability>) => {
    if (!detail) return;

    const res = await fetch(`/api/vulnerabilities/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });

    if (!res.ok) {
      toast.error("Update failed");
      return;
    }

    const updated = await res.json();
    if (updated.recordScope === "archived") {
      toast.success("Vulnerability archived");
      setDetail(null);
    } else {
      setDetail(updated);
      toast.success("Updated successfully");
    }
    void fetchData();
  };

  const handleStatusChange = (nextStatus: string) => {
    if (!detail) return;
    if (nextStatus === "InProgressWithCR" && !detail.crNumber) {
      setDetail({ ...detail, status: nextStatus });
      toast.info("Please enter a CR Number to complete this status update");
    } else {
      commitDetailUpdate({ status: nextStatus });
    }
  };

  const startDetailAssignment = (nextAssigneeId: string | null) => {
    if (!detail) return;
    if (nextAssigneeId === detail.assigneeId) return;

    if (nextAssigneeId && detail.assigneeId && detail.assigneeId !== nextAssigneeId) {
      const nextAssigneeName = users.find((user) => user.id === nextAssigneeId)?.name ?? "the selected assignee";
      setPendingDetailAssignment({
        assigneeId: nextAssigneeId,
        assigneeName: nextAssigneeName,
        currentAssigneeName: detail.assignee?.name ?? "Current assignee",
      });
      return;
    }

    void commitDetailAssignment(nextAssigneeId);
  };

  const statusOptions = isArchivedView
    ? [
      { label: "All archived", value: "" },
      { label: "Remediated", value: "Remediated" },
      { label: "False Positive", value: "FalsePositive" },
      { label: "No Fix", value: "NoFixAvailable" },
    ]
    : [
      { label: "All status", value: "" },
      { label: "Open", value: "Open" },
      { label: "In Progress", value: "InProgress" },
      { label: "In Progress with CR", value: "InProgressWithCR" },
      { label: "Sunset", value: "Sunset" },
      { label: "False Positive", value: "FalsePositive" },
      { label: "No Fix", value: "NoFixAvailable" },
      { label: "Remediated", value: "Remediated" },
    ];

  const detailIsArchived = detail?.recordScope === "archived";
  const archivedPresets: Array<{ id: ArchivedPreset; label: string }> = [
    { id: "7d", label: "Last 7 Days" },
    { id: "30d", label: "Last 30 Days" },
    { id: "quarter", label: "This Quarter" },
  ];

  const applyArchivedPreset = (preset: ArchivedPreset) => {
    const range = getArchivedPresetRange(preset);
    setArchivedFrom(range.from);
    setArchivedTo(range.to);
    setPage(1);
  };

  const clearArchivedDates = () => {
    setArchivedFrom("");
    setArchivedTo("");
    setPage(1);
  };

  const clearIdFilter = () => {
    setIdFilter("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("id");
    router.replace(`/vulnerabilities${params.toString() ? `?${params.toString()}` : ""}`);
    setPage(1);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Vulnerabilities</h2>
        <div className="flex items-center gap-3">
          <p className="text-sm opacity-70">Filter, assign, and triage vulnerabilities.</p>
          {idFilter && (
            <Badge tone="medium" className="gap-2 pl-2 pr-1 lowercase first-letter:uppercase">
              Focused on 1 item
              <button 
                onClick={clearIdFilter}
                className="hover:bg-amber-500/20 p-0.5 rounded-full transition-colors"
                title="Clear Focus"
              >
                <ChevronRight className="h-3 w-3 rotate-45" />
              </button>
            </Badge>
          )}
        </div>
      </div>

      <div id="tour-vuln-filters" className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Select
          value={viewScope}
          onChange={(value) => {
            const nextScope = value as ViewScope;
            setViewScope(nextScope);
            setPage(1);
            setSelected([]);
            setSelectedMeta({});
            setPendingAssignment(null);
            setPendingDetailAssignment(null);
            setDetail(null);
            if (nextScope === "archived" && status === "Open") {
              setStatus("");
            }
          }}
          options={[
            { label: "Active Findings", value: "active" },
            { label: "Archived Findings", value: "archived" },
          ]}
        />
        <MultiSelect
          value={siteIds}
          onChange={(vals) => { setSiteIds(vals); setPage(1); }}
          placeholder="All buckets"
          allLabel="All buckets"
          options={sites.map((site) => ({ label: site.name, value: site.id }))}
        />
        <Select
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          placeholder={isArchivedView ? "All archived" : "All status"}
          options={statusOptions}
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
            { label: "None", value: "None" },
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
        {groups.length > 0 && (
          <MultiSelect
            value={groupFilterIds}
            onChange={(vals) => { setGroupFilterIds(vals); setPage(1); }}
            placeholder="All groups"
            allLabel="All groups"
            options={[
              { label: "No group", value: "unassigned" },
              ...groups.map((g) => ({ label: g.name, value: g.id })),
            ]}
          />
        )}
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
        {isArchivedView ? (
          <>
            <Input
              type="date"
              value={archivedFrom}
              onChange={(event) => {
                setArchivedFrom(event.target.value);
                setPage(1);
              }}
              aria-label="Archived from"
            />
            <Input
              type="date"
              value={archivedTo}
              onChange={(event) => {
                setArchivedTo(event.target.value);
                setPage(1);
              }}
              aria-label="Archived to"
            />
          </>
        ) : null}
      </div>

      {isArchivedView ? (
        <div className="flex flex-wrap items-center gap-2">
          {archivedPresets.map((preset) => {
            const presetRange = getArchivedPresetRange(preset.id);
            const isActive = archivedFrom === presetRange.from && archivedTo === presetRange.to;

            return (
              <Button
                key={preset.id}
                type="button"
                variant="outline"
                onClick={() => applyArchivedPreset(preset.id)}
                className={cn(
                  "text-slate-700 dark:text-slate-200",
                  isActive && "border-amber-400 bg-amber-100 text-amber-950 dark:border-amber-300/50 dark:bg-amber-400/15 dark:text-amber-100"
                )}
              >
                {preset.label}
              </Button>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            onClick={clearArchivedDates}
            className="text-slate-600 dark:text-slate-300"
          >
            Clear Dates
          </Button>
        </div>
      ) : null}

      {isArchivedView && (
        <div className="rounded-[24px] border border-amber-300/50 bg-amber-50/80 px-5 py-4 text-sm text-amber-950 shadow-[0_10px_30px_rgba(245,158,11,0.08)] dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100">
          Archived findings are shown separately from active triage. This view is read-only and is intended for reviewing remediated, false-positive, and no-fix records later without mixing them into the live queue.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-400">
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
            <Button
              variant="ghost"
              disabled={page === 1}
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              Previous
            </Button>
            <span className="text-sm font-bold text-slate-900 dark:text-white px-3 py-1 bg-slate-100 dark:bg-white/5 rounded-full border border-slate-200 dark:border-white/10">Page {page}</span>
            <Button
              variant="ghost"
              disabled={page * pageSize >= total}
              onClick={() => setPage(prev => prev + 1)}
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
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
              if (assigneeId !== currentUserId) {
                setAssigneeId(currentUserId);
                setStatus("");
                setPage(1);
              } else {
                setAssigneeId("");
                setPage(1);
              }
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
          id="tour-vuln-advanced"
          variant="outline"
          onClick={() => { setFoldDuplicates(!foldDuplicates); setPage(1); }}
          className={cn(
            "text-slate-700 dark:text-slate-300 font-semibold transition-all duration-300",
            foldDuplicates && "bg-cyan-500/10 border-cyan-500 text-cyan-700 dark:bg-[#00C8FF]/10 dark:border-[#00C8FF] dark:text-[#00C8FF] shadow-[0_0_15px_rgba(0,200,255,0.1)]"
          )}
        >
          {foldDuplicates ? "Folding Active" : "Fold Duplicates"}
        </Button>
      </div>

      {!isArchivedView && selectedCount > 0 && (
        <div className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-3 animate-in slide-in-from-bottom-8 duration-500">
          {pendingAssignment && (
            <div className="w-[min(92vw,42rem)] overflow-hidden rounded-[28px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),rgba(255,255,255,0.92)_45%)] px-5 py-4 text-slate-900 shadow-[0_20px_60px_rgba(15,23,42,0.18),0_0_40px_rgba(34,211,238,0.12)] backdrop-blur-xl dark:border-cyan-400/25 dark:bg-[radial-gradient(circle_at_top,rgba(0,200,255,0.22),rgba(2,6,23,0.96)_45%)] dark:text-white dark:shadow-[0_30px_80px_rgba(0,0,0,0.45),0_0_40px_rgba(0,200,255,0.18)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="inline-flex items-center rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-300">
                    Confirm Reassignment
                  </div>
                  <div>
                    <p className="text-base font-semibold text-slate-950 dark:text-white">
                      {pendingAssignment.conflicts.length} selected {pendingAssignment.conflicts.length === 1 ? "issue is" : "issues are"} already assigned.
                    </p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      Reassigning will swap ownership to {pendingAssignment.assigneeName}. Current assignee{conflictingAssigneeNames.length === 1 ? "" : "s"}: {conflictingAssigneeNames.join(", ")}.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/40 bg-white/55 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                    {pendingAssignment.conflicts.slice(0, 3).map((conflict) => (
                      <p key={conflict.id} className="truncate">
                        <span className="font-semibold">{conflict.name}</span>
                        <span className="mx-2 text-slate-400 dark:text-slate-500">•</span>
                        <span>{conflict.currentAssigneeName}</span>
                      </p>
                    ))}
                    {pendingAssignment.conflicts.length > 3 && (
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        +{pendingAssignment.conflicts.length - 3} more selected issues
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end">
                  <Button
                    variant="ghost"
                    onClick={() => setPendingAssignment(null)}
                    className="text-slate-700 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => void commitAssignment(pendingAssignment.assigneeId)}
                    className="border border-cyan-400/30 bg-gradient-to-r from-cyan-400/80 to-sky-500/80 text-slate-950 shadow-[0_12px_30px_rgba(14,165,233,0.28)] hover:from-cyan-300 hover:to-sky-400 dark:text-slate-950"
                  >
                    Swap Assignee
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 rounded-full border border-slate-200 dark:border-[color:rgba(0,200,255,0.3)] bg-white/95 dark:bg-slate-900/95 px-6 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_0_30px_rgba(0,200,255,0.15)] backdrop-blur-md transition-all">
            <span className="text-sm font-bold text-slate-800 dark:text-white">{selectedCount} selected</span>
            <span className="h-6 w-px bg-slate-200 dark:bg-white/10" />
            <Button
              onClick={() => {
                if (session?.user?.id) {
                  startAssignment(session.user.id);
                } else {
                  toast.error("Missing user session");
                }
              }}
              variant="outline"
              className="border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10"
            >
              Assign to Me
            </Button>
            <Button onClick={() => startAssignment(null)} variant="outline" className="border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10">
              Unassign
            </Button>
            <div className="w-52">
              <Select
                value=""
                onChange={(val) => startAssignment(val)}
                placeholder="Assign to user"
                direction="up"
                options={[
                  ...users.map((user) => ({ label: user.name, value: user.id }))
                ]}
              />
            </div>
            {isWebAdmin && (
              <div className="w-48">
                <Select
                  value=""
                  onChange={(val) => void commitGroupAssignment(val)}
                  placeholder="Set group"
                  direction="up"
                  options={[
                    { label: "No group", value: "none" },
                    ...groups.map((g) => ({ label: g.name, value: g.id })),
                  ]}
                />
              </div>
            )}
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
                  { label: "In Progress", value: "InProgress" },
                  { label: "In Progress with CR", value: "InProgressWithCR" },
                  { label: "Sunset", value: "Sunset" },
                  { label: "False Positive", value: "FalsePositive" },
                  { label: "No Fix", value: "NoFixAvailable" },
                  { label: "Remediated", value: "Remediated" },
                ]}
              />
            </div>
          </div>
        </div>
      )}

      <div id="tour-vuln-table" className="overflow-x-auto rounded-[28px] border border-slate-200 dark:border-[color:rgba(0,200,255,0.2)] shadow-[0_0_20px_rgba(0,200,255,0.05),0_0_2px_rgba(0,200,255,0.1)] dark:shadow-[0_0_20px_rgba(0,200,255,0.15),0_0_2px_rgba(0,200,255,0.5)] bg-white dark:bg-white/5 backdrop-blur-sm">
        <table className="min-w-full text-left text-sm">
          <thead id="tour-vuln-header" className="border-b border-slate-200 dark:border-white/10 text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-400">
            <tr id="tour-vuln-table-header">
              <th className="p-4 text-center">
                {isArchivedView ? <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Mode</span> : <input type="checkbox" checked={allSelected} onChange={toggleAll} onClick={(e) => e.stopPropagation()} className="accent-[#00C8FF]" />}
              </th>
              <th className="p-4">Issue</th>
              <th className="p-4">Host</th>
              <th className="p-4 text-center">Risk</th>
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
                  <tr key={item.id} onClick={() => setDetail(item)} className="border-b border-slate-100 dark:border-white/5 last:border-none hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group cursor-pointer">
                    <td className="p-4">
                      {isArchivedView ? (
                        <Badge tone="neutral" className="px-2 py-1 text-[10px] uppercase tracking-[0.2em]">
                          Archived
                        </Badge>
                      ) : (
                        <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSelect(item)} onClick={(e) => e.stopPropagation()} className="accent-[#00C8FF]" />
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 mb-0.5">
                        {isInternetFacing(item.pluginId) && <InternetFacingBadge />}
                        <p className="font-bold text-slate-900 dark:text-white">{item.name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-tight text-slate-600 dark:text-slate-400 opacity-90 dark:opacity-60">Plugin {item.pluginId}</p>
                        {(item.commentCount ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 dark:bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-bold text-cyan-700 dark:text-cyan-400">
                            <MessageSquare size={10} />
                            {item.commentCount}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{item.host}:{item.port}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 opacity-80">{item.cve ?? "No CVE"}</p>
                    </td>
                    <td className="p-4">
                      <Badge tone={riskToneMap[item.risk] ?? "neutral"}>
                        {item.risk}
                      </Badge>
                    </td>
                    <td className="p-4">{renderStatusBadge(item.status)}</td>
                    <td className="p-4 text-slate-700 dark:text-slate-300 font-medium">
                      <div>{item.assignee?.name ?? "Unassigned"}</div>
                      {item.group && (
                        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {item.group.name}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <ClientDate date={item.lastSeenAt} className="text-xs text-slate-500 dark:text-slate-400" />
                    </td>
                    <td className="p-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetail(item)}
                        className="text-cyan-600 dark:text-[#00C8FF] hover:bg-cyan-50 dark:hover:bg-[#00C8FF]/10 font-bold group/btn"
                      >
                        View <ChevronRight className="ml-1 h-3 w-3 transition-transform group-hover/btn:translate-x-1" />
                      </Button>
                    </td>
                  </tr>
                );
              }

              const isExpanded = expandedGroups.has(entry.key);
              const { item: group } = entry;
              const groupMembers = subItems[entry.key] || [];

              return [
                <tr key={`group-${entry.key}`} className="bg-slate-50/50 dark:bg-white/[0.03] border-b border-slate-100 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors group">
                  <td className="p-4">
                    {isArchivedView ? (
                      <Badge tone="neutral" className="px-2 py-1 text-[10px] uppercase tracking-[0.2em]">
                        Archived
                      </Badge>
                    ) : (
                      <input
                        type="checkbox"
                        checked={isGroupSelected(group)}
                        onChange={() => toggleGroupSelect(group)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-[#00C8FF]"
                      />
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleGroup(group)} className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded transition-colors">
                        {isExpanded ? <ChevronDown size={16} className="text-slate-600 dark:text-slate-400" /> : <ChevronRight size={16} className="text-slate-600 dark:text-slate-400" />}
                      </button>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          {isInternetFacing(group.pluginId) && <InternetFacingBadge />}
                          <p className="font-bold text-slate-900 dark:text-white">{group.name}</p>
                        </div>
                        <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 opacity-90 dark:opacity-60 uppercase tracking-tight">Plugin {group.pluginId} • {group.groupCount} issues</p>
                      </div>
                      {(group.commentCount ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 dark:bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-bold text-cyan-700 dark:text-cyan-400">
                          <MessageSquare size={10} />{group.commentCount}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{group.host}:{group.port}</p>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 opacity-70 dark:opacity-50 uppercase tracking-tight truncate max-w-[200px]" title={group.groupCves ?? ""}>
                      {group.groupCves}
                    </p>
                  </td>
                  <td className="p-4">
                    <Badge tone={riskToneMap[group.risk] ?? "neutral"}>
                      {group.risk}
                    </Badge>
                  </td>
                  <td className="p-4">{renderStatusBadge(group.status)}</td>
                  <td className="p-4 text-slate-700 dark:text-slate-300 font-medium">
                    <div>{group.assignee?.name ?? "Unassigned"}</div>
                    {group.group && (
                      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {group.group.name}
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <ClientDate date={group.lastSeenAt} className="text-xs text-slate-500 dark:text-slate-400" />
                  </td>
                  <td className="p-4">
                    <Button
                      variant="ghost"
                      onClick={() => toggleGroup(group)}
                      className="text-[#00C8FF] hover:bg-[#00C8FF]/10 font-bold"
                    >
                      {isExpanded ? "Collapse" : "Expand"}
                    </Button>
                  </td>
                </tr>,
                ...(isExpanded ? (groupMembers.length > 0 ? [
                  <tr key={`${entry.key}-expanded`}>
                    <td colSpan={8} className="p-0">
                      <div className="bg-slate-50/80 dark:bg-black/40 backdrop-blur-xl border-x border-b border-slate-200 dark:border-white/5 rounded-b-2xl px-8 py-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        {groupMembers.map((member) => (
                          <div key={member.id} className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 last:border-none pb-4 last:pb-0 group/member">
                            <div className="flex items-center gap-6 flex-1">
                              {isArchivedView ? (
                                <Badge tone="neutral" className="mt-1 px-2 py-1 text-[10px] uppercase tracking-[0.2em]">
                                  Archived
                                </Badge>
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={selected.includes(member.id)}
                                  onChange={() => toggleSelect(member)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-1 accent-[#00C8FF]"
                                />
                              )}
                              <div className="min-w-[200px]">
                                <p className="text-[10px] text-slate-600 dark:text-slate-500 font-bold uppercase tracking-widest mb-1">Issue</p>
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm text-slate-900 dark:text-white font-bold">{member.name}</p>
                                  {(member.commentCount ?? 0) > 0 && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 dark:bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-bold text-cyan-700 dark:text-cyan-400">
                                      <MessageSquare size={10} />{member.commentCount}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="min-w-[150px]">
                                <p className="text-[10px] text-slate-600 dark:text-slate-500 font-bold uppercase tracking-widest mb-1">CVE</p>
                                <p className="text-sm font-mono text-slate-700 dark:text-slate-200">{member.cve ?? "None"}</p>
                              </div>
                              <div className="min-w-[100px]">
                                <p className="text-[10px] text-slate-600 dark:text-slate-500 font-bold uppercase tracking-widest mb-1">Risk</p>
                                <div className="mt-1 scale-90 origin-left">
                                  <Badge tone={riskToneMap[member.risk] ?? "neutral"} className="scale-90 origin-left">
                                    {member.risk}
                                  </Badge>
                                </div>
                              </div>
                              <div className="min-w-[120px]">
                                <p className="text-[10px] text-slate-600 dark:text-slate-500 font-bold uppercase tracking-widest mb-1">Status</p>
                                <div className="mt-1">{renderStatusBadge(member.status)}</div>
                              </div>
                              <div className="min-w-[120px]">
                                <p className="text-[10px] text-slate-600 dark:text-slate-500 font-bold uppercase tracking-widest mb-1">Assignee</p>
                                <p className="text-sm text-slate-700 dark:text-slate-200 font-medium">{member.assignee?.name ?? "Unassigned"}</p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDetail(member)}
                              className="text-cyan-600 dark:text-[#00C8FF] hover:bg-cyan-50 dark:hover:bg-[#00C8FF]/10 font-bold group/btn-sm"
                            >
                              View Output <ChevronRight className="ml-1 h-3 w-3 transition-transform group-hover/btn-sm:translate-x-1" />
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
        onClose={() => {
          setDetail(null);
          setPendingDetailAssignment(null);
        }}
        title="Vulnerability Details"
      >
        <div className="space-y-4">
          {detail && isInternetFacing(detail.pluginId) && (
            <div className="flex items-center gap-2 rounded-2xl border border-amber-300/50 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100">
              <Globe size={14} />
              <span>Internet-facing pentest finding — prioritise remediation.</span>
            </div>
          )}
          {detailIsArchived && (
            <div className="rounded-2xl border border-amber-300/50 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100">
              This record is archived history. It remains searchable for audit and reference, but it is not part of the active remediation queue.
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Synopsis</p>
            <p className="mt-2 text-slate-900 dark:text-slate-100">{detail?.synopsis ?? "No synopsis provided."}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Description</p>
            <p className="mt-2 text-slate-900 dark:text-slate-100 leading-relaxed">{detail?.description ?? "No description available."}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Solution</p>
            <p className="mt-2 text-slate-900 dark:text-slate-100 leading-relaxed">{detail?.solution ?? "No solution provided."}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Examples / Plugin Output</p>
            <div className="mt-2 bg-slate-50/50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-200/50 dark:border-slate-800/50 overflow-x-auto">
              <pre
                className="text-[11px] font-mono text-slate-900 dark:text-slate-100 leading-relaxed whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{ __html: renderPluginOutput(detail?.pluginOutput) }}
              />
            </div>
          </div>
          {detail?.seeAlso ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">References</p>
              <ul className="mt-2 space-y-1 text-sm">
                {detail.seeAlso
                  .split(/[\n,]+/)
                  .map((entry) => entry.trim())
                  .filter(Boolean)
                  .map((entry, idx) => {
                    const isUrl = /^https?:\/\//i.test(entry); // nosemgrep: ajinabraham.njsscan.dos.regex_dos.regex_dos -- anchored prefix check, no overlapping quantifiers, not ReDoS-prone
                    return (
                      <li key={`${entry}-${idx}`} className="text-slate-900 dark:text-slate-100 leading-relaxed break-words">
                        {isUrl ? (
                          <a
                            href={entry}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-600 hover:underline dark:text-sky-400"
                          >
                            {entry}
                          </a>
                        ) : (
                          entry
                        )}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="pt-6 border-t border-slate-200 dark:border-white/10 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Assignee</p>
              <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white">{detail?.assignee?.name ?? "Unassigned"}</p>
              {detail?.group ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Group: <span className="font-semibold text-slate-700 dark:text-slate-200">{detail.group.name}</span>
                  {isLeaderOfDetail && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">You lead this group</span>}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">No group assigned</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {detailIsArchived && detail?.archivedAt ? (
                <Badge tone="neutral" className="px-3 py-1">Archived</Badge>
              ) : null}
              <Badge tone={detail?.assigneeId ? "low" : "neutral"} className="px-3 py-1">
                {detail?.assigneeId ? "Owned" : "Unassigned"}
              </Badge>
            </div>
          </div>

          {detailIsArchived && detail?.archivedAt ? (
            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 text-sm dark:border-white/10 dark:bg-white/5 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Archived At</p>
                <ClientDate date={detail.archivedAt} className="mt-2 text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Last Seen</p>
                <ClientDate date={detail.lastSeenAt} className="mt-2 text-slate-900 dark:text-slate-100" />
              </div>
            </div>
          ) : null}

          {!detailIsArchived && pendingDetailAssignment && (
            <div className="overflow-hidden rounded-[24px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),rgba(255,255,255,0.92)_45%)] px-5 py-4 text-slate-900 shadow-[0_20px_60px_rgba(15,23,42,0.18),0_0_40px_rgba(34,211,238,0.12)] backdrop-blur-xl dark:border-cyan-400/25 dark:bg-[radial-gradient(circle_at_top,rgba(0,200,255,0.22),rgba(2,6,23,0.96)_45%)] dark:text-white dark:shadow-[0_30px_80px_rgba(0,0,0,0.45),0_0_40px_rgba(0,200,255,0.18)]">
              <div className="space-y-3">
                <div className="inline-flex items-center rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-300">
                  Confirm Reassignment
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-950 dark:text-white">This issue already has an owner.</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Swapping will move this issue from {pendingDetailAssignment.currentAssigneeName} to {pendingDetailAssignment.assigneeName}.
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setPendingDetailAssignment(null)}
                    className="text-slate-700 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => void commitDetailAssignment(pendingDetailAssignment.assigneeId)}
                    className="border border-cyan-400/30 bg-gradient-to-r from-cyan-400/80 to-sky-500/80 text-slate-950 shadow-[0_12px_30px_rgba(14,165,233,0.28)] hover:from-cyan-300 hover:to-sky-400 dark:text-slate-950"
                  >
                    Swap Assignee
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!detailIsArchived ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">Assignment Tools</p>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_220px]">
                  <Button
                    onClick={() => {
                      if (!canSelfAssignDetail) {
                        toast.error("This item is restricted to its group");
                        return;
                      }
                      if (session?.user?.id) {
                        startDetailAssignment(session.user.id);
                      } else {
                        toast.error("Missing user session");
                      }
                    }}
                    disabled={!canSelfAssignDetail}
                    variant="outline"
                    className="border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10"
                  >
                    Assign to Me
                  </Button>
                  <Button
                    onClick={() => startDetailAssignment(null)}
                    disabled={!canEditDetail}
                    variant="outline"
                    className="border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10"
                  >
                    Unassign
                  </Button>
                  <Select
                    value=""
                    onChange={(value) => startDetailAssignment(value)}
                    placeholder={canEditDetail ? "Assign in detail" : "Read-only"}
                    disabled={!canEditDetail}
                    options={users.map((user) => ({ label: user.name, value: user.id }))}
                  />
                </div>
              </div>

              {canChangeGroupDetail && (
                <div className="space-y-3 pt-6 border-t border-slate-200 dark:border-white/10">
                  <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">Group ownership (admin)</p>
                  <div className="max-w-[260px]">
                    <Select
                      value={detail?.groupId ?? "none"}
                      onChange={async (value) => {
                        if (!detail) return;
                        const next = value === "none" ? null : value;
                        const res = await fetch(`/api/vulnerabilities/${detail.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ groupId: next }),
                        });
                        if (!res.ok) {
                          const e = await res.json().catch(() => ({}));
                          toast.error(e.error || "Failed to update group");
                          return;
                        }
                        toast.success("Group updated");
                        const groupObj = next ? groups.find((g) => g.id === next) ?? null : null;
                        setDetail({ ...detail, groupId: next, group: groupObj ? { id: groupObj.id, name: groupObj.name } : null });
                        fetchData();
                      }}
                      placeholder="No group"
                      options={[
                        { label: "No group", value: "none" },
                        ...groups.map((g) => ({ label: g.name, value: g.id })),
                      ]}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-3 pt-6 border-t border-slate-200 dark:border-white/10">
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">Update Status</p>
                <div className="max-w-[220px]">
                  <Select
                    value={detail?.status ?? ""}
                    onChange={(value) => handleStatusChange(value)}
                    placeholder="Change status"
                    options={[
                      { label: "Open", value: "Open" },
                      { label: "In Progress", value: "InProgress" },
                      { label: "In Progress with CR", value: "InProgressWithCR" },
                      { label: "Sunset", value: "Sunset" },
                      { label: "False Positive", value: "FalsePositive" },
                      { label: "No Fix Available", value: "NoFixAvailable" },
                      { label: "Remediated", value: "Remediated" },
                    ]}
                  />
                </div>

                {detail?.status === "InProgressWithCR" && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center">
                      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">CR Number</p>
                      <InfoTooltip text="This field is for the change request number" />
                    </div>
                    <div className="max-w-[220px]">
                      <Input
                        value={detail.crNumber ?? ""}
                        placeholder="e.g. 12345"
                        onChange={(e) => {
                           // Keep only numbers as requested
                           const val = e.target.value.replace(/[^0-9]/g, "");
                           setDetail({ ...detail, crNumber: val });
                        }}
                        onBlur={(e) => {
                           if (detail.status === "InProgressWithCR") {
                             if (!e.target.value) {
                               toast.error("CR Number is required for this status");
                               return;
                             }
                             void commitDetailUpdate({ 
                               status: "InProgressWithCR",
                               crNumber: e.target.value 
                             });
                           } else if (detail.crNumber !== e.target.value) {
                             void commitDetailUpdate({ crNumber: e.target.value });
                           }
                        }}
                        className={cn(
                          "bg-white/50 dark:bg-black/20",
                          detail.status === "InProgressWithCR" && !detail.crNumber && "border-red-500 focus:border-red-500"
                        )}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {!detailIsArchived ? (
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
                  {users.filter(u => u.id !== detail.assigneeId && u.id !== session?.user?.id).map(user => {
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
        ) : null}

        {!detailIsArchived ? (
        <div className="pt-6 border-t border-slate-200 dark:border-gray-800 space-y-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white italic">Comments</h3>

          <div className="space-y-4">
            {Array.isArray(comments) && comments.map((comment) => {
              const canEditThis = session?.user?.id === comment.authorId || isWebAdmin;
              const isEditing = editingCommentId === comment.id;
              return (
              <div key={comment.id} className="bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-100 dark:border-white/5 space-y-2">
                <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold">{comment.author.name}</span>
                  <div className="flex items-center gap-2">
                    <ClientDate date={comment.createdAt} />
                    {canEditThis && !isEditing && (
                      <button
                        type="button"
                        className="text-xs text-cyan-500 hover:text-cyan-400 font-semibold"
                        onClick={() => { setEditingCommentId(comment.id); setEditingCommentText(comment.content); }}
                      >
                        Edit
                      </button>
                    )}
                    {canEditThis && !isEditing && (
                      <button
                        type="button"
                        className="text-xs text-red-500 hover:text-red-400 font-semibold"
                        onClick={() => deleteComment(comment.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      className="w-full bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-xl p-3 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none min-h-[80px] text-slate-900 dark:text-white"
                      value={editingCommentText}
                      onChange={(e) => setEditingCommentText(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        onClick={() => { setEditingCommentId(null); setEditingCommentText(""); }}
                        className="text-xs px-3 py-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => editComment(comment.id)}
                        disabled={!editingCommentText.trim()}
                        className="bg-[#00C8FF] text-slate-950 font-bold hover:bg-[#00C8FF]/90 dark:text-slate-950 text-xs px-3 py-1"
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-800 dark:text-slate-200">{comment.content}</p>
                )}
              </div>
              );
            })}
            {comments.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400 italic">No comments yet.</p>
            )}
          </div>

          {canComment && (
          <div className="space-y-3 pt-2">
            <textarea
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none min-h-[100px] text-slate-900 dark:text-white placeholder:text-slate-400"
              placeholder="Add a private comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <div className="flex justify-end">
              <Button
                onClick={addComment}
                disabled={isSubmittingComment || !commentText.trim()}
                loading={isSubmittingComment}
                className="bg-[#00C8FF] text-slate-950 font-bold hover:bg-[#00C8FF]/90 dark:text-slate-950"
              >
                Post Comment
              </Button>
            </div>
          </div>
          )}
        </div>
        ) : null}
      </SideSheet>

      <Dialog
        open={bulkCrDialogOpen}
        onClose={() => {
          setBulkCrDialogOpen(false);
          setBulkStatus("");
          setBulkCrValue("");
        }}
        title="Enter CR Number"
        footer={
          <>
            <Button 
              variant="ghost" 
              onClick={() => {
                setBulkCrDialogOpen(false);
                setBulkStatus("");
                setBulkCrValue("");
              }}
              className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => void commitBulkStatus("InProgressWithCR", bulkCrValue)}
              disabled={!bulkCrValue.trim()}
            >
              Confirm Update
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Please enter the Change Request (CR) number to be applied to the <span className="font-bold text-slate-900 dark:text-white">{selected.length}</span> selected vulnerabilities.
          </p>
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">CR Number</p>
            <Input
              value={bulkCrValue}
              placeholder="e.g. 12345"
              autoFocus
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, "");
                setBulkCrValue(val);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && bulkCrValue.trim()) {
                  void commitBulkStatus("InProgressWithCR", bulkCrValue);
                }
              }}
              className="bg-slate-50 dark:bg-black/20"
            />
          </div>
        </div>
      </Dialog>
    </div >
  );
}

