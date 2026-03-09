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

  it("returns session when id and roles are present", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@b.com", id: "u1", roles: ["web_app_user"] } } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", email: "a@b.com", roles: ["web_app_user"], authSource: "Local" } as any);

    const session = await requireUser();
    expect(session.user.id).toBe("u1");
    expect(session.user.roles).toEqual(["web_app_user"]);
  });

  it("throws Unauthorized when user is missing from DB", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "deleted@example.com", name: "Deleted User" } } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow("Unauthorized");
  });
});
