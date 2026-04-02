import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  auditLog: {
    findMany: vi.fn(),
  },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("../../lib/audit-log", () => ({ writeAuditLog: vi.fn() }));

import { auth } from "../../auth";
import { enforceRateLimit } from "../../lib/rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
});

describe("/api/feedback POST", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const { POST } = await import("../../app/api/feedback/route");
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      body: JSON.stringify({ type: "bug", message: "Test bug report" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", email: "u@t.com" } } as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);

    const { POST } = await import("../../app/api/feedback/route");
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      body: JSON.stringify({ type: "bug", message: "Test bug report" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid body", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", email: "u@t.com" } } as any);

    const { POST } = await import("../../app/api/feedback/route");
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      body: JSON.stringify({ type: "invalid", message: "" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when message is too short", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", email: "u@t.com" } } as any);

    const { POST } = await import("../../app/api/feedback/route");
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      body: JSON.stringify({ type: "bug", message: "Hi" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 401 when session has email but no id", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "u@t.com" } } as any);

    const { POST } = await import("../../app/api/feedback/route");
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      body: JSON.stringify({ type: "bug", message: "Test bug report" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is unparseable JSON", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", email: "u@t.com" } } as any);

    const { POST } = await import("../../app/api/feedback/route");
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      body: "not-json{{{",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("submits valid feedback", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", email: "u@t.com" } } as any);

    const { POST } = await import("../../app/api/feedback/route");
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      body: JSON.stringify({ type: "feature", message: "Please add dark mode", page: "/dashboard" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

describe("/api/feedback GET", () => {
  it("returns 401 for non-site_admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { roles: ["web_app_user"] } } as any);
    const { GET } = await import("../../app/api/feedback/route");
    const res = await GET(new Request("http://localhost/api/feedback") as any);
    expect(res.status).toBe(401);
  });

  it("returns feedback entries for site_admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { roles: ["site_admin"] } } as any);
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { id: "f1", userEmail: "u@t.com", newValue: '{"type":"bug","message":"test"}', createdAt: new Date() },
    ]);

    const { GET } = await import("../../app/api/feedback/route");
    const res = await GET(new Request("http://localhost/api/feedback") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].userEmail).toBe("u@t.com");
  });

  it("returns 429 when GET is rate limited", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { roles: ["site_admin"] } } as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);

    const { GET } = await import("../../app/api/feedback/route");
    const res = await GET(new Request("http://localhost/api/feedback") as any);
    expect(res.status).toBe(429);
  });
});
