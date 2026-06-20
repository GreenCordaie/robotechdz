/**
 * Seed fixture for tests/e2e/14-netflix-activation-webhook.spec.ts
 *
 * Creates a self-contained, re-runnable activation chain on the boutique DB:
 *   digital_codes  →  digital_code_slots (max_devices = NULL ⇒ unlimited)
 *                  →  slot_activation_tokens (token = E2E_NF_TOKEN, future valid_until)
 *
 * The slot's account `code` is encrypted with the SAME AES-256-GCM scheme the
 * app uses (src/lib/encryption.ts), reading the real ENCRYPTION_KEY, so the
 * /activer page decrypts the email cleanly and renders without error.
 *
 * `max_devices = NULL` means the device-quota guard treats the slot as
 * unlimited, so the spec can be re-run any number of times without ever
 * tripping the "Limite d'appareils atteinte" screen.
 *
 * Idempotent: the fixed token is deleted+reinserted on every run.
 *
 * Run (env injected by the operator / playwright globalSetup):
 *   DATABASE_URL=... ENCRYPTION_KEY=... node scripts/seed-netflix-activation-e2e.js
 * It also falls back to parsing ./.env when those vars are absent.
 *
 * Prints exactly one line to stdout: the token string (for capture by callers).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const postgres = require("postgres");

// Fixed token used by the spec. ≤ 16 chars (column is varchar(16)).
const E2E_NF_TOKEN = "E2E-NF-TOK-001";
const VARIANT_ID = Number(process.env.E2E_NF_VARIANT_ID || 1); // 1 = "NETFLIX 45 JOURS" in flexbox

// ── Minimal .env loader (no dotenv dep) ──────────────────────────────────────
function loadDotEnv() {
    try {
        const envPath = path.resolve(__dirname, "..", ".env");
        const raw = fs.readFileSync(envPath, "utf8");
        for (const line of raw.split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
            if (!m) continue;
            const key = m[1];
            if (process.env[key]) continue; // explicit env wins
            let val = m[2].trim();
            if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
            ) {
                val = val.slice(1, -1);
            }
            process.env[key] = val;
        }
    } catch {
        // .env optional when env already injected
    }
}
loadDotEnv();

const DATABASE_URL = process.env.DATABASE_URL;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET;
if (!DATABASE_URL) {
    console.error("[seed-nf-e2e] DATABASE_URL missing");
    process.exit(1);
}
if (!ENCRYPTION_KEY) {
    console.error("[seed-nf-e2e] ENCRYPTION_KEY (or SESSION_SECRET) missing");
    process.exit(1);
}

// ── Mirror of src/lib/encryption.ts encrypt() (AES-256-GCM, iv.tag.data hex) ──
function encrypt(text) {
    const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let enc = cipher.update(text, "utf8", "hex");
    enc += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}.${tag}.${enc}`;
}

async function main() {
    const sql = postgres(DATABASE_URL, { max: 2 });
    try {
        // Idempotency: drop any prior fixture tied to this token.
        // slot_activation_tokens → digital_code_slots → digital_codes cascade
        // is via FKs, but we delete explicitly to also clean the account.
        const existing = await sql`
            SELECT s.id AS slot_id, s.digital_code_id
            FROM slot_activation_tokens t
            JOIN digital_code_slots s ON s.id = t.slot_id
            WHERE t.token = ${E2E_NF_TOKEN}
        `;
        if (existing.length > 0) {
            const slotId = existing[0].slot_id;
            const dcId = existing[0].digital_code_id;
            await sql`DELETE FROM slot_events WHERE slot_id = ${slotId}`;
            await sql`DELETE FROM slot_activation_tokens WHERE slot_id = ${slotId}`;
            await sql`DELETE FROM digital_code_slots WHERE id = ${slotId}`;
            await sql`DELETE FROM digital_codes WHERE id = ${dcId}`;
        }

        // 1. Account (digital_codes). code = "email | password"; only the email
        //    is ever exposed to the browser by the activer page.
        const accountCode = encrypt("e2e-netflix@example.test | s3cr3t-pass");
        const [account] = await sql`
            INSERT INTO digital_codes (variant_id, code, status, has_extra_member)
            VALUES (${VARIANT_ID}, ${accountCode}, 'VENDU', false)
            RETURNING id
        `;

        // 2. Slot. max_devices = NULL ⇒ unlimited (re-runnable). PIN encrypted.
        const pinCode = encrypt("1234");
        const [slot] = await sql`
            INSERT INTO digital_code_slots
                (digital_code_id, slot_number, status, code, profile_name, max_devices, devices_activated)
            VALUES (${account.id}, 1, 'VENDU', ${pinCode}, 'E2E Profile', NULL, 0)
            RETURNING id
        `;

        // 3. Activation token, valid for 1 year.
        const validUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        await sql`
            INSERT INTO slot_activation_tokens (token, slot_id, valid_until)
            VALUES (${E2E_NF_TOKEN}, ${slot.id}, ${validUntil})
        `;

        // The ONLY stdout line: the token, for capture by the harness.
        process.stdout.write(E2E_NF_TOKEN + "\n");
    } finally {
        await sql.end();
    }
}

main().catch((err) => {
    console.error("[seed-nf-e2e] ERROR:", err && err.message ? err.message : err);
    process.exit(1);
});
