import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  user: { findUnique: vi.fn(), update: vi.fn() },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../auth", () => ({ auth: vi.fn() }));

import { auth } from "../../auth";

beforeEach(() => vi.clearAllMocks());

function postReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/tours/complete", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/tours/complete POST", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const { POST } = await import("../../app/api/tours/complete/route");
    const res = await POST(postReq({ tourId: "welcome-tour" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid tourId", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
    const { POST } = await import("../../app/api/tours/complete/route");
    const res = await POST(postReq({ tourId: "hacker-tour" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid tourId");
  });

  it("returns 400 when tourId is missing", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
    const { POST } = await import("../../app/api/tours/complete/route");
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });

  it("completes welcome-tour and marks both tours", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
    mockPrisma.user.findUnique.mockResolvedValue({ completedTours: [] });
    mockPrisma.user.update.mockResolvedValue({ completedTours: ["welcome-tour", "threat-intel-update-v1"] });

    const { POST } = await import("../../app/api/tours/complete/route");
    const res = await POST(postReq({ tourId: "welcome-tour" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.completedTours).toContain("welcome-tour");
    expect(body.completedTours).toContain("threat-intel-update-v1");

    // Verify deduplication: set is used
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isNewUser: false,
          completedTours: { set: ["welcome-tour", "threat-intel-update-v1"] },
        }),
      })
    );
  });

  it("deduplicates already-completed tours", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
    mockPrisma.user.findUnique.mockResolvedValue({ completedTours: ["welcome-tour"] });
    mockPrisma.user.update.mockResolvedValue({ completedTours: ["welcome-tour", "threat-intel-update-v1"] });

    const { POST } = await import("../../app/api/tours/complete/route");
    const res = await POST(postReq({ tourId: "welcome-tour" }));
    expect(res.status).toBe(200);

    // Should still result in exactly 2 unique tour IDs
    const setArg = mockPrisma.user.update.mock.calls[0][0].data.completedTours.set;
    expect(new Set(setArg).size).toBe(setArg.length);
  });

  it("accepts threat-intel-update-v1 individually", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
    mockPrisma.user.findUnique.mockResolvedValue({ completedTours: ["welcome-tour"] });
    mockPrisma.user.update.mockResolvedValue({ completedTours: ["welcome-tour", "threat-intel-update-v1"] });

    const { POST } = await import("../../app/api/tours/complete/route");
    const res = await POST(postReq({ tourId: "threat-intel-update-v1" }));
    expect(res.status).toBe(200);
  });

  it("accepts whats-new-apr-2026 and persists it", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
    mockPrisma.user.findUnique.mockResolvedValue({ completedTours: ["welcome-tour"] });
    mockPrisma.user.update.mockResolvedValue({ completedTours: ["welcome-tour", "whats-new-apr-2026"] });

    const { POST } = await import("../../app/api/tours/complete/route");
    const res = await POST(postReq({ tourId: "whats-new-apr-2026" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const setArg = mockPrisma.user.update.mock.calls[0][0].data.completedTours.set;
    expect(setArg).toContain("whats-new-apr-2026");
    expect(setArg).toContain("welcome-tour");
  });
});
