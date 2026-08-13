import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  dashboard: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  dashboardWidget: {
    count: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/rbac", () => ({
  requireUser: vi.fn(),
  checkAdmin: vi.fn(() => false),
}));
vi.mock("../../lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("../../lib/audit-log", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../lib/group-rbac", () => ({ getGroupContext: vi.fn(async () => ({ memberOf: [] })) }));
vi.mock("../../lib/dashboards/execute", () => ({ executeWidgetSpec: vi.fn() }));

import { requireUser } from "../../lib/rbac";
import { enforceRateLimit } from "../../lib/rate-limit";
import { writeAuditLog } from "../../lib/audit-log";
import { executeWidgetSpec } from "../../lib/dashboards/execute";

const OWNER = "user-owner";
const OTHER = "user-other";

/** A minimal spec that satisfies widgetSpecSchema. */
const VALID_SPEC = {
  source: "vulnerabilities",
  metric: "count",
  groupBy: "risk",
  filters: {},
  limit: 10,
  months: 6,
};

const VALID_WIDGET = { title: "Open by severity", viz: "bar", spec: VALID_SPEC, x: 0, y: 0, w: 6, h: 6 };

function post(url: string, body: unknown) {
  return new Request(url, { method: "POST", body: JSON.stringify(body) }) as never;
}
function patch(url: string, body: unknown) {
  return new Request(url, { method: "PATCH", body: JSON.stringify(body) }) as never;
}

function asOwner() {
  vi.mocked(requireUser).mockResolvedValue({
    user: { id: OWNER, email: "owner@example.com", roles: ["web_app_user"] },
  } as never);
}
function asOther() {
  vi.mocked(requireUser).mockResolvedValue({
    user: { id: OTHER, email: "other@example.com", roles: ["web_app_user"] },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as never);
  vi.mocked(executeWidgetSpec).mockResolvedValue({ total: 0, rows: [], truncated: false } as never);
  mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => ops);
  asOwner();
});

describe("/api/dashboards", () => {
  it("separates the caller's own boards from other people's published ones", async () => {
    mockPrisma.dashboard.findMany
      .mockResolvedValueOnce([{ id: "d1", ownerId: OWNER }])
      .mockResolvedValueOnce([{ id: "d2", ownerId: OTHER, visibility: "Published" }]);

    const { GET } = await import("../../app/api/dashboards/route");
    const body = await (await GET()).json();

    expect(body.mine).toHaveLength(1);
    expect(body.published).toHaveLength(1);
    // The "published" query must exclude the caller so their own boards are not
    // listed twice, and must never return Private boards.
    expect(mockPrisma.dashboard.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { visibility: "Published", ownerId: { not: OWNER } },
      })
    );
  });

  it("rejects an empty name", async () => {
    const { POST } = await import("../../app/api/dashboards/route");
    const res = await POST(post("http://localhost/api/dashboards", { name: "   " }));
    expect(res.status).toBe(400);
    expect(mockPrisma.dashboard.create).not.toHaveBeenCalled();
  });

  it("rejects a name over 120 characters", async () => {
    const { POST } = await import("../../app/api/dashboards/route");
    const res = await POST(post("http://localhost/api/dashboards", { name: "x".repeat(121) }));
    expect(res.status).toBe(400);
  });

  it("creates a private board owned by the caller and audits it", async () => {
    mockPrisma.dashboard.create.mockResolvedValue({ id: "d1", name: "Ops" });

    const { POST } = await import("../../app/api/dashboards/route");
    const res = await POST(post("http://localhost/api/dashboards", { name: "  Ops  " }));

    expect(res.status).toBe(201);
    expect(mockPrisma.dashboard.create).toHaveBeenCalledWith({
      data: { ownerId: OWNER, name: "Ops", description: null },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "dashboard.created", entityId: "d1" })
    );
  });

  it("honours the rate limit", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as never);
    const { POST } = await import("../../app/api/dashboards/route");
    const res = await POST(post("http://localhost/api/dashboards", { name: "Ops" }));
    expect(res.status).toBe(429);
  });
});

describe("/api/dashboards/[id] — ownership boundary", () => {
  const params = { params: Promise.resolve({ id: "d1" }) };

  it("404s an unknown board", async () => {
    mockPrisma.dashboard.findUnique.mockResolvedValue(null);
    const { GET } = await import("../../app/api/dashboards/[id]/route");
    const res = await GET(new Request("http://localhost/api/dashboards/d1") as never, params);
    expect(res.status).toBe(404);
  });

  it("hides a private board from everyone but its owner (404, not 403)", async () => {
    asOther();
    mockPrisma.dashboard.findUnique.mockResolvedValue({
      id: "d1",
      ownerId: OWNER,
      visibility: "Private",
      widgets: [],
    });

    const { GET } = await import("../../app/api/dashboards/[id]/route");
    const res = await GET(new Request("http://localhost/api/dashboards/d1") as never, params);
    // 404 rather than 403 so a private board's existence is not disclosed.
    expect(res.status).toBe(404);
  });

  it("lets a non-owner view a published board read-only", async () => {
    asOther();
    mockPrisma.dashboard.findUnique.mockResolvedValue({
      id: "d1",
      ownerId: OWNER,
      visibility: "Published",
      widgets: [],
    });

    const { GET } = await import("../../app/api/dashboards/[id]/route");
    const body = await (
      await GET(new Request("http://localhost/api/dashboards/d1") as never, params)
    ).json();

    expect(body.access).toEqual({ canView: true, canEdit: false });
  });

  it("refuses a PATCH from a non-owner even when the board is published", async () => {
    asOther();
    mockPrisma.dashboard.findUnique.mockResolvedValue({
      id: "d1",
      ownerId: OWNER,
      visibility: "Published",
    });

    const { PATCH } = await import("../../app/api/dashboards/[id]/route");
    const res = await PATCH(patch("http://localhost/api/dashboards/d1", { name: "Hijacked" }), params);

    expect(res.status).toBe(403);
    expect(mockPrisma.dashboard.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown visibility value", async () => {
    mockPrisma.dashboard.findUnique.mockResolvedValue({ id: "d1", ownerId: OWNER, visibility: "Private" });
    const { PATCH } = await import("../../app/api/dashboards/[id]/route");
    const res = await PATCH(patch("http://localhost/api/dashboards/d1", { visibility: "Public" }), params);
    expect(res.status).toBe(400);
  });

  it("audits a visibility change, since publishing widens the audience", async () => {
    mockPrisma.dashboard.findUnique.mockResolvedValue({ id: "d1", ownerId: OWNER, visibility: "Private" });
    mockPrisma.dashboard.update.mockResolvedValue({ id: "d1", visibility: "Published" });

    const { PATCH } = await import("../../app/api/dashboards/[id]/route");
    await PATCH(patch("http://localhost/api/dashboards/d1", { visibility: "Published" }), params);

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "dashboard.visibility_changed",
        oldValue: "Private",
        newValue: "Published",
      })
    );
  });

  it("does not audit a no-op visibility write", async () => {
    mockPrisma.dashboard.findUnique.mockResolvedValue({ id: "d1", ownerId: OWNER, visibility: "Private" });
    mockPrisma.dashboard.update.mockResolvedValue({ id: "d1", visibility: "Private" });

    const { PATCH } = await import("../../app/api/dashboards/[id]/route");
    await PATCH(patch("http://localhost/api/dashboards/d1", { visibility: "Private" }), params);

    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("refuses a DELETE from a non-owner", async () => {
    asOther();
    mockPrisma.dashboard.findUnique.mockResolvedValue({ id: "d1", ownerId: OWNER, visibility: "Published" });

    const { DELETE } = await import("../../app/api/dashboards/[id]/route");
    const res = await DELETE(new Request("http://localhost/api/dashboards/d1", { method: "DELETE" }) as never, params);

    expect(res.status).toBe(403);
    expect(mockPrisma.dashboard.delete).not.toHaveBeenCalled();
  });

  it("deletes and audits for the owner", async () => {
    mockPrisma.dashboard.findUnique.mockResolvedValue({ id: "d1", ownerId: OWNER, name: "Ops" });
    const { DELETE } = await import("../../app/api/dashboards/[id]/route");
    const res = await DELETE(new Request("http://localhost/api/dashboards/d1", { method: "DELETE" }) as never, params);

    expect(res.status).toBe(200);
    expect(mockPrisma.dashboard.delete).toHaveBeenCalledWith({ where: { id: "d1" } });
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "dashboard.deleted" }));
  });
});

describe("/api/dashboards/[id]/widgets", () => {
  const params = { params: Promise.resolve({ id: "d1" }) };

  beforeEach(() => {
    mockPrisma.dashboard.findUnique.mockResolvedValue({ id: "d1", ownerId: OWNER, visibility: "Private" });
    mockPrisma.dashboardWidget.count.mockResolvedValue(0);
    mockPrisma.dashboardWidget.create.mockResolvedValue({ id: "w1" });
  });

  it("refuses widget creation on someone else's board", async () => {
    asOther();
    const { POST } = await import("../../app/api/dashboards/[id]/widgets/route");
    const res = await POST(post("http://localhost/api/dashboards/d1/widgets", VALID_WIDGET), params);
    expect(res.status).toBe(403);
  });

  it("creates a valid widget", async () => {
    const { POST } = await import("../../app/api/dashboards/[id]/widgets/route");
    const res = await POST(post("http://localhost/api/dashboards/d1/widgets", VALID_WIDGET), params);
    expect(res.status).toBe(201);
  });

  it("rejects a spec containing a field outside the allowlist", async () => {
    const { POST } = await import("../../app/api/dashboards/[id]/widgets/route");
    const res = await POST(
      post("http://localhost/api/dashboards/d1/widgets", {
        ...VALID_WIDGET,
        spec: { ...VALID_SPEC, rawSql: "SELECT 1" },
      }),
      params
    );
    // widgetSpecSchema is `.strict()` — an unknown key is a hard failure, which
    // is what stops a planner or a client injecting an arbitrary query.
    expect(res.status).toBe(400);
    expect(mockPrisma.dashboardWidget.create).not.toHaveBeenCalled();
  });

  it("rejects a groupBy that does not belong to the chosen source", async () => {
    const { POST } = await import("../../app/api/dashboards/[id]/widgets/route");
    const res = await POST(
      post("http://localhost/api/dashboards/d1/widgets", {
        ...VALID_WIDGET,
        // "risk" parses (it is a valid grouping somewhere) but is meaningless
        // for uploads — assertSpecIsCoherent is the second gate that catches it.
        spec: { ...VALID_SPEC, source: "uploads", filters: undefined, groupBy: "risk" },
      }),
      params
    );
    expect(res.status).toBe(400);
  });

  it("caps a board at 24 widgets", async () => {
    mockPrisma.dashboardWidget.count.mockResolvedValue(24);
    const { POST } = await import("../../app/api/dashboards/[id]/widgets/route");
    const res = await POST(post("http://localhost/api/dashboards/d1/widgets", VALID_WIDGET), params);
    expect(res.status).toBe(400);
    expect(mockPrisma.dashboardWidget.create).not.toHaveBeenCalled();
  });

  it("rejects layout geometry outside the grid bounds", async () => {
    const { PATCH } = await import("../../app/api/dashboards/[id]/widgets/route");
    const res = await PATCH(
      patch("http://localhost/api/dashboards/d1/widgets", {
        layout: [{ id: "11111111-1111-4111-8111-111111111111", x: 0, y: 0, w: 99, h: 6 }],
      }),
      params
    );
    expect(res.status).toBe(400);
  });

  it("scopes every layout update to the parent board", async () => {
    const { PATCH } = await import("../../app/api/dashboards/[id]/widgets/route");
    const res = await PATCH(
      patch("http://localhost/api/dashboards/d1/widgets", {
        layout: [{ id: "11111111-1111-4111-8111-111111111111", x: 1, y: 2, w: 6, h: 6 }],
      }),
      params
    );

    expect(res.status).toBe(200);
    // dashboardId in the where-clause stops a caller repositioning a widget
    // that belongs to a board they do not own.
    expect(mockPrisma.dashboardWidget.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "11111111-1111-4111-8111-111111111111", dashboardId: "d1" },
      })
    );
  });
});

describe("/api/dashboards/[id]/widgets/[widgetId]/data — viewer re-scoping", () => {
  const params = { params: Promise.resolve({ id: "d1", widgetId: "w1" }) };

  it("re-executes a published board's widget as the viewer, not the author", async () => {
    asOther();
    mockPrisma.dashboard.findUnique.mockResolvedValue({
      id: "d1",
      ownerId: OWNER,
      visibility: "Published",
      widgets: [{ id: "w1", spec: VALID_SPEC }],
    });

    const { POST } = await import("../../app/api/dashboards/[id]/widgets/[widgetId]/data/route");
    const res = await POST(post("http://localhost/api/dashboards/d1/widgets/w1/data", {}), params);

    expect(res.status).toBe(200);
    expect(executeWidgetSpec).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: OTHER, isAdmin: false })
    );
  });

  it("404s a widget that is not on the requested board", async () => {
    mockPrisma.dashboard.findUnique.mockResolvedValue({
      id: "d1",
      ownerId: OWNER,
      visibility: "Private",
      widgets: [{ id: "other-widget", spec: VALID_SPEC }],
    });

    const { POST } = await import("../../app/api/dashboards/[id]/widgets/[widgetId]/data/route");
    const res = await POST(post("http://localhost/api/dashboards/d1/widgets/w1/data", {}), params);
    expect(res.status).toBe(404);
  });

  it("422s a stored spec that no longer validates", async () => {
    mockPrisma.dashboard.findUnique.mockResolvedValue({
      id: "d1",
      ownerId: OWNER,
      visibility: "Private",
      widgets: [{ id: "w1", spec: { source: "retired-source" } }],
    });

    const { POST } = await import("../../app/api/dashboards/[id]/widgets/[widgetId]/data/route");
    const res = await POST(post("http://localhost/api/dashboards/d1/widgets/w1/data", {}), params);

    // A spec persisted by an older release must fail closed rather than be
    // coerced into something executable.
    expect(res.status).toBe(422);
    expect(executeWidgetSpec).not.toHaveBeenCalled();
  });

  it("does not leak internals when execution throws", async () => {
    mockPrisma.dashboard.findUnique.mockResolvedValue({
      id: "d1",
      ownerId: OWNER,
      visibility: "Private",
      widgets: [{ id: "w1", spec: VALID_SPEC }],
    });
    vi.mocked(executeWidgetSpec).mockRejectedValue(new Error("relation \"Vulnerability\" does not exist"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("../../app/api/dashboards/[id]/widgets/[widgetId]/data/route");
    const res = await POST(post("http://localhost/api/dashboards/d1/widgets/w1/data", {}), params);

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Failed to run this widget");
  });
});

describe("/api/dashboards/preview", () => {
  it("rejects an invalid spec before touching the database", async () => {
    const { POST } = await import("../../app/api/dashboards/preview/route");
    const res = await POST(post("http://localhost/api/dashboards/preview", { source: "nope" }));
    expect(res.status).toBe(400);
    expect(executeWidgetSpec).not.toHaveBeenCalled();
  });

  it("runs a valid spec under the caller's own scope", async () => {
    const { POST } = await import("../../app/api/dashboards/preview/route");
    const res = await POST(post("http://localhost/api/dashboards/preview", VALID_SPEC));

    expect(res.status).toBe(200);
    expect(executeWidgetSpec).toHaveBeenCalledWith(
      expect.objectContaining({ source: "vulnerabilities" }),
      expect.objectContaining({ userId: OWNER })
    );
  });
});
