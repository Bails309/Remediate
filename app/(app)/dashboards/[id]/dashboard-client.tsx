"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { WidgetRenderer, type WidgetData } from "@/components/dashboards/WidgetRenderer";
import { WidgetBuilder, type WidgetDraft } from "@/components/dashboards/WidgetBuilder";
import { toast } from "@/lib/toast";
import { cn } from "@/components/cn";
import { Copy, Globe, LayoutDashboard, Lock, Plus, RefreshCw, Trash2, X } from "lucide-react";

export type DashboardWidget = {
  id: string;
  title: string;
  viz: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Dashboard = {
  id: string;
  name: string;
  description: string | null;
  visibility: "Private" | "Published";
  owner: { id: string; name: string };
  widgets: DashboardWidget[];
};

const COLUMNS = 12;
const ROW_HEIGHT = 60;

export function DashboardClient({ dashboard, canEdit }: { dashboard: Dashboard; canEdit: boolean }) {
  const router = useRouter();
  const { width, containerRef } = useContainerWidth();
  const [widgets, setWidgets] = useState(dashboard.widgets);
  const [data, setData] = useState<Record<string, WidgetData | null>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [editing, setEditing] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [visibility, setVisibility] = useState(dashboard.visibility);

  const loadWidget = useCallback(
    async (widgetId: string) => {
      const response = await fetch(`/api/dashboards/${dashboard.id}/widgets/${widgetId}/data`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (response.ok) {
        setData((current) => ({ ...current, [widgetId]: body as WidgetData }));
        setErrors((current) => ({ ...current, [widgetId]: null }));
        return;
      }
      setData((current) => ({ ...current, [widgetId]: null }));
      setErrors((current) => ({ ...current, [widgetId]: body?.error ?? "Could not run this widget" }));
    },
    [dashboard.id]
  );

  useEffect(() => {
    widgets.forEach((widget) => {
      if (!(widget.id in data) && !(widget.id in errors)) void loadWidget(widget.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets, loadWidget]);

  const layout = useMemo<Layout>(
    () => widgets.map((widget) => ({ i: widget.id, x: widget.x, y: widget.y, w: widget.w, h: widget.h })),
    [widgets]
  );

  const persistLayout = (next: Layout) => {
    void savePositions(next);
  };

  const savePositions = async (next: Layout) => {
    setWidgets((current) =>
      current.map((widget) => {
        const item = next.find((entry) => entry.i === widget.id);
        return item ? { ...widget, x: item.x, y: item.y, w: item.w, h: item.h } : widget;
      })
    );

    await fetch(`/api/dashboards/${dashboard.id}/widgets`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        layout: next.map((item) => ({ id: item.i, x: item.x, y: item.y, w: item.w, h: item.h })),
      }),
    });
  };

  const addWidget = async (draft: WidgetDraft) => {
    const nextY = widgets.reduce((max, widget) => Math.max(max, widget.y + widget.h), 0);
    const response = await fetch(`/api/dashboards/${dashboard.id}/widgets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, x: 0, y: nextY, w: draft.viz === "stat" ? 3 : 6, h: 4 }),
    });

    const body = await response.json();
    if (!response.ok) {
      toast.error(body.error ?? "Could not add that widget");
      return;
    }

    setWidgets((current) => [...current, body]);
    void loadWidget(body.id);
    toast.success("Widget added");
  };

  const removeWidget = async (widgetId: string) => {
    const response = await fetch(`/api/dashboards/${dashboard.id}/widgets/${widgetId}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Could not remove that widget");
      return;
    }
    setWidgets((current) => current.filter((widget) => widget.id !== widgetId));
  };

  const toggleVisibility = async () => {
    const next = visibility === "Published" ? "Private" : "Published";
    const response = await fetch(`/api/dashboards/${dashboard.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: next }),
    });
    if (!response.ok) {
      toast.error("Could not change visibility");
      return;
    }
    setVisibility(next);
    toast.success(next === "Published" ? "Published to everyone" : "Now private");
  };

  const clone = async () => {
    const response = await fetch(`/api/dashboards/${dashboard.id}/clone`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) {
      toast.error(body.error ?? "Could not copy this dashboard");
      return;
    }
    toast.success("Copied to your dashboards");
    router.push(`/dashboards/${body.id}`);
  };

  const removeDashboard = async () => {
    const response = await fetch(`/api/dashboards/${dashboard.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Could not delete this dashboard");
      return;
    }
    router.push("/dashboards");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{dashboard.name}</h1>
          <p className="mt-1 text-sm opacity-60">
            {dashboard.description || "No description"} · by {dashboard.owner.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <>
              <Button variant="outline" onClick={toggleVisibility}>
                {visibility === "Published" ? <Globe className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />}
                {visibility === "Published" ? "Published" : "Private"}
              </Button>
              <Button variant="outline" onClick={() => setEditing((current) => !current)}>
                {editing ? "Done" : "Arrange"}
              </Button>
              <Button onClick={() => setBuilderOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add widget
              </Button>
            </>
          )}
          {!canEdit && (
            <Button variant="outline" onClick={clone}>
              <Copy className="mr-2 h-4 w-4" />
              Make a copy
            </Button>
          )}
          {canEdit && (
            <Button variant="ghost" onClick={removeDashboard} title="Delete dashboard">
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          )}
        </div>
      </div>

      <div ref={containerRef}>
        {widgets.length === 0 ? (
          <EmptyState
            title="No widgets yet"
            description={canEdit ? "Add your first widget to start building this dashboard." : "The owner has not added any widgets."}
            icon={<LayoutDashboard size={32} />}
          />
        ) : (
          <GridLayout
            className="layout"
            layout={layout}
            width={width}
            gridConfig={{ cols: COLUMNS, rowHeight: ROW_HEIGHT, margin: [16, 16] }}
            dragConfig={{ enabled: editing, handle: ".widget-drag-handle" }}
            resizeConfig={{ enabled: editing }}
            onDragStop={persistLayout}
            onResizeStop={persistLayout}
          >
            {widgets.map((widget) => (
              <div key={widget.id} className="glass glass-edge flex flex-col rounded-2xl p-4">
                <div
                  className={cn(
                    "widget-drag-handle flex items-start justify-between gap-2",
                    editing && "cursor-move"
                  )}
                >
                  <p className="truncate text-sm font-semibold">{widget.title}</p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => void loadWidget(widget.id)}
                      title="Refresh"
                      className="rounded p-1 opacity-40 transition-opacity hover:opacity-100"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    {editing && (
                      <button
                        onClick={() => removeWidget(widget.id)}
                        title="Remove widget"
                        className="rounded p-1 opacity-40 transition-opacity hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5 text-red-500" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 min-h-0 flex-1">
                  <WidgetRenderer viz={widget.viz} data={data[widget.id] ?? null} error={errors[widget.id]} />
                </div>
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      <p className="text-[10px] opacity-40">
        Widgets store the query, not the results — everyone sees this dashboard scoped to their own permissions.
      </p>

      <WidgetBuilder open={builderOpen} onClose={() => setBuilderOpen(false)} onSave={addWidget} />
    </div>
  );
}
