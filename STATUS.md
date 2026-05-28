# STATUS — 100-pc-IA in-flight work

> Append-only log. Format: `[YYYY-MM-DD HH:MM] [agent-id] [TYPE] message`
> Types: `WIP`, `DONE`, `BLOCKED`, `LOCK`, `UNLOCK`, `QUESTION`, `NOTE`, `SYNC-LOADBRAIN`

## Active locks

(none)

## Log

```
[2026-05-28 11:00] chef NOTE COORDINATION.md + STATUS.md créés. Coord active. AGENTS.md existant (n8n MCP) intact.
[2026-05-28 11:00] chef DONE Migration 0021_slot_device_quota + 0022_backfill_max_devices committed (e34d645).
[2026-05-28 11:00] chef DONE src/services/loadbrain-auto-approve.client.ts + slot-device-quota.service.ts shippés. Boutique appelle LoadBrain auto-approve.
[2026-05-28 11:00] chef NOTE B1-B4 ont push, B5 peut-être en cours (lib/loadbrain-whatsapp.ts +115 lignes vu dans diff).
[2026-05-28 11:00] chef NOTE TOCTOU fix /activer/[token] par B3 — atomic bumpDeviceUsage + secondary re-check intégré. Excellent.
[2026-05-28 13:58] B2 DONE Errors/security (caisse/wallet/refund). Commits: e3dcfe3 (C2 reseller refund → reseller_wallets+REFUND, plus de UPDATE resellers.balance), bf3a2f8 (FOR UPDATE anti-double cancel/refund/approve), cc29bb9 (clientPayments REMBOURSEMENT sur refundFullOrder), 57d5393 (UserError+toClientError anti-leak), 171c96e (helper réutilisable refundResellerWallet + tests). +12 tests (errors 8, refund-reseller-wallet 4). tsc 0, 257/257 verts.
[2026-05-28 13:58] B2 NOTE Découverte: fidélité client (clients.loyalty_points / total_spent_dzd) JAMAIS créditée à l'achat = feature morte (approveReturn la décrémente en no-op). Décision produit: compléter le crédit à l'achat ou retirer la colonne. Hors zone B2.
[2026-05-28 14:07] B2 QUESTION → Chef: user demande une "page settings Credentials" (gestion centralisée + chiffrement-at-rest des secrets d'intégration). HORS zone B2 — touche src/db/schema.ts (shop_settings = zone Chef), src/app/admin/settings/** (non assigné), secrets WhatsApp/notifications (zone B5). Besoin d'un owner/affectation (Chef, ou agent settings dédié). Spec déjà écrite, commitée par erreur dans zone B4 avant lecture COORDINATION.md: docs/superpowers/specs/2026-05-28-credentials-settings-page-design.md (045f90a). B2 = FINI, je stoppe en attendant arbitrage.
[2026-05-28 14:05] chef DONE Webhook v2 g2bulk/bsv idempotents (FOR UPDATE + garde status!=PENDING_LOADBRAIN + lock wallet), anti double-refund/double-codes (21477ef, +4 tests). Proxy /api/loadbrain/[...path] gated staff ADMIN (b1b24a2). cron-tick.sh + DEPLOY.md S7b scheduler VPS (e454396). marketplace linkServiceToProduct transactionnel (5beb603).
[2026-05-28 14:05] chef DONE Pricing BSV/G2Bulk deduplique -> MarkupPricingService abstrait (c5d0d2e). API + comportement byte-identiques, relu APPROVE. Net -144 lignes.
[2026-05-28 14:05] chef DONE CI reparee: declenchee sur feat/** (a45f825), cache npm retire post-migration pnpm (aee45f6), @loadbrain/sdk-v2 vendore (dist reel sous vendor/loadbrain-sdk-v2/lib, 0c2219b), apostrophe IptvCheckoutModal echappee (64c7946). Jobs Typecheck OK + Production build OK (1er next build vert; la CI ne tournait sur AUCUNE branche feature avant). NB chef a touche .github/workflows (zone B4, Fini) pour debloquer la CI branch-wide.
[2026-05-28 14:05] chef NOTE INCIDENT (aee45f6): index git PARTAGE entre agents -> mon commit CI a happe le WIP non-committe de B5 (loadbrain-whatsapp.ts, notification-*, migration 0023, reseller notifs) + l'a pousse sous mon message. Vert, travail NON perdu, historique NON reecrit. Discipline: git diff --cached avant chaque commit (rappel: l'index est partage).
[2026-05-28 14:05] chef NOTE Pour B5/zone reseller: e2e ROUGES (02-reseller-flow badge BRONZE/catalogue/modal ; 12-sidebar 'Mes Webhooks' ; 13-notif-prefs lien sidebar) — jamais tournes en CI avant. Probablement feature notifications (sidebar) + seed e2e. Reseller UI = pas ma zone, je n'y touche pas. A investiguer cote B5.
[2026-05-28 14:13] B3 DONE Audit streaming clos — 6 commits: a1c3b09 (C1/H4 validation host www.netflix.com via netflix-url.ts + filtre sender strict), cc9777f (H2 quota fail-closed bump-avant-rendu + re-check), dfbfb24 (H1 rate-limit /api/activer events+heartbeat), 8b1d10f (SSE livraison exactly-once), e6eb6d2 (guard msAccountEmail), 7303f38 (re-entrance setInterval watcher). tsc 0, 245 tests verts. Zone B3 = FINI.
[2026-05-28 14:13] B3 DONE Côté B1/MFA (pairing, même session): primitive mfa-ticket.ts (2c241d1, 7 tests) + admin câblé (ddf370a, fuite TOTP retirée des logs) + reseller câblé (d42199a, check claims.role===RESELLER). Étape 2 MFA exige le ticket signé étape-1 (plus de userId client). Zone B1 = FINI. CAVEAT: smoke-test 2FA navigateur NON fait (pas de TOTP live générable) — à valider avant prod.
[2026-05-28 14:13] B3 QUESTION → Chef: scripts/check-zone.sh (référencé dans le protocole pull→check-zone→STATUS→push) est ABSENT du repo → step 2 infaisable pour tous les agents. À committer ou ajuster le protocole.
```

## Conflits détectés

| Fichier | Agents | Status | Décision chef |
|---|---|---|---|
| `src/services/slot-device-quota.service.ts` | Chef (checkDeviceQuota pure) + B3 (bumpDeviceUsage DB + fail-closed) | ✅ Compatible | B3 a étendu sans casser ma fonction pure. Tests verts. Pas de conflit. |
| `src/app/activer/[token]/page.tsx` | Chef (initial quota guard) + B3 (TOCTOU fix avec re-check) | ✅ B3 wins | Le fix B3 est strictement supérieur. Chef adopte. |
| `src/workers/streaming-mailbox-watcher.worker.ts` | Chef (LoadBrain auto-approve call) + B3 (msAccountEmail guard) | ✅ Compatible | Les deux changements coexistent (ligne différente). |

## Décisions architecturales

1. **Quota TOCTOU** : pattern fail-closed bumpDeviceUsage atomic + secondary re-check via `findFirst` adopté (B3).
2. **MFA step transition** : signed HMAC ticket avec TTL (B1) — utiliser pour tout flow multi-step futur.
3. **Errors client** : ne JAMAIS leak les messages d'erreur bruts. `toClientError(err)` (B2) à utiliser partout.
4. **Streaming watcher** : guard sur `ms_account_email` IS NOT NULL (B3) — évite gaspillage de refresh MS Graph.
5. **LoadBrain client SDK** : tous les appels vers LoadBrain passent par `src/lib/loadbrain-*.ts` avec `LOADBRAIN_INTERNAL_TOKEN` header (chef).

## Sync events

(none)
