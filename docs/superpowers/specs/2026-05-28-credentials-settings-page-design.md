# Credentials Settings Page — Design

**Date:** 2026-05-28
**Module:** ① Orders/Paiement/Stock referent (cross-cutting; touches shared `shop_settings`)
**Status:** Approved (design), pending implementation plan

## Purpose

Give SUPER_ADMIN a single, organized page to view and edit **all integration credentials** (WhatsApp, Telegram, Microsoft Graph, Gemini, push/VAPID, Netflix resolver, n8n), with secrets **encrypted at rest** instead of the current cleartext storage in `shop_settings`.

This fixes a known audit finding: secrets live in `shop_settings` in cleartext, so a DB dump leaks every token. Today these fields are also scattered across the 1579-line `SettingsContent.tsx`.

**Infrastructure secrets stay in `.env`** (`DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `LOADBRAIN_*`, R2, `REDIS_URL`, `CRON_SECRET`). They are bootstrap secrets and must not be editable from a web UI nor stored in the DB. Out of scope for this page.

## Scope — field classification

All fields below already exist on `shop_settings` (`src/db/schema.ts:240`).

**Secrets — encrypted at rest:**
`telegramBotToken`, `whatsappToken`, `whatsappApiKey`, `whatsappVerifyToken`, `geminiApiKey`, `vapidPrivateKey`, `microsoftClientSecret`, `netflixResolverPassword`.

**Config — stays cleartext (not secret), only regrouped in the UI:**
`telegramChatId`, `telegramChatIdAdmin`, `telegramChatIdCaisse`, `telegramChatIdTraiteur`, `whatsappApiUrl`, `whatsappInstanceName`, `whatsappPhoneId`, `whatsappWebhookUrl`, `webhookUrl`, `n8nWebhookUrl`, `vapidPublicKey`, `microsoftClientId`, `microsoftTenantId`, `microsoftRedirectUri`, `netflixResolverEmail`.

Rationale: URLs/IDs are not secrets, and `decrypt()` mis-parses cleartext containing dots (e.g. URLs) and returns `null` — so only true secrets go through encryption.

## Architecture — encryption mechanism (Option A: transparent Drizzle custom type)

Declare each secret column with a Drizzle `customType<{ data: string }>` (`encryptedText`) whose:
- `toDriver(value)` → `encrypt(value)` on write (`src/lib/encryption.ts`, AES-256-GCM, format `iv.authTag.data`).
- `fromDriver(value)` → `decrypt(value)` on read (already cleartext-tolerant for non-dotted legacy values).

Consequence: **all ~12 consumers** (telegram, whatsapp, gemini, microsoft-auth, push/VAPID, n8n, streaming watcher, reseller-notifications, etc.) read decrypted plaintext automatically with **zero consumer code changes**, including code owned by modules ② and ③. The only edited shared file is `src/db/schema.ts`.

Rejected alternatives:
- **Centralized accessor service** (`getDecryptedCredentials()`): explicit but requires migrating each consumer (edits ②/③ files, risk of missing a site).
- **Decrypt at each call site**: most scattered, easy to miss one.

### Constraints to honor (verified during planning, not assumed)
1. **All reads of these columns go through Drizzle** (`db.query.shopSettings` / `select`), never raw SQL — otherwise the raw read returns ciphertext. Planning step: grep for raw `shop_settings` SQL reads and confirm none read secret columns.
2. **Backfill migration before deploy**: a one-shot script encrypts existing cleartext secret values once, so reads are uniform. Idempotent: skip values already in `iv.authTag.data` format (3 hex dot-separated parts that decode). Run as a guarded admin action or migration script.
3. `decrypt()` returns `null` on failure — the custom type's `fromDriver` must map `null`→`null`/empty and never throw, so a single bad value can't crash settings reads.

## Page / UI

- New section **"Credentials / Intégrations"** under `/admin/settings`, extracted into its own component (out of the 1579-line `SettingsContent.tsx`, which exceeds the 800-line limit).
- **SUPER_ADMIN only**: server actions wrapped in `withAuth({ roles: [UserRole.SUPER_ADMIN] })`; verify the `/admin/settings` middleware already restricts appropriately (SUPER_ADMIN guard exists in `middleware.ts`).
- Grouped sub-sections per integration: WhatsApp, Telegram, Microsoft Graph, Gemini, Push/VAPID, Netflix resolver, n8n.
- Each **secret** field renders:
  - masked placeholder (`••••••`) when set, never the value;
  - **Configuré / Manquant** badge derived from a boolean (`hasX`) computed server-side — the page load never ships secret values to the client;
  - **Révéler** button → dedicated server action returning the decrypted value for **one** field, gated SUPER_ADMIN and `logSecurityAction`-audited;
  - leaving a secret field blank on save = "keep current" (don't overwrite with empty).
- **Tester** button where cheap and useful: Telegram (`getMe`), WhatsApp (instance status), Microsoft (token acquisition). Optional per integration.
- Save is per-section (server action): encrypts secrets via the custom type (automatic on write), `logSecurityAction` per change **without logging the value**, `revalidatePath`.

## Data flow

1. Page (server component, SUPER_ADMIN) reads `shop_settings` → Drizzle auto-decrypts secrets → maps each secret to `hasX: boolean` (+ cleartext config values) → renders masked.
2. Reveal: client calls `revealCredentialAction(field)` → SUPER_ADMIN + audit → returns the single decrypted value.
3. Save: client submits a section → `updateCredentialsAction(section, values)` → SUPER_ADMIN + Zod validation → write via Drizzle (auto-encrypt) → audit + revalidate. Blank secret = unchanged.

## Security

- Infra secrets never enter the DB/UI (env-only).
- Secrets encrypted at rest (AES-256-GCM) — DB dump no longer leaks tokens.
- Secrets never sent to the client except via the explicit, audited reveal action.
- Audit log on every change and every reveal (action, field, userId — never the value).
- Already covered by `exportDatabaseAction`'s secret-redaction list (verify the newly-encrypted fields stay redacted / are now ciphertext anyway).

## Testing

- **Unit**: `encryptedText` custom type round-trips (`toDriver`→`fromDriver` = identity); `fromDriver` on legacy cleartext (no dots) returns it unchanged; `fromDriver` on `null`/garbage returns `null` without throwing.
- **Unit**: backfill is idempotent (already-encrypted value untouched; cleartext value becomes decryptable).
- **Manual/UI**: SUPER_ADMIN can view masked status, reveal one field (audited), save a section (secret persisted encrypted, blank = unchanged), and a non-SUPER_ADMIN is blocked. Verify one live integration still works end-to-end after migration (e.g. Telegram notification) to confirm transparent decryption.

## Coordination (multi-agent)

`shop_settings` is read by modules ② and ③. Editing `src/db/schema.ts` is a shared seam → post a heads-up on `[[team-coordination]]` before changing the schema, and confirm no teammate has an uncommitted `schema.ts` edit. The transparent custom type benefits their consumers (auto-decrypt) but they must be aware reads now return decrypted values and raw SQL reads would see ciphertext.

## Out of scope (YAGNI)

- Editing infra/.env secrets from the UI.
- A read-only ".env status" panel (user chose integrations-only).
- Secret rotation scheduling, versioning, or per-secret access roles beyond SUPER_ADMIN.
- Re-encryption/key-rotation tooling for the existing `ENCRYPTION_KEY`→`SESSION_SECRET` fallback (tracked separately).
