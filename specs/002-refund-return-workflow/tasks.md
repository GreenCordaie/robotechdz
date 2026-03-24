# Tasks: Workflow Retours & Remboursements

**Input**: Design documents from `/specs/002-refund-return-workflow/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Organization**: Tâches groupées par user story pour une implémentation et validation indépendantes.

---

## Phase 1: Setup (Fondation DB & Types)

**Purpose**: Migration base de données et types TypeScript partagés — bloquant pour toutes les user stories

- [x] T001Ajouter le champ `returnRequest` JSONB nullable sur la table `orders` dans `src/db/schema.ts` (après le champ `paymentMethod`, ajouter `returnRequest: jsonb('return_request').$type<ReturnRequest | null>().default(null)`)
- [x] T002 Ajouter les types TypeScript `ReturnRequestStatus`, `RemboursementType`, `ReturnRequest` dans `src/lib/constants.ts` (types exportés utilisés par les actions et composants)
- [x] T003 Générer et appliquer la migration Drizzle : `npm run db:generate` puis `npm run db:migrate` pour ajouter la colonne `return_request` sur la table `orders`

**Checkpoint**: Migration appliquée, types disponibles — user stories peuvent démarrer

---

## Phase 2: User Story 1 — Initier une demande de retour (Priority: P1) 🎯 MVP

**Goal**: Un CAISSIER ou ADMIN peut ouvrir un modal depuis la liste des commandes PAYE/LIVRE et soumettre une demande de retour avec motif, type et montant.

**Independent Test**: Ouvrir `/admin/caisse` → trouver commande PAYE → cliquer "Retour / Remboursement" → remplir formulaire → soumettre → badge "En attente d'approbation" apparaît sur la commande.

### Implémentation User Story 1

- [x] T004 [US1] Implémenter l'action `initiateReturn` dans `src/app/admin/caisse/actions.ts` : validation Zod (orderId, motif min 5 chars, typeRemboursement enum, montant), vérification status IN (PAYE, LIVRE), vérification returnRequest IS NULL, vérification montant ≤ totalAmount, vérification clientId si CREDIT_WALLET, écriture JSONB returnRequest avec status EN_ATTENTE, creation auditLog INITIATE_RETURN, revalidatePath('/admin/caisse')
- [x] T005 [US1] Créer le composant `InitiateReturnModal` dans `src/components/admin/modals/InitiateReturnModal.tsx` : props (isOpen, onClose, order), formulaire avec textarea motif, radio Espèces/Crédit wallet (désactivé si clientId null), input montant pré-rempli avec totalAmount, validation côté client, appel `initiateReturn()`, toast succès/erreur
- [x] T006 [US1] Modifier `src/app/admin/caisse/CaisseContent.tsx` : ajouter état `returnModalOrder` (null | Order), importer et afficher `InitiateReturnModal`, ajouter bouton "Retour / Remboursement" sur chaque commande avec condition `status IN ['PAYE', 'LIVRE'] && returnRequest === null`, ajouter badge "En attente d'approbation" si `returnRequest?.status === 'EN_ATTENTE'`

**Checkpoint**: US1 testable — bouton retour visible, formulaire soumettable, badge affiché

---

## Phase 3: User Story 2 — Approuver ou rejeter un retour (Priority: P2)

**Goal**: Un SUPER_ADMIN voit les demandes en attente et peut approuver (déclenche remboursement + codes + Telegram) ou rejeter (avec motif, restaure statut).

**Independent Test**: Se connecter SUPER_ADMIN → section "Retours en attente" dans `/admin/caisse` → approuver → vérifier `orders.status = REMBOURSE`, `clientPayments` créé, codes VENDU → DISPONIBLE, notification Telegram reçue, auditLog créé.

### Implémentation User Story 2

- [x] T007 [US2] Implémenter l'action `approveReturn` dans `src/app/admin/caisse/actions.ts` : rôle SUPER_ADMIN uniquement, transaction DB : (1) charger commande + vérifier returnRequest.status = EN_ATTENTE, (2) insérer `clientPayments` (typeAction: REMBOURSEMENT, montantDzd, clientId, orderId), (3) si CREDIT_WALLET + clientId : update `clients.totalDetteDzd = MAX(0, totalDetteDzd - montant)`, (4) update digitalCodes VENDU → DISPONIBLE pour les orderItems de la commande, (5) update `orders.status = REMBOURSE`, (6) update `returnRequest.status = APPROUVE + approvedBy + approvedAt`, (7) créer auditLog APPROVE_RETURN avec oldData/newData, (8) `sendTelegramNotification()` avec récap commande, (9) revalidatePath('/admin/caisse') + revalidatePath('/admin/clients')
- [x] T008 [US2] Implémenter l'action `rejectReturn` dans `src/app/admin/caisse/actions.ts` : rôle SUPER_ADMIN uniquement, vérifier returnRequest.status = EN_ATTENTE, restaurer `orders.status = returnRequest.previousOrderStatus`, update `returnRequest.status = REJETE + rejectedBy + rejectedAt + motifRejet`, créer auditLog REJECT_RETURN, revalidatePath('/admin/caisse')
- [x] T009 [US2] Créer le composant `ApproveReturnModal` dans `src/components/admin/modals/ApproveReturnModal.tsx` : props (isOpen, onClose, order avec returnRequest), affichage récap (orderNumber, montant, type, motif, client), bouton "Approuver" (vert) + bouton "Rejeter" (rouge), si rejet → textarea motifRejet obligatoire (min 5 chars), confirmation "action irréversible", appel `approveReturn()` ou `rejectReturn()`, toast résultat
- [x] T010 [US2] Modifier `src/app/admin/caisse/CaisseContent.tsx` : ajouter état `approveModalOrder`, importer `ApproveReturnModal`, ajouter section "Retours en attente" visible uniquement si `user.role === 'SUPER_ADMIN'` — filtre des commandes avec `returnRequest?.status === 'EN_ATTENTE'` — affiche orderNumber, client, montant, type, motif + bouton "Approuver / Rejeter" qui ouvre `ApproveReturnModal`

**Checkpoint**: US2 testable — SUPER_ADMIN peut approuver/rejeter, effets DB corrects, Telegram envoyé

---

## Phase 4: User Story 3 — Historique et visibilité des retours (Priority: P3)

**Goal**: Les admins voient l'historique complet des retours dans la fiche client et peuvent filtrer les commandes remboursées dans la caisse.

**Independent Test**: Aller sur `/admin/clients` → ouvrir fiche client avec retours → voir section "Retours" avec liste. Aller sur `/admin/caisse` → filtrer par REMBOURSE → voir uniquement les commandes remboursées.

### Implémentation User Story 3

- [x] T011 [P] [US3] Implémenter l'action `getReturnsByClient` dans `src/app/admin/clients/actions.ts` : rôles ADMIN/CAISSIER/SUPER_ADMIN, query `orders WHERE clientId = X AND returnRequest IS NOT NULL ORDER BY createdAt DESC`, retourner id, orderNumber, totalAmount, returnRequest, createdAt
- [x] T012 [P] [US3] Ajouter le filtre statut `REMBOURSE` dans `src/app/admin/caisse/CaisseContent.tsx` : s'assurer que le filtre de statut existant inclut l'option REMBOURSE dans la liste déroulante/onglets
- [x] T013 [US3] Ajouter la section "Historique Retours" dans la fiche client (identifier le bon composant dans `src/app/admin/clients/` — probablement `ClientDetails.tsx` ou équivalent) : charger via `getReturnsByClient`, tableau avec colonnes Date commande / Commande # / Montant remboursé / Type / Statut (badge EN_ATTENTE=jaune, APPROUVE=vert, REJETE=rouge avec tooltip motifRejet), message "Aucun retour enregistré" si vide

**Checkpoint**: US3 testable — historique visible dans fiche client, filtre REMBOURSE fonctionnel

---

## Phase 5: Polish & Validation

**Purpose**: Robustesse et validation finale

- [x] T014 Vérifier que les commandes avec `status IN (TERMINE, ANNULE, REMBOURSE)` n'affichent pas le bouton "Retour" dans `src/app/admin/caisse/CaisseContent.tsx`
- [x] T015 Vérifier qu'une 2ème initiation de retour sur une commande avec `returnRequest !== null` est bloquée par l'action `initiateReturn` (retour `RETURN_ALREADY_EXISTS`)
- [x] T016 [P] Vérifier le cas edge commande anonyme (clientId null) : option CREDIT_WALLET désactivée dans `InitiateReturnModal`, action `initiateReturn` retourne `NO_CLIENT_FOR_WALLET` si CREDIT_WALLET + clientId null
- [x] T017 [P] Vérifier le cas edge codes UTILISE lors d'un remboursement : dans `approveReturn`, les codes avec `status = UTILISE` doivent être ignorés (pas remis en stock) — vérifier la query dans l'action (filtre `status = VENDU` uniquement)
- [x] T018 Valider les 7 scénarios du fichier `specs/002-refund-return-workflow/quickstart.md` manuellement en dev

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Aucune dépendance — démarrer immédiatement
- **US1 (Phase 2)**: Dépend de Phase 1 (types + migration)
- **US2 (Phase 3)**: Dépend de Phase 1 + idéalement US1 (les demandes EN_ATTENTE viennent d'US1)
- **US3 (Phase 4)**: Dépend de Phase 1 — T011 et T012 parallélisables
- **Polish (Phase 5)**: Dépend de toutes les phases

### Parallel Opportunities

- T011 et T012 (US3) peuvent démarrer dès Phase 1 terminée, en parallèle de US1/US2
- T007 et T008 (approveReturn + rejectReturn) peuvent être implémentés en parallèle
- T009 (ApproveReturnModal) peut être développé en parallèle de T007/T008
- T014, T015, T016, T017 (Polish) peuvent s'exécuter en parallèle

### Within Each User Story

- Action serveur AVANT composant UI (le composant appelle l'action)
- Modal AVANT intégration dans CaisseContent
- Types/migration AVANT tout le reste

---

## Implementation Strategy

### MVP (User Story 1 uniquement)
1. Compléter Phase 1 (migration + types)
2. Compléter Phase 2 (initiation retour + modal + bouton)
3. **VALIDER** : caissier peut initier un retour, badge visible
4. Les demandes EN_ATTENTE sont visibles — même sans approbation implémentée

### Livraison complète
1. Phase 1 → 2 → 3 → 4 → 5 dans l'ordre
2. Chaque phase validable indépendamment via les checkpoints
3. US3 (T011, T012) peut commencer en parallèle dès Phase 1 terminée

---

## Notes

- [P] = fichiers différents, pas de dépendances — exécutable en parallèle
- Toutes les actions serveur utilisent le pattern `withAuth()` existant de `src/lib/security.ts`
- La notification Telegram utilise `sendTelegramNotification()` de `src/lib/telegram.ts` directement (pas N8nService)
- La colonne DB s'appelle `return_request` (snake_case), le champ Drizzle `returnRequest` (camelCase)
- Tester avec `npm run db:generate` que la migration est propre avant `db:migrate`
