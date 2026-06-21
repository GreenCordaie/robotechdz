# P3-3 — `addSharedAccount` credential-ownership design (decision)

> Design spec for the LAST piece of P3-3 (admin account-CRUD proxy). The
> `deleteSharedAccount` proxy + LoadBrain `DELETE /internal/account/:id` are
> DONE (boutique c34fcd4, LoadBrain 6404635). **Account CREATION** is documented
> here rather than coded blind, because it touches Microsoft Graph credentials
> across two systems and cannot be validated without both running live.

## The problem

`addSharedAccount` (`src/app/admin/comptes-partages/actions.ts` →
`AccountService.addSharedAccountInternal`) creates a master shared account that
holds TWO classes of secret:

1. **Netflix login** — `digital_codes.code = "email | password"` (AES-256-GCM,
   boutique `ENCRYPTION_KEY`). Delivered to the customer at `/activer`.
2. **Microsoft Graph mailbox auth** — `ms_account_email` + an encrypted
   `ms_refresh_token` (+ `outlook_password`), used to poll the inbox for Netflix
   OTP / household links. Onboarded today via the boutique's MS OAuth flow
   (`getMicrosoftAuthUrlAction`).

LoadBrain `netflix.accounts` mirrors these: `ms_account_email`,
`ms_refresh_token_encrypted` (LoadBrain's own key + AAD), `ms_status`. LoadBrain
**already runs its own MS Graph mailbox worker** (`startMailboxWorker`). So in
the centralized model the mailbox-polling authority is LoadBrain — the question
is only HOW the MS credentials get there.

## The fork

### Option A — LoadBrain owns MS Graph onboarding (RECOMMENDED)
- Boutique `addSharedAccount` proxies a **create** to a new LoadBrain
  `POST /internal/account` with the Netflix identity (profile names, slot
  count) + a marker, creating the account with `ms_status='PENDING_ONBOARD'`.
- The operator completes the **MS OAuth on the LoadBrain dashboard** (LoadBrain
  mints + encrypts its own `ms_refresh_token` with its own key/AAD).
- The boutique keeps the Netflix login (for `/activer` delivery) mirrored, but
  **never transmits an MS secret cross-system**.
- **Pros:** no plaintext/re-encrypted secret crosses the boundary; one OAuth
  owner; matches "LoadBrain = system of record"; smallest blast radius.
- **Cons:** a 2-step onboarding (create in boutique → finish MS on LoadBrain).
  Mitigate with a clear "MS onboarding pending on LoadBrain" badge in the
  boutique admin.

### Option B — Boutique transfers the encrypted MS refresh token
- `addSharedAccount` decrypts its `ms_refresh_token` (boutique key) and sends it
  to LoadBrain, which **re-encrypts** under its own versioned key + AAD.
- **Pros:** single onboarding UX (stays in the boutique).
- **Cons:** a long-lived MS secret crosses the wire + lands in two ciphertext
  domains; needs a hardened internal transport (already X-Internal-Token, but
  the payload is a refresh token); rotation/expiry coupling across systems.
  Higher security surface.

## Decision

**Adopt Option A.** No cross-system MS secret transfer. The boutique create-proxy
registers the account; MS Graph onboarding is completed on LoadBrain (which
already owns the mailbox worker). This keeps the security boundary clean and is
consistent with the rest of P3 (LoadBrain authoritative, boutique replica).

## Implementation sketch (when scheduled, on a live stack)

- **LoadBrain** `POST /internal/account` (in `routes/internal/account-write.ts`,
  next to the delete): create `netflix.accounts` row, `ms_status='PENDING_ONBOARD'`,
  tenant-scoped, X-Internal-Token; return `{ accountId }`. TDD vs `netflix_test`.
- **Boutique** admin client `createAccountRemote({ siteId, ... })` (degrade-soft,
  like the others) + `addSharedAccount` calls it post-commit, stamps the returned
  `accountId` into `digital_codes.lb_account_id`, gated on the flag.
- **Admin UI**: surface `ms_status=PENDING_ONBOARD` with a deep link to the
  LoadBrain dashboard MS-onboarding page.
- **Validation**: requires BOTH systems live + a real MS test tenant — the
  reason this is a design, not blind code: the OAuth handoff and the 2-step UX
  must be exercised end-to-end before shipping a credential path.

## Status

- `deleteSharedAccount` proxy + LoadBrain delete route: ✅ DONE.
- `addSharedAccount` (this design): decision locked (Option A); implementation
  scheduled for when the stack is live + MS test tenant available.
- `updateSharedAccount` device-cap proxy (maxDevices → max_uses): ✅ DONE (P3-3
  slot-quota slice).
- `linkProductToSharing` / `generateMissingSlots`: stay local (boutique catalog
  concepts, no LoadBrain equivalent).
