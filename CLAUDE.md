# 100-pc-IA — Ruflo Unified Orchestration

> **Single Chef across BOTH projects.** `chef` agent orchestrates 100-pc-IA (B1-B6) AND LoadBrain (A1-A9, located at `C:\Users\PC\Desktop\LoadBrain`). Work in either project routes through the same chef for cross-repo coherence.
>
> **Sister project**: `C:\Users\PC\Desktop\LoadBrain` (multi-module platform, branch `feat/bsv-bulletproof-and-listings`). Coord doc there = `AGENTS.md`.
>
> **This project's coord doc = `COORDINATION.md`** (NOT this `AGENTS.md` which contains n8n MCP instructions and is unrelated to orchestration).

## Mandatory pre-flight

Before any task, read in this order:

1. `COORDINATION.md` — board B1-B6 (THIS project)
2. `STATUS.md` — live state
3. `C:\Users\PC\Desktop\LoadBrain\AGENTS.md` — sister project's board A1-A9
4. Memory: `ruflo memory search --query "<task keywords>" --namespace unified`

## Orchestration model

```
              You (user)
                  │
                  ▼
              [ chef ]   ← Queen across LoadBrain + 100-pc-IA
              /   |   \
         A1-A9   B1-B6   ruflo specialists
       (LoadBrain) (100-pc-IA)
```

- **Spawn `chef` first** with `Agent({ name: "chef", subagent_type: "chef" })`. Chef reads BOTH `AGENTS.md` (LoadBrain) + `COORDINATION.md` (here) and routes.
- For trivial single-file edits in your declared zone, bypass the chef.

## 100-pc-IA agent roster (B1-B6)

| Agent ID | Domain | Write zone |
|----------|--------|------------|
| `chef` | Cross-project orchestration + LoadBrain integration glue | `COORDINATION.md`, `STATUS.md`, `src/services/loadbrain-*.ts`, `drizzle/0021_*`, `drizzle/0022_*` |
| `b1-mfa` | Auth/MFA hardening | `src/lib/mfa-ticket.ts`, `src/app/{reseller,admin}/login/**` |
| `b2-errors` | Errors/wallet/refund/caisse | `src/lib/errors.ts`, `src/services/order.service.ts` |
| `b3-streaming` | Streaming watcher + TOCTOU quota | `src/workers/streaming-mailbox-watcher.worker.ts`, `src/app/activer/[token]/**` |
| `b4-specs-ci` | Specs + CI | `docs/superpowers/specs/**`, `.github/workflows/**` |
| `b5-notifications` | LoadBrain WhatsApp client (Option B / site AGENT007) | `src/lib/loadbrain-whatsapp.ts`, `src/services/reseller-notifications.service.ts` |
| `b6-encryption` | Credentials encrypted-at-rest | `src/db/encrypted-column.ts`, `src/lib/encryption.ts` |

Full agent definitions: `.claude/agents/100pcia/`.

## Cross-project link (CRITICAL)

- 100-pc-IA = boutique (Next.js). LoadBrain = plateforme (multi-module).
- Bridge : WhatsApp B2B + schémas synchronisés (`netflix.accounts`/`netflix.slots` ↔ `digital_codes`/`digital_code_slots`).
- B5 consumes the LoadBrain SDK surface (`packages/sdk/src/whatsapp.ts`).
- Branches en miroir : LoadBrain `feat/bsv-bulletproof-and-listings` ↔ 100-pc-IA `feat/bsv-mirror-integrated`.
- Site ID: `AGENT007`.

When you touch the shared schema → append `[SYNC-LOADBRAIN] <message>` to STATUS.md. Chef synchronises.

## Spawning chef

```javascript
Agent({
  name: "chef",
  subagent_type: "chef",
  prompt: "[task context]. Read COORDINATION.md + LoadBrain/AGENTS.md, decompose, delegate to the right A* or B* agent(s), audit, report back.",
  run_in_background: true
})
SendMessage({ to: "chef", summary: "task start", message: "[full work context]" })
```

## Shared-index git race (HARD rule)

Path-scoped commits only: `git commit <paths>`. Never `git add .`/`-A`. Don't force-push the shared branch to fix a contaminated commit — flag in STATUS.md.

---

# 100-pc-IA Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-30

## Active Technologies
- TypeScript 5 + Next.js 14.2 App Router, Drizzle ORM, Zod, `src/lib/telegram.ts`, `src/lib/security.ts` (withAuth) (002-refund-return-workflow)
- PostgreSQL — table `orders` (ajout champ JSONB), tables existantes `clientPayments`, `auditLogs`, `digitalCodes`, `clients` (002-refund-return-workflow)
- TypeScript 5 + Next.js 14.2 App Router, Drizzle ORM, `src/lib/telegram.ts` (existant), `src/lib/security.ts` (withAuth, getCurrentUser) (003-monitoring-observability)
- Mémoire uniquement (tableau circulaire 1000 entrées) — zero migration DB (003-monitoring-observability)
- [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION] + [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION] (003-monitoring-observability)
- [if applicable, e.g., PostgreSQL, CoreData, files or N/A] (003-monitoring-observability)
- TypeScript 5 / Next.js 14.2 App Router + Drizzle ORM, Zod, BullMQ, **Microsoft Graph API** (009-netflix-household-resolver — stack reality verified 2026-05-30: `src/workers/streaming-mailbox-watcher.worker.ts` polls MS Graph via `NetflixResolverService.resolve()` against `account.msAccountEmail`, intensity-gated polling. The earlier "imapflow + mailparser" plan was not the implementation that shipped.)
- PostgreSQL — ajout colonne `outlook_password` dans `digital_codes` (009-netflix-household-resolver)
- TypeScript 5 + Next.js 14.2 App Router + Drizzle ORM, Zustand (`useSettingsStore`), Tailwind CSS, Zod (011-white-label-branding)
- PostgreSQL — `shop_settings` table (all required columns already exist) (011-white-label-branding)

- TypeScript 5 / React 19 (Next.js 15 App Router) + Tailwind CSS, Zustand (`useKioskStore`, `useSettingsStore`), `next/image`, `@/lib/formatters` (001-catalogue-view-redesign)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

npm test; npm run lint

## Code Style

TypeScript 5 / React 19 (Next.js 15 App Router): Follow standard conventions

## Recent Changes
- 011-white-label-branding: Added TypeScript 5 + Next.js 14.2 App Router + Drizzle ORM, Zustand (`useSettingsStore`), Tailwind CSS, Zod
- 009-netflix-household-resolver: Added TypeScript 5 / Next.js 14.2 App Router + Drizzle ORM, Zod, BullMQ, **Microsoft Graph API** (verified 2026-05-30)
- 007-support-nav-notifications: Improved Support UI with cross-view navigation and unread status tracking.


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
