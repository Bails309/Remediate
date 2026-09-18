import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    threatSubscription: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));
vi.mock("../../lib/rbac", () => ({
  requireUser: vi.fn(),
}));
vi.mock("@prisma/client", () => ({
  Risk: { Critical: "Critical", High: "High", Medium: "Medium", Low: "Low", None: "None" },
}));

import { prisma } from "../../lib/prisma";
import { requireUser } from "../../lib/rbac";
import { GET, POST } from "../../app/api/threat-intelligence/subscription/route";

const mockPrisma = prisma as unknown as {
  threatSubscription: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ user: { id: "user-1" } } as any);
});

describe("/api/threat-intelligence/subscription GET", () => {
  it("returns the user subscription with feed toggles", async () => {
    const sub = {
      userId: "user-1",
      isSubscribed: true,
      globalDigestEnabled: true,
      environmentDigestEnabled: true,
      minRisk: "High",
      cisaKevOnly: false,
      scheduledHour: 8,
      scheduledMinute: 30,
    };
    mockPrisma.threatSubscription.findUnique.mockResolvedValue(sub);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isSubscribed).toBe(true);
    expect(data.globalDigestEnabled).toBe(true);
    expect(data.environmentDigestEnabled).toBe(true);
    expect(data.minRisk).toBe("High");
  });

  it("returns null when no subscription", async () => {
    mockPrisma.threatSubscription.findUnique.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeNull();
  });

  it("returns 401 when requireUser returns session without user.id", async () => {
    vi.mocked(requireUser).mockResolvedValue({ user: { id: undefined } } as any);

    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("/api/threat-intelligence/subscription POST", () => {
  it("creates/updates subscription with dual feed toggles", async () => {
    const payload = {
      globalDigestEnabled: false,
      environmentDigestEnabled: true,
      minRisk: "Critical",
      cisaKevOnly: true,
      scheduledHour: 9,
      scheduledMinute: 0,
    };
    mockPrisma.threatSubscription.upsert.mockResolvedValue({
      userId: "user-1",
      ...payload,
      isSubscribed: true,
    });

    const req = new Request("http://localhost/api/threat-intelligence/subscription", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.environmentDigestEnabled).toBe(true);
    expect(data.globalDigestEnabled).toBe(false);

    expect(mockPrisma.threatSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        update: expect.objectContaining({
          environmentDigestEnabled: true,
          globalDigestEnabled: false,
          isSubscribed: true,
        }),
      })
    );
  });

  it("creates/updates subscription with legacy isSubscribed payload", async () => {
    const sub = {
      isSubscribed: true,
      minRisk: "Critical",
      cisaKevOnly: true,
      scheduledHour: 9,
      scheduledMinute: 0,
    };
    mockPrisma.threatSubscription.upsert.mockResolvedValue({
      userId: "user-1",
      ...sub,
      globalDigestEnabled: true,
      environmentDigestEnabled: false,
    });

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

    const req = new Request("http://localhost/api/threat-intelligence/subscription", {
      method: "POST",
      body: JSON.stringify({ isSubscribed: true, minRisk: "High", cisaKevOnly: false, scheduledHour: 8, scheduledMinute: 0 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when scheduledMinute out of range", async () => {
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
