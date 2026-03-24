# Feature Specification: Abonnements & Renouvellement Automatique

**Feature Branch**: `006-subscriptions-auto-renew`
**Created**: 2026-03-23
**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Souscrire à un abonnement (Priority: P1)

Un client peut souscrire à un abonnement mensuel pour un service (ex : Netflix, Spotify, compte gaming) depuis le kiosk ou via l'admin. L'abonnement est lié à son compte client et génère automatiquement une commande récurrente chaque mois.

**Why this priority**: Sans la souscription, rien n'existe. C'est le point d'entrée du cycle de vie d'un abonnement.

**Independent Test**: Créer un abonnement pour un client → vérifier qu'une première commande est générée → vérifier que la date de prochain renouvellement est correcte (J+30).

**Acceptance Scenarios**:

1. **Given** un client avec un compte valide, **When** un admin crée un abonnement pour ce client (produit + durée), **Then** l'abonnement est enregistré avec : clientId, productId, startDate, nextRenewalDate (J+30), status=ACTIF, et une première commande est générée immédiatement.
2. **Given** un abonnement créé, **When** l'admin consulte la fiche client, **Then** une section "Abonnements" liste tous ses abonnements actifs et passés avec statut et date de prochain renouvellement.
3. **Given** un produit non éligible aux abonnements, **When** l'admin tente de créer un abonnement, **Then** le produit n'apparaît pas dans la liste des produits abonnables.

---

### User Story 2 — Renouvellement automatique mensuel (Priority: P2)

Le système renouvelle automatiquement les abonnements actifs chaque mois à la date d'anniversaire : il génère une nouvelle commande, alloue les codes digitaux et notifie le client et les admins.

**Why this priority**: C'est la valeur principale de la feature — l'automatisation évite les renouvellements manuels et garantit la continuité du service pour le client.

**Independent Test**: Simuler l'arrivée à la date de renouvellement d'un abonnement actif → vérifier qu'une nouvelle commande est créée avec des codes alloués et qu'une notification est envoyée.

**Acceptance Scenarios**:

1. **Given** un abonnement avec `nextRenewalDate = aujourd'hui`, **When** le job de renouvellement s'exécute, **Then** une nouvelle commande est créée, les codes sont alloués, la `nextRenewalDate` est avancée de 30 jours, et une notification WhatsApp/Telegram est envoyée au client et aux admins.
2. **Given** un abonnement à renouveler mais avec stock insuffisant, **When** le job s'exécute, **Then** l'abonnement passe en statut EN_ATTENTE, une alerte est envoyée aux admins, et aucune commande n'est créée.
3. **Given** un abonnement renouvelé avec succès, **When** l'admin consulte la liste des abonnements, **Then** le log de renouvellement (date, commande générée, statut) est visible dans l'historique.

---

### User Story 3 — Gérer les abonnements (pause, résiliation) (Priority: P3)

Un admin peut mettre en pause ou résilier un abonnement actif. En pause, le prochain renouvellement est suspendu sans supprimer l'abonnement. À la résiliation, l'abonnement s'arrête définitivement.

**Why this priority**: Nécessaire pour gérer les cas où le client demande un arrêt. Sans cette fonctionnalité, les abonnements ne peuvent être stoppés qu'en modifiant la base de données directement.

**Independent Test**: Mettre un abonnement en pause → vérifier que le job de renouvellement l'ignore → le réactiver → vérifier que le prochain renouvellement reprend à la bonne date.

**Acceptance Scenarios**:

1. **Given** un abonnement actif, **When** l'admin le met en pause, **Then** le statut passe à EN_PAUSE, le job de renouvellement l'ignore, et la `nextRenewalDate` n'est pas avancée.
2. **Given** un abonnement en pause, **When** l'admin le réactive, **Then** le statut repasse à ACTIF et la `nextRenewalDate` est recalculée à partir de la date de réactivation (J+30).
3. **Given** un abonnement actif ou en pause, **When** l'admin le résilie avec un motif, **Then** le statut passe à RESILIE, aucun renouvellement futur n'est planifié, et un log de résiliation est créé.

---

### Edge Cases

- Que se passe-t-il si le job de renouvellement échoue à mi-chemin (crash serveur) ? → Idempotence garantie — si la `nextRenewalDate` n'est pas avancée, le job peut relancer le renouvellement sans créer de doublon.
- Que se passe-t-il si un client a un abonnement et que le produit est désactivé ? → Alerte admin, abonnement mis en EN_ATTENTE, aucun renouvellement jusqu'à résolution.
- Que se passe-t-il si le client a une dette impayée ? → Le renouvellement est généré normalement (ajout à la dette existante) — la politique de crédit est gérée séparément.
- Que se passe-t-il si le même abonnement doit être renouvelé deux fois le même jour (bug) ? → Vérification de la dernière commande créée — si une commande existe pour ce cycle, le renouvellement est ignoré.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système DOIT permettre à un admin de créer un abonnement mensuel pour un client, lié à un produit spécifique.
- **FR-002**: Un produit DOIT être marqué comme "abonnable" dans l'admin pour apparaître dans la liste de création d'abonnements.
- **FR-003**: Lors de la création d'un abonnement, le système DOIT générer immédiatement une première commande et allouer les codes.
- **FR-004**: Le système DOIT exécuter automatiquement un job de renouvellement quotidien qui traite tous les abonnements dont `nextRenewalDate <= aujourd'hui` et `status = ACTIF`.
- **FR-005**: À chaque renouvellement réussi, le système DOIT : créer une commande, allouer les codes digitaux, avancer `nextRenewalDate` de 30 jours, envoyer une notification WhatsApp ou Telegram au client.
- **FR-006**: En cas de stock insuffisant lors d'un renouvellement, le système DOIT passer l'abonnement en statut EN_ATTENTE et alerter les admins via Telegram.
- **FR-007**: Un admin DOIT pouvoir mettre en pause, réactiver ou résilier un abonnement depuis la fiche client.
- **FR-008**: La liste des abonnements actifs DOIT être visible dans la fiche client (`/admin/clients`) avec statut, date de début, prochain renouvellement.
- **FR-009**: Chaque renouvellement (succès ou échec) DOIT être journalisé dans l'historique de l'abonnement avec : date, commande générée, statut, motif d'échec éventuel.
- **FR-010**: Le job de renouvellement DOIT être idempotent — relancer le job plusieurs fois le même jour ne doit pas créer de commandes en double.
- **FR-011**: Les admins DOIVENT recevoir une notification Telegram récapitulative quotidienne : nombre d'abonnements renouvelés, en attente, en échec.

### Key Entities

- **Subscription** : id, clientId, productId, variantId, status (ACTIF / EN_PAUSE / EN_ATTENTE / RESILIE), startDate, nextRenewalDate, endDate (si résilié), createdBy, notes.
- **SubscriptionLog** : id, subscriptionId, event (CREATED / RENEWED / PAUSED / RESUMED / CANCELLED / FAILED), orderId (si applicable), details, timestamp, performedBy.
- **Product** (existant, ajout champ) : `isSubscribable` (boolean) — marque les produits éligibles aux abonnements.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% des abonnements actifs arrivant à échéance sont renouvelés automatiquement sans intervention manuelle.
- **SC-002**: Le job de renouvellement s'exécute et traite tous les abonnements du jour en moins de 5 minutes, quel que soit leur nombre.
- **SC-003**: En cas de stock insuffisant, les admins sont alertés dans les 5 minutes suivant l'échec de renouvellement.
- **SC-004**: Aucun doublon de commande n'est créé même si le job de renouvellement est exécuté plusieurs fois le même jour.
- **SC-005**: Un admin peut créer, mettre en pause ou résilier un abonnement en moins de 60 secondes depuis la fiche client.
- **SC-006**: L'historique complet des renouvellements d'un abonnement est accessible depuis la fiche client sans accès technique requis.

## Assumptions

- Les abonnements sont mensuels (30 jours) uniquement pour cette version — pas de périodicité configurable (hebdo, annuel).
- Le paiement des abonnements est géré via le système de dette/crédit existant (`totalDetteDzd`) — pas de prélèvement automatique bancaire.
- Le job de renouvellement est un cron déclenché une fois par jour (minuit) — pas de renouvellement en temps réel à l'heure exacte.
- Les notifications client sont envoyées via WhatsApp si le numéro est disponible, sinon via Telegram admins uniquement.
- Un client peut avoir plusieurs abonnements actifs simultanément (ex : Netflix + Spotify).
- La résiliation est définitive et immédiate — pas de période de préavis pour cette version.
