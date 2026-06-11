import { describe, it, expect, vi } from "vitest";

// encryption.ts reads the key at module load; guarantee one before imports run.
vi.hoisted(() => {
    process.env.ENCRYPTION_KEY ||= "test_encryption_key_for_encrypted_settings_unit";
});

import { encrypt, decrypt, isEncrypted, planSecretEncryption } from "@/lib/encryption";
import { encryptToDriver, decryptFromDriver } from "@/db/encrypted-column";

describe("encryptedText custom type (toDriver/fromDriver)", () => {
    it("round-trips a secret to its original plaintext", () => {
        const secret = "123456789:AAH-very_secret.token.with.dots";
        const stored = encryptToDriver(secret);
        expect(stored).not.toBe(secret);
        expect(isEncrypted(stored)).toBe(true);
        expect(decryptFromDriver(stored)).toBe(secret);
    });

    it("passes empty string through unchanged on write and read", () => {
        expect(encryptToDriver("")).toBe("");
        expect(decryptFromDriver("")).toBe("");
    });

    it("maps null through unchanged (never throws)", () => {
        expect(encryptToDriver(null as unknown as string)).toBe(null);
        expect(decryptFromDriver(null as unknown as string)).toBe(null);
    });

    it("returns legacy dot-less cleartext unchanged on read", () => {
        expect(decryptFromDriver("plaintoken_no_dots")).toBe("plaintoken_no_dots");
    });

    it("maps a corrupt/garbage dotted value to empty string without throwing", () => {
        expect(() => decryptFromDriver("aaaa.bbbb.cccc")).not.toThrow();
        expect(decryptFromDriver("aaaa.bbbb.cccc")).toBe("");
    });
});

describe("isEncrypted", () => {
    it("is true only for values produced by encrypt", () => {
        expect(isEncrypted(encrypt("hello"))).toBe(true);
    });

    it("is false for cleartext (dotted and dot-less), null and empty", () => {
        expect(isEncrypted("plain")).toBe(false);
        expect(isEncrypted("https://example.com/webhook")).toBe(false);
        expect(isEncrypted("a.b.c")).toBe(false);
        expect(isEncrypted(null)).toBe(false);
        expect(isEncrypted("")).toBe(false);
    });
});

describe("planSecretEncryption (backfill idempotency)", () => {
    it("encrypts cleartext into a decryptable ciphertext", () => {
        const plan = planSecretEncryption("AIzaSyExampleGeminiKey");
        expect(plan.changed).toBe(true);
        expect(decrypt(plan.next!)).toBe("AIzaSyExampleGeminiKey");
    });

    it("leaves an already-encrypted value untouched (idempotent re-run)", () => {
        const once = planSecretEncryption("super-secret");
        expect(once.changed).toBe(true);
        const twice = planSecretEncryption(once.next);
        expect(twice.changed).toBe(false);
        expect(twice.next).toBe(once.next);
    });

    it("skips null and empty values", () => {
        expect(planSecretEncryption(null)).toEqual({ changed: false, next: null });
        expect(planSecretEncryption(undefined)).toEqual({ changed: false, next: null });
        expect(planSecretEncryption("")).toEqual({ changed: false, next: "" });
    });
});
