/**
 * One-shot, idempotent backfill: encrypt existing cleartext secret columns in
 * `shop_settings` so reads through the `encryptedText` Drizzle type are uniform.
 *
 * Run BEFORE/with the deploy that ships the encrypted columns:
 *   npx tsx scripts/backfill-encrypt-settings.ts
 *
 * Uses a RAW SQL connection on purpose: it must read the true stored bytes,
 * bypassing the Drizzle custom type (which would auto-decrypt). Idempotent —
 * already-encrypted values are left untouched, so it is safe to re-run.
 */
import postgres from "postgres";
import { planSecretEncryption } from "../src/lib/encryption";

// DB column names (snake_case) for the 8 encrypted secret columns.
const SECRET_COLUMNS = [
    "telegram_bot_token",
    "whatsapp_token",
    "whatsapp_api_key",
    "whatsapp_verify_token",
    "gemini_api_key",
    "vapid_private_key",
    "microsoft_client_secret",
    "netflix_resolver_password",
] as const;

async function main(): Promise<void> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error("DATABASE_URL must be set");
        process.exit(1);
    }

    const sql = postgres(connectionString, { max: 1 });
    let rowsTouched = 0;
    let valuesEncrypted = 0;

    try {
        const cols = SECRET_COLUMNS.join(", ");
        const rows = await sql.unsafe(`SELECT id, ${cols} FROM shop_settings`);

        for (const row of rows) {
            const updates: Record<string, string | null> = {};
            for (const col of SECRET_COLUMNS) {
                const plan = planSecretEncryption(row[col] as string | null);
                if (plan.changed) {
                    updates[col] = plan.next;
                    valuesEncrypted++;
                }
            }
            const changedCols = Object.keys(updates);
            if (changedCols.length === 0) continue;

            const setClause = changedCols.map((c, i) => `${c} = $${i + 1}`).join(", ");
            const params = changedCols.map((c) => updates[c]);
            await sql.unsafe(
                `UPDATE shop_settings SET ${setClause} WHERE id = $${changedCols.length + 1}`,
                [...params, row.id],
            );
            rowsTouched++;
        }

        console.log(
            `✅ Backfill done — ${valuesEncrypted} secret value(s) encrypted across ${rowsTouched} row(s). ` +
            `Re-running is a no-op.`,
        );
    } catch (err) {
        console.error("❌ Backfill failed:", err instanceof Error ? err.message : err);
        process.exitCode = 1;
    } finally {
        await sql.end();
    }
}

main();
