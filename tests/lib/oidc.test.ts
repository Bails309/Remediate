import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOidcConfigFromDb, upsertOidcConfig } from "../../lib/oidc";
import { prisma } from "../../lib/prisma";
import * as crypto from "../../lib/crypto";

vi.mock("../../lib/prisma", () => ({
    prisma: {
        oidcConfig: {
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
    },
}));

describe("OIDC logic", () => {
    const mockConfig = {
        clientId: "test-client",
        clientSecret: "test-secret",
        issuerUrl: "https://auth.example.com",
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should return null if no config in DB", async () => {
        vi.mocked(prisma.oidcConfig.findFirst).mockResolvedValue(null);
        const result = await getOidcConfigFromDb();
        expect(result).toBeNull();
    });

    it("should decrypt and return config from DB", async () => {
        const encryptedData = {
            id: 1,
            clientIdEnc: crypto.encrypt(mockConfig.clientId),
            clientSecretEnc: crypto.encrypt(mockConfig.clientSecret),
            issuerUrlEnc: crypto.encrypt(mockConfig.issuerUrl),
        };
        vi.mocked(prisma.oidcConfig.findFirst).mockResolvedValue(encryptedData as any);

        const result = await getOidcConfigFromDb();
        expect(result).toEqual(mockConfig);
    });

    it("should create new config if none exists", async () => {
        vi.mocked(prisma.oidcConfig.findFirst).mockResolvedValue(null);

        await upsertOidcConfig(mockConfig);

        expect(prisma.oidcConfig.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    clientIdEnc: expect.any(String),
                }),
            })
        );
    });

    it("should update existing config if it exists", async () => {
        vi.mocked(prisma.oidcConfig.findFirst).mockResolvedValue({ id: "existing-id" } as any);

        await upsertOidcConfig(mockConfig);

        expect(prisma.oidcConfig.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "existing-id" },
                data: expect.any(Object),
            })
        );
    });
});
