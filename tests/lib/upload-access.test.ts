import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    uploadHistory: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rbac", () => ({
  WEB_APP_ADMIN_ROLES: ["site_admin", "web_app_admin"],
  hasAnyRole: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { hasAnyRole } from "@/lib/rbac";
import { canAccessUpload } from "@/lib/upload-access";

describe("canAccessUpload", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns true for admin users without querying upload ownership", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(true);

    const result = await canAccessUpload({ user: { id: "u-admin", roles: ["site_admin"] } } as any, "upload-1");

    expect(result).toBe(true);
    expect(prisma.uploadHistory.findUnique).not.toHaveBeenCalled();
  });

  it("returns true when non-admin user owns the upload", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(false);
    vi.mocked(prisma.uploadHistory.findUnique).mockResolvedValue({ uploadedBy: "u-1" } as any);

    const result = await canAccessUpload({ user: { id: "u-1", roles: ["web_app_user"] } } as any, "upload-1");

    expect(result).toBe(true);
    expect(prisma.uploadHistory.findUnique).toHaveBeenCalledWith({
      where: { id: "upload-1" },
      select: { uploadedBy: true },
    });
  });

  it("returns false when non-admin user does not own the upload", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(false);
    vi.mocked(prisma.uploadHistory.findUnique).mockResolvedValue({ uploadedBy: "u-2" } as any);

    const result = await canAccessUpload({ user: { id: "u-1", roles: ["web_app_user"] } } as any, "upload-1");

    expect(result).toBe(false);
  });

  it("returns false when upload does not exist", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(false);
    vi.mocked(prisma.uploadHistory.findUnique).mockResolvedValue(null);

    const result = await canAccessUpload({ user: { id: "u-1", roles: ["web_app_user"] } } as any, "missing-upload");

    expect(result).toBe(false);
  });
});
