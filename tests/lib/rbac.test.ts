import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { requireUser } from "@/lib/rbac";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.ADMIN_EMAIL;
});

describe("requireUser", () => {
  it("throws when no session user email", async () => {
    vi.mocked(auth).mockResolvedValue({} as any);

    await expect(requireUser()).rejects.toThrow("Unauthorized");
  });

  it("returns session when id and role are present", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@b.com", id: "u1", role: "User" } } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", email: "a@b.com", role: "User", authSource: "Local" } as any);

    const session = await requireUser();
    expect(session.user.id).toBe("u1");
    expect(session.user.role).toBe("User");
  });

  it("creates user in DB when missing and assigns Admin role if ADMIN_EMAIL matches", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    vi.mocked(auth).mockResolvedValue({ user: { email: "admin@example.com", name: "Admin" } } as any);

    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null) // requireUser check
      .mockResolvedValueOnce(null) // provisionUser check
      .mockResolvedValueOnce({ id: "new-id", email: "admin@example.com", name: "Admin", role: "Admin", authSource: "Local" } as any); // requireUser final check

    const session = await requireUser();
    expect(prisma.user.upsert).toHaveBeenCalled();
    expect(session.user.id).toBe("new-id");
    expect(session.user.role).toBe("Admin");
  });
});
