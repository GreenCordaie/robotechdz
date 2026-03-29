# Tasks: Netflix Household Auto-Resolver

**Input**: Design documents from `/specs/009-netflix-household-resolver/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, quickstart.md ✅

**Organization**: 4 user stories — résolution WhatsApp auto (P1), résolution manuelle admin (P2), ajout compte + PINs (P3), première connexion (P3 — couvert par US1 gratuitement).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

**Purpose**: Installer les dépendances et préparer la migration DB

- [x] T001 Installer `imapflow`, `mailparser`, `@types/mailparser` via `npm install imapflow mailparser` et `npm install -D @types/mailparser` dans `c:/Users/PC/Desktop/100-pc-IA`
- [x] T002 Ajouter la colonne `outlookPassword: text("outlook_password")` (nullable) dans la table `digitalCodes` dans `src/db/schema.ts`
- [x] T003 Exécuter `npx drizzle-kit push` pour appliquer la migration en base de données

**Checkpoint**: DB migrée, packages disponibles

---

## Phase 2: Foundational (Bloquant pour toutes les user stories)

**Purpose**: Service IMAP + génération PIN — utilisés par toutes les user stories

**⚠️ CRITIQUE**: Aucune user story ne peut démarrer sans cette phase

- [x] T004 Créer `src/services/netflix-resolver.service.ts` — classe `NetflixResolverService` avec méthode statique `resolve(email: string, outlookPassword: string): Promise<ResolverResult>` où `ResolverResult = { type: 'CODE'|'LINK'|'NOT_FOUND'|'ERROR'; value?: string; attempts: number; error?: string }`. Connexion IMAP via `imapflow` à `outlook.office365.com:993` SSL. Recherche emails FROM `info@account.netflix.com OR noreply@mailer.netflix.com OR noreply@netflix.com` reçus dans les 15 dernières minutes. Extraction code 4 chiffres avec regex `\b\d{4}\b` ou lien avec regex `https://www\.netflix\.com[^\s"<>]*(?:update-household|verify)[^\s"<>]*`. Retry 3× avec 30s de délai si `NOT_FOUND`. Fermeture propre de la connexion IMAP après chaque tentative.
- [x] T005 Ajouter la fonction `generateUniquePin(tx)` dans `src/services/account.service.ts` — génère un PIN 4 chiffres aléatoire (`String(Math.floor(Math.random() * 10000)).padStart(4, '0')`), vérifie l'unicité dans `digital_code_slots` (cherche `encrypt(pin)` dans le champ `code`), retente jusqu'à 10 fois, lève une erreur si impossible.
- [x] T006 Modifier `AccountService.addSharedAccountInternal` dans `src/services/account.service.ts` — accepter le nouveau paramètre optionnel `outlookPassword?: string`, stocker `encrypt(outlookPassword)` dans le champ `outlookPassword` de `digital_codes`, auto-générer le PIN pour chaque slot si `slotsConfig[i].pinCode` est vide en appelant `generateUniquePin(tx)`, retourner `{ accountId, slotsCount, generatedPins: [{slotIndex, pin}] }`.

**Checkpoint**: Service IMAP fonctionnel, PIN auto-génération opérationnelle

---

## Phase 3: User Story 1 — Résolution automatique WhatsApp (Priority: P1) 🎯 MVP

**Goal**: Un client envoie "foyer" sur WhatsApp → reçoit le code Netflix automatiquement en moins de 2 minutes

**Independent Test**: Depuis un numéro client avec slot VENDU actif, envoyer "foyer" → code Netflix reçu par WhatsApp sans intervention humaine

### Implémentation US1

- [x] T007 [US1] Ajouter la fonction `findActiveSlotByPhone(phone: string)` dans `src/app/api/webhooks/whatsapp/route.ts` ou dans un helper dédié — requête DB : `digitalCodeSlots` JOIN `orderItems` JOIN `orders` WHERE `(orders.customerPhone = phone OR clients.telephone = phone)` AND `digitalCodeSlots.status = 'VENDU'` ORDER BY `digitalCodeSlots.createdAt DESC` LIMIT 1, avec la `digitalCode` parente incluse (email + outlookPassword).
- [x] T008 [US1] Ajouter la détection des keywords household dans `src/app/api/webhooks/whatsapp/route.ts` — insérer AVANT le bloc `if (!settings?.chatbotEnabled)` (ligne ~338). Keywords (case-insensitive): `['foyer', 'household', 'appareil', 'code netflix', 'connexion', 'activer', 'verification', 'vérification']`. Si keyword détecté : appeler `findActiveSlotByPhone(senderPhone)`, puis `NetflixResolverService.resolve(email, outlookPassword)` en fire-and-forget (ne pas bloquer la réponse webhook), envoyer immédiatement un message d'attente "🔍 Recherche de votre code en cours..." puis envoyer le résultat final via `sendWhatsAppMessage`. Retourner `NextResponse.json({ success: true })` avant la fin de la résolution.
- [x] T009 [US1] Implémenter les messages WhatsApp de résultat dans `src/app/api/webhooks/whatsapp/route.ts` — `CODE`: "🔐 Votre code Netflix : *XXXX*\nEntrez ce code sur votre écran Netflix." — `LINK`: "🏠 Cliquez sur ce lien pour résoudre le problème :\n[URL]" — `NOT_FOUND`: "⏳ Aucun email Netflix reçu pour le moment. Réessayez dans quelques minutes ou contactez le support." — `ERROR`: "❌ Erreur technique lors de la récupération. Contactez le support." — Aucun abonnement trouvé: "ℹ️ Aucun abonnement actif trouvé pour ce numéro."
- [x] T010 [US1] Logger chaque résolution dans `auditLogs` — `action: 'NETFLIX_RESOLVE_AUTO'`, `entityType: 'SLOT'`, `entityId: String(slotId)`, `newData: { type, value: code/link ou null, attempts, phone: maskedPhone, trigger: 'WHATSAPP' }`.

**Checkpoint**: US1 complète — résolution automatique WhatsApp opérationnelle

---

## Phase 4: User Story 2 — Résolution manuelle admin (Priority: P2)

**Goal**: Bouton "Résoudre" dans l'UI admin → code envoyé au client par WhatsApp

**Independent Test**: Cliquer "Résoudre" sur un slot VENDU dans `/admin/comptes-partages` → code WhatsApp reçu par le client

### Implémentation US2

- [x] T011 [US2] Ajouter l'action `resolveHouseholdAction` dans `src/app/admin/comptes-partages/actions.ts` — `withAuth({ roles: [UserRole.ADMIN, UserRole.TRAITEUR] }, async ({ slotId }) => { ... })` avec schema Zod `{ slotId: z.number() }`. Récupérer le slot → `digitalCode` → décrypter email et `outlookPassword` → récupérer `clientPhone` via `orderItem → order → (customerPhone || client.telephone)`. Valider que `outlookPassword` existe, que `clientPhone` existe. Appeler `NetflixResolverService.resolve(email, outlookPassword)`. Envoyer WhatsApp avec `sendWhatsAppMessage`. Logger dans `auditLogs` avec `action: 'NETFLIX_RESOLVE_MANUAL'`. Retourner `{ success, type, error }`.
- [x] T012 [US2] Ajouter le bouton "🏠 Résoudre" sur chaque slot VENDU dans `src/app/admin/comptes-partages/SharedAccountsContent.tsx` — bouton visible uniquement quand `slot.status === 'VENDU'`, état loading individuel par slot (`resolvingSlotId`), appel `resolveHouseholdAction({ slotId: slot.id })`, toast de succès avec le type de résultat (code/lien/non trouvé), toast d'erreur si échec.

**Checkpoint**: US2 complète — résolution manuelle opérationnelle en parallèle de US1

---

## Phase 5: User Story 3 — Ajout compte avec Outlook password + PINs auto (Priority: P3)

**Goal**: Formulaire ajout compte avec champ Outlook password, PINs 4 chiffres visibles et copiables après création

**Independent Test**: Ajouter un compte → PINs affichés en clair avec copie → mot de passe Outlook stocké → bouton Résoudre disponible sur slots VENDU

### Implémentation US3

- [x] T013 [P] [US3] Mettre à jour l'action `addSharedAccount` dans `src/app/admin/comptes-partages/actions.ts` — ajouter `outlookPassword: z.string().optional()` dans le schema Zod, passer `outlookPassword` à `AccountService.addSharedAccountInternal`, retourner `generatedPins` dans la réponse `{ success: true, generatedPins }`.
- [x] T014 [P] [US3] Mettre à jour l'action `addSharedAccountQuick` dans `src/app/admin/comptes-partages/actions.ts` — supporter le format optionnel `email | netflix_pass | outlook_pass` (3 parties dans `parts[]`), extraire `parts[2]` comme `outlookPassword` si présent, passer à `AccountService.addSharedAccountInternal`.
- [x] T015 [P] [US3] Mettre à jour l'action `updateSharedAccount` dans `src/app/admin/comptes-partages/actions.ts` — ajouter `outlookPassword: z.string().optional()` dans le schema, mettre à jour `encrypt(outlookPassword)` dans `digital_codes` si fourni.
- [x] T016 [US3] Ajouter le champ "Mot de passe Outlook" dans le formulaire d'ajout de compte unique dans `src/app/admin/comptes-partages/SharedAccountsContent.tsx` — champ Input après le champ "Mot de passe Netflix", label "Mot de passe Outlook", state `addOutlookPassword`, passer à `addSharedAccount`. Après succès, afficher les PINs générés dans un bloc dédié (fond coloré, chaque PIN avec bouton copie individuel) en utilisant `res.generatedPins`.
- [x] T017 [US3] Ajouter le champ "Mot de passe Outlook" dans le modal d'édition de compte dans `src/app/admin/comptes-partages/SharedAccountsContent.tsx` — champ Input dans `handleEditClick` (parser depuis `account.outlookPassword` décrypté), state `editOutlookPassword`, passer à `updateSharedAccount`. Afficher les PINs existants pour chaque slot en clair avec bouton copie.
- [x] T018 [US3] Mettre à jour le format placeholder du mode multi-lignes dans `src/app/admin/comptes-partages/SharedAccountsContent.tsx` — placeholder et label mis à jour pour montrer le format `email | netflix_pass | outlook_pass (optionnel)`.

**Checkpoint**: US3 complète — ajout compte avec Outlook password et PINs visibles opérationnel

---

## Phase 6: Polish & Cross-Cutting

**Purpose**: Robustesse, compatibilité comptes existants, lint

- [x] T019 [P] Ajouter une décoration visuelle dans `src/app/admin/comptes-partages/SharedAccountsContent.tsx` — pour les comptes sans `outlookPassword`, afficher une icône d'avertissement ⚠️ sur le bouton "Résoudre" avec tooltip "Mot de passe Outlook manquant — cliquer pour ajouter".
- [x] T020 [P] Ajouter `getSharedAccountsInventory` dans `src/app/admin/comptes-partages/actions.ts` — s'assurer que `outlookPassword` est EXCLU de la réponse (ne pas décrypter et exposer côté client) — uniquement `hasOutlookPassword: boolean` pour l'UI.
- [x] T021 Exécuter `npm run lint` et corriger toutes les erreurs TypeScript liées aux nouveaux types (`ResolverResult`, `outlookPassword`, `generatedPins`).
- [x] T022 Vérifier le quickstart en testant manuellement les 3 flows : ajout compte → PIN visible, bouton Résoudre manuel, envoi "foyer" WhatsApp.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Aucune dépendance — démarrer immédiatement
- **Phase 2 (Foundational)**: Dépend de Phase 1 — bloque toutes les user stories
- **Phase 3 (US1)**: Dépend de Phase 2
- **Phase 4 (US2)**: Dépend de Phase 2 (T011 dépend de T004 pour NetflixResolverService)
- **Phase 5 (US3)**: Dépend de Phase 2 (T013-T018 dépendent de T006 pour AccountService)
- **Phase 6 (Polish)**: Dépend de Phases 3, 4, 5

### User Story Dependencies

- **US1 (P1)**: Démarre après Phase 2 — indépendante de US2 et US3
- **US2 (P2)**: Démarre après Phase 2 — réutilise `NetflixResolverService` de T004
- **US3 (P3)**: Démarre après Phase 2 — réutilise `AccountService` de T005/T006
- **US4 (P3)**: Couverte automatiquement par US1 (même service IMAP, même keywords)

### Parallel Opportunities (Phase 3, 4, 5 simultanément)

- T007, T011, T013, T014, T015 peuvent tous démarrer en parallèle dès Phase 2 terminée
- T013, T014, T015 dans US3 sont parallélisables entre eux (fichiers différents ou sections différentes)

---

## Parallel Example

```bash
# Après Phase 2 complète — lancer en parallèle:
T007  findActiveSlotByPhone() dans route.ts         [US1]
T011  resolveHouseholdAction dans actions.ts        [US2]
T013  update addSharedAccount schema                [US3]
T014  update addSharedAccountQuick format           [US3]
T015  update updateSharedAccount schema             [US3]
```

---

## Implementation Strategy

### MVP (User Story 1 uniquement)

1. Phase 1: Setup (T001 → T002 → T003)
2. Phase 2: Foundational (T004 → T005 → T006)
3. Phase 3: US1 (T007 → T008 → T009 → T010)
4. **VALIDER**: Envoyer "foyer" sur WhatsApp → code reçu ✅
5. Déployer le MVP

### Livraison incrémentale

1. Setup + Foundational → Base prête
2. US1 → Résolution WhatsApp auto ✅
3. US2 → Bouton admin ✅
4. US3 → Formulaire complet + PINs ✅
5. Polish → Production-ready ✅

---

## Notes

- **T004 est la tâche la plus critique** — tout repose sur `NetflixResolverService`
- Les PINs générés doivent être retournés décryptés dans la réponse de `addSharedAccount` pour affichage immédiat — ne jamais les stocker en clair en DB
- `outlookPassword` ne doit JAMAIS être exposé côté client — uniquement `hasOutlookPassword: boolean`
- Le champ `code` existant ("email | netflix_pass") n'est JAMAIS modifié
- Commit après chaque phase validée
