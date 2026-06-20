/**
 * Seed fixture for tests/e2e/16-netflix-sale-authority.spec.ts (P2-6 / P3-5).
 *
 * Creates a MIRRORED shared-streaming account across BOTH systems so a real
 * sale can route allocation through LoadBrain, with the public_token aligned on
 * each side (the boutique resolves the LoadBrain-claimed slot back to its local
 * mirror by token):
 *
 *   LoadBrain (netflix DB)         Boutique (flexbox DB)
 *   ─────────────────────         ─────────────────────
 *   netflix.accounts        ◄──── digital_codes.lb_account_id   (DISPONIBLE)
 *   netflix.slots (AVAILABLE)      digital_code_slots (DISPONIBLE)
 *     public_token = TOKEN_i  ════  slot_activation_tokens.token = TOKEN_i
 *
 * Pre-sale state: both sides AVAILABLE/DISPONIBLE, tokens aligned, account
 * linked via lb_account_id, boutique slots carry NO lb_slot_id yet (the sale
 * sets it). The e2e then: buys the isSharing variant (flag ON) → P2 allocates
 * via LoadBrain → mirror flips VENDU + lb_slot_id; refund → release both sides;
 * a 1-slot pool proves anti-double-sell.
 *
 * Idempotent: prior fixture (fixed tokens + marker account email) is deleted on
 * every run.
 *
 * Run (operator / playwright globalSetup):
 *   DATABASE_URL=postgresql://user:pass@host:5435/flexbox \
 *   LOADBRAIN_DATABASE_URL=postgresql://loadbrain:...@host:5433/netflix_test \
 *   ENCRYPTION_KEY=<boutique key> \
 *   LOADBRAIN_SITE_ID=<uuid of AGENT007's site> \
 *   E2E_SA_SLOTS=2 E2E_SA_MAX_DEVICES=2 \
 *   node scripts/seed-netflix-sale-authority-e2e.js
 *
 * Falls back to parsing ./.env for DATABASE_URL/ENCRYPTION_KEY when absent.
 * Prints ONE line of JSON to stdout: the fixture descriptor (for the harness).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const postgres = require("postgres");

const ACCOUNT_MARKER_EMAIL = "e2e-sale-authority@example.test";
const TOKEN_PREFIX = "E2ESATOKEN"; // + 6-digit index = 16 chars, base64url-safe.

// ── Minimal .env loader (no dotenv dep) ──────────────────────────────────────
function loadDotEnv() {
    try {
        const raw = fs.readFileSync(path.resolve(__dirname, "..", ".env"), "utf8");
        for (const line of raw.split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
            if (!m) continue;
            const key = m[1];
            if (process.env[key]) continue;
            let val = m[2].trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            process.env[key] = val;
        }
    } catch {
        /* .env optional */
    }
}
loadDotEnv();

const DATABASE_URL = process.env.DATABASE_URL;
const LOADBRAIN_DATABASE_URL = process.env.LOADBRAIN_DATABASE_URL;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const SITE_ID = process.env.LOADBRAIN_SITE_ID;
const N_SLOTS = Math.max(1, Number(process.env.E2E_SA_SLOTS || 2));
const MAX_DEVICES = process.env.E2E_SA_MAX_DEVICES ? Number(process.env.E2E_SA_MAX_DEVICES) : 2;
const VARIANT_ID_OVERRIDE = process.env.E2E_SA_VARIANT_ID ? Number(process.env.E2E_SA_VARIANT_ID) : null;

function die(msg) {
    console.error(`[seed-sa-e2e] ${msg}`);
    process.exit(1);
}
if (!DATABASE_URL) die("DATABASE_URL missing (boutique flexbox)");
if (!LOADBRAIN_DATABASE_URL) die("LOADBRAIN_DATABASE_URL missing (LoadBrain netflix DB)");
if (!ENCRYPTION_KEY) die("ENCRYPTION_KEY missing (boutique AES-256-GCM key)");
if (!SITE_ID) die("LOADBRAIN_SITE_ID missing (uuid of AGENT007's site)");
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(SITE_ID)) {
    die(`LOADBRAIN_SITE_ID must be a uuid (got "${SITE_ID}")`);
}

// ── Mirror of src/lib/encryption.ts encrypt() (AES-256-GCM, iv.tag.data hex) ──
function encrypt(text) {
    const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let enc = cipher.update(text, "utf8", "hex");
    enc += cipher.final("hex");
    return `${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${enc}`;
}

const tokenFor = (i) => `${TOKEN_PREFIX}${String(i).padStart(6, "0")}`; // 16 chars

async function main() {
    const tokens = Array.from({ length: N_SLOTS }, (_, i) => tokenFor(i));
    const boutique = postgres(DATABASE_URL, { max: 2 });
    const lb = postgres(LOADBRAIN_DATABASE_URL, { max: 2 });

    try {
        // ── Resolve a sellable isSharing variant on the boutique ──────────────
        let variantId = VARIANT_ID_OVERRIDE;
        if (variantId == null) {
            const rows = await boutique`SELECT id FROM product_variants WHERE is_sharing = true ORDER BY id LIMIT 1`;
            if (rows.length === 0) {
                die("no is_sharing product_variant found — create one (or pass E2E_SA_VARIANT_ID)");
            }
            variantId = Number(rows[0].id);
        }

        // ── Idempotency: drop prior fixture on BOTH sides ─────────────────────
        // Boutique: by the fixed tokens.
        const priorSlots = await boutique`
            SELECT s.id AS slot_id, s.digital_code_id
              FROM slot_activation_tokens t
              JOIN digital_code_slots s ON s.id = t.slot_id
             WHERE t.token IN ${boutique(tokens)}`;
        const priorCodeIds = [...new Set(priorSlots.map((r) => r.digital_code_id))];
        if (priorSlots.length > 0) {
            const slotIds = priorSlots.map((r) => r.slot_id);
            await boutique`DELETE FROM slot_events WHERE slot_id IN ${boutique(slotIds)}`;
            await boutique`DELETE FROM slot_activation_tokens WHERE slot_id IN ${boutique(slotIds)}`;
            await boutique`DELETE FROM digital_code_slots WHERE id IN ${boutique(slotIds)}`;
        }
        if (priorCodeIds.length > 0) {
            await boutique`DELETE FROM digital_codes WHERE id IN ${boutique(priorCodeIds)}`;
        }
        // LoadBrain: by public_token + the marker account.
        await lb`DELETE FROM netflix.slots WHERE public_token IN ${lb(tokens)}`;
        const priorAccts = await lb`
            SELECT id FROM netflix.accounts
             WHERE site_id = ${SITE_ID} AND ms_account_email = ${ACCOUNT_MARKER_EMAIL}`;
        if (priorAccts.length > 0) {
            const ids = priorAccts.map((r) => r.id);
            await lb`DELETE FROM netflix.slots WHERE account_id IN ${lb(ids)}`;
            await lb`DELETE FROM netflix.accounts WHERE id IN ${lb(ids)}`;
        }

        // ── LoadBrain: account + AVAILABLE slots (system of record) ───────────
        const [lbAccount] = await lb`
            INSERT INTO netflix.accounts
                (site_id, ms_account_email, ms_refresh_token_encrypted, ms_status, monitoring_intensity, auto_approve_household)
            VALUES
                (${SITE_ID}, ${ACCOUNT_MARKER_EMAIL}, ${"v1:e2e-encrypted-refresh-token"}, ${"CONNECTED"}, ${"NORMAL"}, ${true})
            RETURNING id`;
        const lbAccountId = lbAccount.id;

        const lbSlots = [];
        for (let i = 0; i < N_SLOTS; i++) {
            const [row] = await lb`
                INSERT INTO netflix.slots
                    (account_id, site_id, netflix_profile_name, netflix_profile_name_normalized,
                     customer_phone, external_order_ref, public_token, status, max_uses, expires_at)
                VALUES
                    (${lbAccountId}, ${SITE_ID}, ${`E2E SA ${i}`}, ${`e2e-sa-profil-${i}`},
                     NULL, NULL, ${tokens[i]}, ${"AVAILABLE"}, ${MAX_DEVICES}, now() + interval '45 days')
                RETURNING id, public_token`;
            lbSlots.push({ lbSlotId: row.id, publicToken: row.public_token });
        }

        // ── Boutique: master account (DISPONIBLE) linked via lb_account_id ────
        const accountCode = encrypt("e2e-sale-authority@example.test | s3cr3t-pass");
        const [dc] = await boutique`
            INSERT INTO digital_codes (variant_id, code, status, has_extra_member, lb_account_id)
            VALUES (${variantId}, ${accountCode}, 'DISPONIBLE', false, ${lbAccountId})
            RETURNING id`;

        const validUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        const boutiqueSlots = [];
        for (let i = 0; i < N_SLOTS; i++) {
            const pin = encrypt(`123${i}`);
            const [slot] = await boutique`
                INSERT INTO digital_code_slots
                    (digital_code_id, slot_number, status, code, profile_name, max_devices, devices_activated)
                VALUES (${dc.id}, ${i + 1}, 'DISPONIBLE', ${pin}, ${`E2E SA ${i}`}, ${MAX_DEVICES}, 0)
                RETURNING id`;
            await boutique`
                INSERT INTO slot_activation_tokens (token, slot_id, valid_until)
                VALUES (${tokens[i]}, ${slot.id}, ${validUntil})`;
            boutiqueSlots.push({ boutiqueSlotId: slot.id, token: tokens[i] });
        }

        // ── One JSON line for the harness ─────────────────────────────────────
        process.stdout.write(
            JSON.stringify({
                siteId: SITE_ID,
                lbAccountId,
                boutiqueDigitalCodeId: dc.id,
                variantId,
                maxDevices: MAX_DEVICES,
                slots: boutiqueSlots.map((b, i) => ({
                    token: b.token,
                    boutiqueSlotId: b.boutiqueSlotId,
                    lbSlotId: lbSlots[i].lbSlotId,
                })),
            }) + "\n",
        );
    } finally {
        await boutique.end();
        await lb.end();
    }
}

main().catch((err) => {
    console.error("[seed-sa-e2e] ERROR:", err && err.message ? err.message : err);
    process.exit(1);
});
