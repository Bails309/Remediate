import { describe, it, expect, vi, beforeEach } from "vitest";
import { provisionUser } from "../lib/auth-provisioning";
import { prisma } from "../lib/prisma";

vi.mock("../lib/prisma", () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

describe("Auth Provisioning", () => {
    const adminEmail = "admin@example.com";
    const normalUser = { email: "user@example.com", name: "User" };
    const primaryAdmin = { email: adminEmail, name: "Admin" };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv("ADMIN_EMAIL", adminEmail);
        vi.stubEnv("LOCAL_AUTH_EMAIL", adminEmail);
    });

    it("should provision a new user as 'User' by default", async () => {
        vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);

        await provisionUser({ user: normalUser as any, account: { provider: "keycloak" } as any });

        expect(prisma.user.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({
                    email: normalUser.email,
                    role: "User",
                    authSource: "SSO"
                }),
            })
        );
    });

    it("should provision the primary admin as 'Admin'", async () => {
        vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);

        await provisionUser({ user: primaryAdmin as any, account: { provider: "credentials" } as any });

        expect(prisma.user.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({
                    email: adminEmail,
                    role: "Admin",
                    authSource: "Local"
                }),
            })
        );
    });

    it("should preserve manually assigned 'Admin' role for non-primary admin", async () => {
        const dashboardAdmin = { email: "secondary@example.com", name: "Secondary Admin" };
        (prisma.user.findUnique as any).mockResolvedValue({
            email: dashboardAdmin.email,
            role: "Admin"
        });

        await provisionUser({ user: dashboardAdmin, account: { provider: "keycloak" } });

        expect(prisma.user.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                update: expect.objectContaining({
                    role: "Admin"
                }),
            })
        );
    });

    it("should not demote manually assigned Admin", async () => {
        const dashboardAdmin = { email: "secondary@example.com", name: "Secondary Admin" };
        (prisma.user.findUnique as any).mockResolvedValue({
            email: dashboardAdmin.email,
            role: "Admin"
        });

        await provisionUser({ user: dashboardAdmin, account: { provider: "keycloak" } });

        // Verify it doesn't default back to "User"
        const upsertCall = vi.mocked(prisma.user.upsert).mock.calls[0][0];
        expect(upsertCall.update.role).toBe("Admin");
    });
});
