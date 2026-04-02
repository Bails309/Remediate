import { describe, it, expect, vi } from "vitest";
import { encrypt, decrypt, fingerprintSecret } from "../../lib/crypto";

describe("crypto utils", () => {
    const plainText = "my-secret-payload";

    it("should encrypt and decrypt correctly", () => {
        const encrypted = encrypt(plainText);
        expect(encrypted).not.toBe(plainText);
        expect(encrypted.split(":").length).toBe(3);

        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(plainText);
    });

    it("should produce different ciphertexts for the same plaintext (IV randomness)", () => {
        const enc1 = encrypt(plainText);
        const enc2 = encrypt(plainText);
        expect(enc1).not.toBe(enc2);
    });

    it("should throw error for invalid internal structure", () => {
        expect(() => decrypt("short:payload")).toThrow("Invalid encrypted payload");
    });

    it("should throw for corrupted ciphertext (tampered tag)", () => {
        const encrypted = encrypt(plainText);
        const parts = encrypted.split(":");
        // Tamper with the auth tag
        const badTag = Buffer.from("0000000000000000", "hex").toString("base64");
        const corrupted = `${parts[0]}:${badTag}:${parts[2]}`;
        expect(() => decrypt(corrupted)).toThrow();
    });

    it("fingerprintSecret returns a stable 12-char hex hash", () => {
        const fp = fingerprintSecret("my-secret");
        expect(fp).toHaveLength(12);
        expect(fp).toMatch(/^[0-9a-f]{12}$/);
        expect(fingerprintSecret("my-secret")).toBe(fp);
        // different input → different hash
        expect(fingerprintSecret("other")).not.toBe(fp);
    });

    it("should throw error if AUTH_SECRET is missing", () => {
        const originalSecret = process.env.AUTH_SECRET;
        delete process.env.AUTH_SECRET;

        // Re-importing or accessing the module if it caches the secret
        // Note: lib/crypto.ts reads secret at module level.
        // We might need to mock the environment variable before importing or use vi.stubEnv

        vi.stubEnv("AUTH_SECRET", "");
        expect(() => encrypt("test")).toThrow("AUTH_SECRET is required");

        vi.stubEnv("AUTH_SECRET", originalSecret || "");
    });
});
