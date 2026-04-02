import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  threatSubscription: { findUnique: vi.fn(), upsert: vi.fn() },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/rbac", () => ({
  requireUser: vi.fn(),
}));
vi.mock("@prisma/client", () => ({
  Risk: { Critical: "Critical", High: "High", Medium: "Medium", Low: "Low", None: "None" },
}));

import { requireUser } from "../../lib/rbac";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ user: { id: "user-1" } } as any);
});

describe("/api/threat-intelligence/subscription GET", () => {
  it("returns the user subscription", async () => {
    const sub = {
      userId: "user-1",
      isSubscribed: true,
      minRisk: "High",
      cisaKevOnly: false,
      scheduledHour: 8,
      scheduledMinute: 30,
    };
    mockPrisma.threatSubscription.findUnique.mockResolvedValue(sub);

    const { GET } = await import("../../app/api/threat-intelligence/subscription/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isSubscribed).toBe(true);
    expect(data.minRisk).toBe("High");
  });

  it("returns null when no subscription", async () => {
    mockPrisma.threatSubscription.findUnique.mockResolvedValue(null);

    const { GET } = await import("../../app/api/threat-intelligence/subscription/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeNull();
  });

  it("returns 401 when requireUser returns session without user.id", async () => {
    vi.mocked(requireUser).mockResolvedValue({ user: { id: undefined } } as any);

    const { GET } = await import("../../app/api/threat-intelligence/subscription/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("/api/threat-intelligence/subscription POST", () => {
  it("creates/updates subscription with valid payload", async () => {
    const sub = {
      userId: "user-1",
      isSubscribed: true,
      minRisk: "Critical",
      cisaKevOnly: true,
      scheduledHour: 9,
      scheduledMinute: 0,
    };
    mockPrisma.threatSubscription.upsert.mockResolvedValue(sub);

    const { POST } = await import("../../app/api/threat-intelligence/subscription/route");
    const req = new Request("http://localhost/api/threat-intelligence/subscription", {
      method: "POST",
      body: JSON.stringify(sub),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isSubscribed).toBe(true);
  });

  it("returns 400 for invalid payload", async () => {
    const { POST } = await import("../../app/api/threat-intelligence/subscription/route");
    const req = new Request("http://localhost/api/threat-intelligence/subscription", {
      method: "POST",
      body: JSON.stringify({
        isSubscribed: "not-bool",
        minRisk: "InvalidRisk",
        cisaKevOnly: true,
        scheduledHour: 25, // out of range
        scheduledMinute: 0,
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 on POST when user.id is missing", async () => {
    vi.mocked(requireUser).mockResolvedValue({ user: { id: undefined } } as any);

    const { POST } = await import("../../app/api/threat-intelligence/subscription/route");
    const req = new Request("http://localhost/api/threat-intelligence/subscription", {
      method: "POST",
      body: JSON.stringify({ isSubscribed: true, minRisk: "High", cisaKevOnly: false, scheduledHour: 8, scheduledMinute: 0 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when scheduledMinute out of range", async () => {
    const { POST } = await import("../../app/api/threat-intelligence/subscription/route");
    const req = new Request("http://localhost/api/threat-intelligence/subscription", {
      method: "POST",
      body: JSON.stringify({
        isSubscribed: true,
        minRisk: "High",
        cisaKevOnly: false,
        scheduledHour: 10,
        scheduledMinute: 60, // out of range
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
