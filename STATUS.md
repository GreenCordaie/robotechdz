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
