# EPIC 0 — Stabilisation Implementation Plan

> **For agentic workers:** Implement task-by-task with atomic commits. No regression on existing features.

**Goal:** Stabiliser le projet 100-pc-IA avant d'attaquer la roadmap marketplace B2B (EPIC 1-14).

**Architecture:** 5 batches de commits atomiques, sur branche `epic-0-stabilization`. Chaque batch est testable indépendamment.

**Tech Stack:** Next.js 14.2 / TS 5 / Drizzle / Zod / bcryptjs / jose

**Garde-fous anti-régression :**
1. Branche dédiée — pas de push sur `master` ni `avant-netflix-n8n`
2. Aucune modification de logique métier (refund, allocation stock, auth)
3. Build doit passer après chaque batch
4. typecheck doit s'améliorer (jamais empirer)
5. Aucune route critique supprimée — uniquement gardée derrière flag `NODE_ENV`

---

## Baseline (avant exécution)

- **Branche :** `epic-0-stabilization` (créée depuis `avant-netflix-n8n`)
- **TS errors avant :** ~37 dont ~28 dans code obsolète (`backups/`, `tmp/`, scripts non commités)
- **TS errors réels src/ :** ~9
- **Build :** passe car `ignoreBuildErrors: true`

---

## Batch A — Hygiène repo (zero risk)

**Files to modify:**
- `.gitignore`
- Delete: `backups/`, `tmp/`, `tmp_test_*.js`, `check_db*.{js,ts}` racine, `cf_*.txt`, `build_log.txt`, `eslint_errors*.txt`, `body*.txt`, `delegation_debug.txt`, `diag_atlas*.txt`, `tsconfig.tsbuildinfo` du tracking, `src/app/kiosk/views/CatalogueView.tsx.bak`, `scripts/noop.js`

- [ ] A1. Étendre `.gitignore` (ajouter artefacts build, fichiers debug, dossiers obsolètes)
- [ ] A2. `git rm` les fichiers déjà trackés qui doivent être ignorés (`tsconfig.tsbuildinfo`)
- [ ] A3. Supprimer dossiers obsolètes `backups/`, `tmp/`
- [ ] A4. Supprimer fichiers debug racine et `.bak`
- [ ] A5. Décider sort des scripts `e2e-*` non commités (déplacer ou supprimer)
- [ ] A6. Re-run typecheck → vérifier que ~28 erreurs disparaissent
- [ ] A7. Commit `chore: gitignore + repo cleanup`

---

## Batch B — Env hardening (defensive)

**Files to create/modify:**
- Create `src/lib/env.ts` (Zod validation runtime)
- Modify `.env.example` (ajouter 15 vars manquantes)
- Modify `drizzle.config.ts` (retirer fallback hardcodé)
- Modify `src/lib/encryption.ts` (séparer ENCRYPTION_KEY de SESSION_SECRET)

- [ ] B1. Compléter `.env.example` avec TURNSTILE, MICROSOFT_*, LOADBRAIN_*, GROQ_API_KEY, UPSTASH_*, VAPID_*, WHATSAPP_API_KEY, WHATSAPP_VERIFY_TOKEN
- [ ] B2. Créer `src/lib/env.ts` avec schema Zod minimal (DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY required)
- [ ] B3. Modifier `drizzle.config.ts` ligne 8 : retirer fallback `postgres://user:password@localhost:5435/flexbox`
- [ ] B4. Modifier `src/lib/encryption.ts` : utiliser `ENCRYPTION_KEY` strictement (plus de fallback `SESSION_SECRET`)
- [ ] B5. Re-run typecheck (nouveau code TS ne doit rien casser)
- [ ] B6. Commit `chore(env): runtime validation + complete .env.example`

---

## Batch C — Sécurité critique

**Files to modify:**
- `src/app/api/debug-codes/route.ts`
- `src/app/api/diag-netflix/route.ts`
- `src/app/api/list-all-emails/route.ts`
- `src/app/api/orders/track/route.ts`
- `src/app/suivi/[orderNumber]/page.tsx`

- [ ] C1. Wrapper les 3 routes debug : early return 404 si `process.env.NODE_ENV === 'production'` (sauf si `process.env.ENABLE_DEBUG_ROUTES === 'true'`)
- [ ] C2. `/api/orders/track` : ajouter check `order.status === 'TERMINE'` avant unlock codes (rejeter PAYE/LIVRE)
- [ ] C3. `/api/orders/track` : passer phone validation full number au lieu des 4 derniers chiffres
- [ ] C4. Update UI suivi pour matcher le nouveau contrat (plein numéro)
- [ ] C5. Re-run typecheck
- [ ] C6. Commit `fix(security): gate debug routes + harden public order tracking`

---

## Batch D — UX wallet B2B + bug refund

**Files to modify:**
- `src/app/reseller/wallet/page.tsx`
- `src/lib/orders.ts` (reverseSupplierDebits)

- [ ] D1. Wallet B2B : cacher bouton "Recharger" temporairement (commentaire EPIC 14)
- [ ] D2. Wallet B2B : retirer stats hardcodées 12,500 / 625 → calculer depuis transactions réelles
- [ ] D3. Wallet B2B : retirer `useState<any>` + `[any, any]` → typing propre
- [ ] D4. Fix `reverseSupplierDebits` : ajouter colonne `reversed_at` sur supplier_transactions OU vérifier qu'aucune RECHARGE de remboursement existe déjà pour cette order
- [ ] D5. Re-run typecheck
- [ ] D6. Commit `fix(b2b): wallet UX + prevent supplier double-reverse`

---

## Batch E — TypeScript strict + flip flag (BIG ONE)

**Files to modify:**
- 4 fichiers src/ avec erreurs TS réelles
- `next.config.mjs`

- [ ] E1. Fixer `src/app/admin/push/actions.ts` (6 erreurs UserRole)
- [ ] E2. Fixer `src/app/admin/settings/SettingsMobile.tsx` (1 erreur password)
- [ ] E3. Fixer `src/components/admin/push/PushNotificationManager.tsx` (1 erreur unknown)
- [ ] E4. Fixer `src/services/rate-limit.service.ts` (1 erreur undefined)
- [ ] E5. Re-run typecheck → 0 erreurs attendu
- [ ] E6. Re-run lint → noter les warnings (ne pas bloquer)
- [ ] E7. Resync drizzle `_journal.json` avec migrations 0003 + 0004
- [ ] E8. `next.config.mjs` : passer `typescript.ignoreBuildErrors: false` + `eslint.ignoreDuringBuilds: false`
- [ ] E9. Run `npm run build` complet → doit passer
- [ ] E10. Commit `chore(ts): fix all type errors + enforce strict build`

---

## Verification finale

- [ ] V1. `git log --oneline` → 5 commits clairs
- [ ] V2. `npm run build` → green
- [ ] V3. `npx tsc --noEmit` → 0 erreurs
- [ ] V4. Manuel : démarrer `npm run dev` (sandbox), naviguer sur `/admin/login`, `/reseller/login`, `/kiosk`, `/suivi/X` → vérifier qu'aucune page ne crash
- [ ] V5. Push branche `epic-0-stabilization` (sans merge auto sur `avant-netflix-n8n`)
- [ ] V6. Rapport diff au user pour review/merge

---

## Rollback policy

Chaque batch = 1 commit atomique. Si un batch casse :
```bash
git reset --hard HEAD~1
```
Si tout casse, retour baseline :
```bash
git checkout avant-netflix-n8n
git branch -D epic-0-stabilization
```
