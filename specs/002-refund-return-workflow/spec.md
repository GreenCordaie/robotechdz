# Feature Specification: Workflow Retours & Remboursements

**Feature Branch**: `002-refund-return-workflow`
**Created**: 2026-03-23
**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Initier une demande de retour (Priority: P1)

Un caissier ou admin voit une commande PAYE ou LIVRE dans `/admin/caisse` et peut initier un retour : il choisit le motif, le type de remboursement (espèces ou crédit wallet client) et soumet la demande. La commande passe en attente d'approbation.

**Why this priority**: Sans cette étape, aucun retour n'est possible. C'est le point d'entrée du workflow entier.

**Independent Test**: Ouvrir `/admin/caisse` → sélectionner commande PAYE → cliquer "Initier retour" → remplir motif + type remboursement → soumettre → commande change de statut.

**Acceptance Scenarios**:

1. **Given** une commande avec statut PAYE ou LIVRE, **When** le caissier clique "Retour/Remboursement", **Then** un formulaire s'ouvre avec champs : motif (texte libre), type de remboursement (Espèces / Crédit wallet), montant à rembourser (pré-rempli avec total commande, modifiable).
2. **Given** le formulaire est soumis, **When** la demande est enregistrée, **Then** la commande passe au statut `REMBOURSE` (en attente) et un badge "En attente d'approbation" apparaît.
3. **Given** une commande avec statut TERMINE ou ANNULE, **When** le caissier tente un retour, **Then** le bouton "Retour" est désactivé et un message explicatif s'affiche.

---

### User Story 2 — Approuver ou rejeter un retour (Priority: P2)

Un SUPER_ADMIN voit la liste des demandes de retour en attente et peut les approuver (déclenche le remboursement réel + remise en stock des codes) ou les rejeter (avec motif).

**Why this priority**: Le retour n'est effectif qu'après approbation. Protège contre les retours frauduleux.

**Independent Test**: Se connecter en SUPER_ADMIN → voir liste des retours en attente → approuver un retour espèces → vérifier que le stock est remis + log audit créé + notification Telegram envoyée.

**Acceptance Scenarios**:

1. **Given** une demande en attente, **When** le SUPER_ADMIN approuve, **Then** : le paiement de remboursement est enregistré (type REMBOURSEMENT dans clientPayments), les codes VENDU de la commande repassent à DISPONIBLE si non utilisés, la commande passe à REMBOURSE, un log audit est créé, une notification Telegram est envoyée aux admins.
2. **Given** type remboursement = "Crédit wallet", **When** approuvé, **Then** la dette du client (`totalDetteDzd`) est réduite du montant remboursé (ou créditée si dette = 0).
3. **Given** une demande en attente, **When** le SUPER_ADMIN rejette avec motif, **Then** la commande revient à son statut précédent (PAYE ou LIVRE), le motif de rejet est enregistré et visible par le caissier.

---

### User Story 3 — Historique et visibilité des retours (Priority: P3)

Les admins peuvent voir l'historique complet des retours (approuvés, rejetés, en attente) depuis `/admin/clients` ou `/admin/caisse` avec filtres.

**Why this priority**: Traçabilité nécessaire pour la comptabilité et la gestion des litiges.

**Independent Test**: Naviguer vers `/admin/clients` → ouvrir fiche client → voir onglet/section "Retours" listant tous ses remboursements avec montant, date, statut.

**Acceptance Scenarios**:

1. **Given** un client avec des retours, **When** l'admin ouvre sa fiche, **Then** une section liste tous ses remboursements : date, montant, type (espèces/crédit), statut (approuvé/rejeté), commande concernée.
2. **Given** la liste des commandes dans `/admin/caisse`, **When** l'admin filtre par statut REMBOURSE, **Then** seules les commandes remboursées apparaissent.

---

### Edge Cases

- Que se passe-t-il si le code digital a été utilisé par le client (statut UTILISE) ? → Ne pas remettre en stock, noter dans le log que le retour stock est impossible.
- Que se passe-t-il si la commande a plusieurs articles et qu'un seul est retourné ? → Retour partiel : montant modifiable, statut commande → PARTIEL.
- Que se passe-t-il si le client n'a pas de fiche client liée (commande kiosk anonyme) ? → Seul le remboursement espèces est disponible (pas de crédit wallet).
- Que se passe-t-il si le montant à rembourser dépasse le total payé ? → Validation bloque la soumission avec message d'erreur.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Un utilisateur avec rôle CAISSIER ou ADMIN DOIT pouvoir initier une demande de retour sur toute commande avec statut PAYE ou LIVRE.
- **FR-002**: La demande de retour DOIT inclure : motif (texte libre obligatoire), type de remboursement (Espèces ou Crédit wallet), montant (pré-rempli, modifiable ≤ total commande).
- **FR-003**: Après soumission, la commande DOIT afficher un indicateur visuel "En attente d'approbation" sans changer son statut final jusqu'à décision du SUPER_ADMIN.
- **FR-004**: Seul un utilisateur avec rôle SUPER_ADMIN DOIT pouvoir approuver ou rejeter une demande de retour.
- **FR-005**: À l'approbation, le système DOIT : créer un enregistrement `clientPayments` de type REMBOURSEMENT, remettre les codes digitaux VENDU à DISPONIBLE (si statut = VENDU uniquement), passer la commande au statut REMBOURSE.
- **FR-006**: À l'approbation de type "Crédit wallet", le système DOIT réduire le champ `totalDetteDzd` du client du montant remboursé.
- **FR-007**: En cas de rejet, le système DOIT enregistrer le motif de rejet et restaurer le statut précédent de la commande (PAYE ou LIVRE).
- **FR-008**: Chaque action (initiation, approbation, rejet) DOIT être enregistrée dans `auditLogs` avec : userId, action, orderId, montant, type, motif.
- **FR-009**: À l'approbation, le système DOIT envoyer une notification Telegram aux admins avec : numéro commande, montant, type de remboursement, nom client.
- **FR-010**: Les commandes avec statut TERMINE, ANNULE ou déjà REMBOURSE NE DOIVENT PAS permettre l'initiation d'un retour.
- **FR-011**: L'historique des retours d'un client DOIT être visible dans sa fiche sur `/admin/clients`.

### Key Entities

- **ReturnRequest** (nouveau champ sur `orders` ou table dédiée) : orderId, motif, typeRemboursement, montant, statut (EN_ATTENTE / APPROUVE / REJETE), motifRejet, initiatedBy, approvedBy, createdAt.
- **ClientPayment** (existant) : type REMBOURSEMENT, montant, orderId, clientId, date — enregistré à l'approbation.
- **DigitalCode** (existant) : statut VENDU → DISPONIBLE à l'approbation si applicable.
- **Order** (existant) : statut → REMBOURSE ou PARTIEL après approbation.
- **AuditLog** (existant) : trace de chaque action du workflow.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un caissier peut initier une demande de retour en moins de 60 secondes depuis la liste des commandes.
- **SC-002**: 100% des remboursements approuvés génèrent un enregistrement dans `clientPayments` et un log dans `auditLogs`.
- **SC-003**: 100% des codes digitaux avec statut VENDU (et non UTILISE) sont remis à DISPONIBLE lors d'un remboursement approuvé.
- **SC-004**: La notification Telegram est envoyée dans les 5 secondes suivant l'approbation.
- **SC-005**: Aucun remboursement ne peut être initié ou approuvé sans authentification et rôle approprié.

## Assumptions

- Un champ `returnRequest` (JSON) sera ajouté à la table `orders` existante pour stocker l'état de la demande — évite de créer une nouvelle table et reste simple.
- Les codes de type "sharing slots" (Netflix) ne sont pas remis en stock lors d'un retour (trop complexe à désallouer proprement).
- Le montant remboursable par défaut = totalAmount de la commande, mais l'admin peut le réduire (retour partiel).
- Les notifications Telegram ciblent les rôles ADMIN et SUPER_ADMIN uniquement.
- L'intégration dans le UI se fait via un bouton/modal dans la liste commandes de `/admin/caisse` et dans la fiche client de `/admin/clients`.
