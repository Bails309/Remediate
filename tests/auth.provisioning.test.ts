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

    it("should provision a new user with web_app_user role by default", async () => {
        vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);

        await provisionUser({ user: normalUser as any, account: { provider: "keycloak" } as any });

        expect(prisma.user.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({
                    email: normalUser.email,
                    roles: ["web_app_user"],
                    authSource: "SSO"
                }),
            })
        );
    });

    it("should provision the primary admin with all admin roles", async () => {
        vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);

        await provisionUser({ user: primaryAdmin as any, account: { provider: "credentials" } as any });

        expect(prisma.user.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({
                    email: adminEmail,
                    roles: ["site_admin", "web_app_admin", "toolkit_admin", "web_app_user", "toolkit_user"],
                    authSource: "Local"
                }),
            })
        );
    });

    it("should preserve manually assigned roles for non-primary admin", async () => {
        const dashboardAdmin = { email: "secondary@example.com", name: "Secondary Admin" };
        (prisma.user.findUnique as any).mockResolvedValue({
            email: dashboardAdmin.email,
            roles: ["web_app_admin", "web_app_user"]
        });

        await provisionUser({ user: dashboardAdmin, account: { provider: "keycloak" } });

        expect(prisma.user.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                update: expect.objectContaining({
                    roles: ["web_app_admin", "web_app_user"]
                }),
            })
        );
    });

    it("should not demote manually assigned roles", async () => {
        const dashboardAdmin = { email: "secondary@example.com", name: "Secondary Admin" };
        (prisma.user.findUnique as any).mockResolvedValue({
            email: dashboardAdmin.email,
            roles: ["web_app_admin", "web_app_user"]
        });

        await provisionUser({ user: dashboardAdmin, account: { provider: "keycloak" } });

        // Verify it doesn't default back to "User"
        const upsertCall = vi.mocked(prisma.user.upsert).mock.calls[0][0];
        expect(upsertCall.update.roles).toEqual(["web_app_admin", "web_app_user"]);
    });
});
