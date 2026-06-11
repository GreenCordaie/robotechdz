import { customType } from "drizzle-orm/pg-core";
import { encrypt, decrypt } from "@/lib/encryption";

/**
 * Plaintext → ciphertext on write. Empty/null pass through untouched so a blank
 * value stays blank (and `encrypt` itself is a no-op on "").
 */
export function encryptToDriver(value: string): string {
    if (value == null || value === "") return value;
    return encrypt(value);
}

/**
 * Ciphertext → plaintext on read. Fail-safe: `null` stays `null`, and a corrupt
 * value (decrypt → null) maps to "" instead of throwing, so one bad row can't
 * crash a settings read. Legacy cleartext without dots is returned unchanged.
 */
export function decryptFromDriver(value: string): string {
    if (value == null) return value;
    return decrypt(value) ?? "";
}

/**
 * Transparent encrypted `text` column (AES-256-GCM via `@/lib/encryption`).
 *
 * Consumers reading through Drizzle (`db.query.*` / `db.select`) get plaintext
 * with zero code changes. Raw SQL reads would see ciphertext — always use
 * Drizzle for columns declared with this type.
 */
export const encryptedText = customType<{ data: string; driverData: string }>({
    dataType() {
        return "text";
    },
    toDriver: encryptToDriver,
    fromDriver: decryptFromDriver,
});
