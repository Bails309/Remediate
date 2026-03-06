import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { requireUser } from "@/lib/rbac";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_EMAIL;
});

describe("requireUser", () => {
  it("throws when no session user email", async () => {
    (auth as unknown as jest.Mock) = auth as any;
    (auth as any).mockResolvedValue({});

    await expect(requireUser()).rejects.toThrow("Unauthorized");
  });

  it("returns session when id and role are present", async () => {
    (auth as any).mockResolvedValue({ user: { email: "a@b.com", id: "u1", role: "User" } });
    const session = await requireUser();
    expect(session.user.id).toBe("u1");
    expect(session.user.role).toBe("User");
  });

  it("creates user in DB when missing and assigns Admin role if ADMIN_EMAIL matches", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    (auth as any).mockResolvedValue({ user: { email: "admin@example.com", name: "Admin" } });

    (prisma as any).user.findUnique.mockResolvedValue(null);
    (prisma as any).user.create.mockResolvedValue({ id: "new-id", email: "admin@example.com", name: "Admin", role: "Admin" });

    const session = await requireUser();
    expect(prisma.user.create).toHaveBeenCalled();
    expect(session.user.id).toBe("new-id");
    expect(session.user.role).toBe("Admin");
  });
});
