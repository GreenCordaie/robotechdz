# COORDINATION — 100-pc-IA agents in-flight

**Chef projet** : Claude (session principale LoadBrain — voir LoadBrain/AGENTS.md)
**Repo** : `100-pc-IA` (boutique Next.js)
**Branche d'intégration** : `feat/bsv-mirror-integrated`
**Dernière MAJ** : 2026-05-28

> ⚠️ **AGENTS — LISEZ ÇA AVANT CHAQUE TÂCHE**
>
> 1. `git pull --rebase origin feat/bsv-mirror-integrated` avant toute édition
> 2. Vérifiez votre zone dans le **Status Board** ci-dessous
> 3. Si votre zone est marquée 🔒 LOCKED par quelqu'un d'autre → **STOP**
> 4. Quand vous finissez un lot : appendez votre ligne dans `STATUS.md`, puis push immédiatement
>
> Note : ce repo contient déjà un `AGENTS.md` (instructions n8n MCP). Ce fichier est **COORDINATION.md** — c'est lui que vous lisez pour la coord humaine/projet.

---

## 🎯 Status Board

| Agent | Domaine | Zone (paths) | Statut | Dernier commit |
|---|---|---|---|---|
| **Chef** | Coordination, intégration LoadBrain | `COORDINATION.md`, `STATUS.md`, `src/services/loadbrain-*.ts`, `drizzle/0021_*`, `drizzle/0022_*`, `src/services/slot-device-quota.service.ts` (pure fct) | 🟢 | `e34d645` backfill |
| **B1** | Auth/MFA hardening | `src/lib/mfa-ticket.ts`, `src/app/reseller/login/**`, `src/app/admin/login/**` (flow MFA), `tests/unit/mfa-ticket.test.ts` | 🟢 Fini (3 commits) | `d42199a` reseller MFA step 2 |
| **B2** | Errors/security (caisse, wallet, refund) | `src/lib/errors.ts`, `src/lib/orders.ts`, `src/services/order.service.ts`, `tests/unit/{errors,refund-reseller-wallet}.test.ts` | 🟢 Fini (2 commits) | `171c96e` refundResellerWallet helper |
| **B3** | Streaming watcher + TOCTOU quota | `src/workers/streaming-mailbox-watcher.worker.ts`, `src/app/activer/[token]/page.tsx` (rendering+quota), `src/services/slot-device-quota.service.ts` (bumpDeviceUsage DB call) | 🟢 Fini | `e6eb6d2` skip accounts without msAccountEmail |
| **B4** | Specs + CI | `docs/superpowers/specs/**`, `.github/workflows/**` | 🟢 Fini (2 commits) | `aee45f6` drop npm cache |
| **B5** | LoadBrain WhatsApp client + notifications | `src/lib/loadbrain-whatsapp.ts`, `src/lib/notification-events.ts`, `src/services/reseller-notifications.service.ts`, `src/services/notification-templates.service.ts` | 🟡 Possible WIP | inconnu |
| **B6** | Credentials encrypted-at-rest (spec 045f90a) | `src/db/encrypted-column.ts`, `src/db/schema.ts` (8 col. secrets), `src/lib/encryption.ts`, `src/app/admin/settings/actions.ts`, `scripts/backfill-encrypt-settings.ts`, `vitest.config.ts`, `scripts/start-dev.js` | 🟢 Fini Phase 1 (5 commits) — Phase 2 UI deferred | `b0e43c1` status |

🟢 = Done • 🟡 = In progress • 🔒 = Locked • ❌ = Blocked

> **⚠️ DEPLOY (B6)** : lancer `npx tsx scripts/backfill-encrypt-settings.ts` avant/avec le déploiement des commits `98d9459`..`b0e43c1` (chiffre les secrets cleartext existants ; idempotent).

---

## 🚫 Zones d'exclusion

| Si vous êtes... | Vous ne touchez PAS à... |
|---|---|
| B1 (MFA) | Caisse, wallet, streaming watcher, services LoadBrain |
| B2 (Errors) | Auth/MFA, streaming, notifications |
| B3 (Streaming/quota) | Auth, caisse, notifications |
| B4 (Specs/CI) | Tout sauf docs/ et .github/ |
| B5 (Notifications + LoadBrain whatsapp) | Auth, caisse, streaming watcher, `src/services/loadbrain-auto-approve.client.ts` (zone Chef) |
| Chef | Audit + intégration LoadBrain — commits prudents, jamais d'écrasement d'agent actif |

---

## 📝 Conventions commit

```
<type>(<module>): <description courte>

[body optionnel]
```

Types : `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `security`, `build`

---

## ✅ Pre-push checklist

- [ ] `git pull --rebase origin feat/bsv-mirror-integrated` (zéro conflit)
- [ ] `pnpm exec tsc --noEmit` clean
- [ ] `pnpm exec vitest run` clean (27/27 actuel)
- [ ] Aucun fichier hors de ta zone
- [ ] Ligne ajoutée dans `STATUS.md`

---

## 🔄 Sync vers LoadBrain

Si ton travail touche le hybrid LoadBrain :
1. Ex: nouveaux champs sur `digital_codes` ou `digital_code_slots` qui devraient remonter à `netflix.accounts` / `netflix.slots`
2. Append ligne `[SYNC-LOADBRAIN] <message>` dans `STATUS.md`
3. Push uniquement `STATUS.md`
4. Le chef synchronise les schemas côté LoadBrain et te répond

## 🆘 Escalade

Append `[BLOCKED] <ton-id>: <raison>` dans `STATUS.md`, push uniquement le fichier, attendre l'arbitrage.
