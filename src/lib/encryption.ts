import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || "default_fallback_key_32_chars_long_!";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts a string using AES-256-GCM.
 * Returns a string formatted as: iv.authTag.encryptedData (all hex)
 */
export function encrypt(text: string): string {
    if (!text) return text;

    // Ensure key is 32 bytes
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag().toString("hex");

    return `${iv.toString("hex")}.${authTag}.${encrypted}`;
}

/**
 * Decrypts a string formatted as: iv.authTag.encryptedData.
 * Returns the original plain text.
 */
export function decrypt(encryptedText: string): string {
    if (!encryptedText || !encryptedText.includes(".")) return encryptedText;

    try {
        const [ivHex, authTagHex, encryptedDataHex] = encryptedText.split(".");

        if (!ivHex || !authTagHex || !encryptedDataHex) return encryptedText;

        const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");
        const encryptedData = Buffer.from(encryptedDataHex, "hex");

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedData, undefined, "utf8");
        decrypted += decipher.final("utf8");

        return decrypted;
    } catch (error) {
        console.error("Decryption failed:", error);
        return encryptedText; // Return original if decryption fails (safeguard for migration)
    }
}
