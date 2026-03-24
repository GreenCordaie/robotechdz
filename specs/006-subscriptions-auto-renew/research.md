# Research: Abonnements & Renouvellement Automatique

**Feature**: 006-subscriptions-auto-renew
**Date**: 2026-03-24

---

## Decision 1 — Nouvelles tables : `subscriptions` + `subscriptionLogs`

**Decision**: 2 nouvelles tables dédiées + ajout de `isSubscribable` sur `products`. Migration via `npm run db:push`.
**Rationale**: Aucune infrastructure d'abonnement n'existe. Les tables `orders` et `clients` ne sont pas modifiées — les abonnements génèrent des commandes normales via `allocateOrderStock()`.
**Alternatives considérées**: Ajouter un champ `isRecurring` sur `orders` — trop couplé, rend difficile la gestion du cycle de vie indépendant.

---

## Decision 2 — Statuts d'abonnement : 4 états

**Decision**: `ACTIF | EN_PAUSE | EN_ATTENTE | RESILIE`
- `ACTIF` : renouvellement planifié
- `EN_PAUSE` : renouvellement suspendu, nextRenewalDate figée
- `EN_ATTENTE` : stock insuffisant — en attente de réapprovisionnement
- `RESILIE` : terminé définitivement
**Rationale**: Couvre tous les scénarios de la spec. `EN_ATTENTE` permet de distinguer les cas d'échec techniques des pauses volontaires.

---

## Decision 3 — Cron endpoint : pattern existant `CRON_SECRET`

**Decision**: Créer `src/app/api/admin/cron/renew-subscriptions/route.ts` — même pattern que `scan-expiry/route.ts` : `Authorization: Bearer {CRON_SECRET}`, timing-safe comparison, retourne JSON résumé.
**Rationale**: Pattern établi dans le projet. `CRON_SECRET` déjà dans l'env. Aucune nouvelle dépendance.
**Alternatives considérées**: Vercel Cron (nécessite déploiement Vercel), node-schedule (process-scoped, ne fonctionne pas en serverless).

---

## Decision 4 — Idempotence : vérification par cycle

**Decision**: Avant de créer une commande de renouvellement, vérifier qu'il n'existe pas déjà une commande avec `subscriptionId = X` ET `createdAt >= début du cycle actuel (nextRenewalDate - 30j)`. Si oui → ignorer.
**Implémentation**: Champ `subscriptionId` sur la table `orders` (nullable) — permet la vérification efficace.
**Rationale**: FR-010 — le cron peut être rejoué sans créer de doublons. Simple et fiable.

---

## Decision 5 — Réutiliser `allocateOrderStock()` existant

**Decision**: Le renouvellement crée une commande normale via `db.insert(orders)` puis appelle `allocateOrderStock(tx, orderId, { userId })` — exactement comme le kiosk ou l'admin.
**Rationale**: Toute la logique d'allocation (codes digitaux, slots partage, audit log, alertes stock) est déjà gérée. Pas de duplication.
**Contrainte**: `allocateOrderStock` nécessite une transaction DB — le cron utilisera `db.transaction()`.

---

## Decision 6 — Notifications : Telegram admins + WhatsApp client

**Decision**:
- Admins → `sendTelegramNotification()` de `src/lib/telegram.ts` (direct, fiable)
- Client WhatsApp → `N8nService.triggerEvent("SUBSCRIPTION_RENEWED", { phone, productName, codes })` si téléphone disponible
- Récapitulatif quotidien → `sendTelegramNotification()` en fin de job
**Rationale**: FR-005 et FR-011. Les deux canaux sont déjà implémentés. WhatsApp via n8n suit le pattern existant.

---

## Decision 7 — Ajout `isSubscribable` sur `products` + `subscriptionId` sur `orders`

**Decision**:
- `products.isSubscribable` boolean default false — filtre les produits dans la liste de création d'abonnements
- `orders.subscriptionId` integer nullable references subscriptions.id — permet la vérification d'idempotence et la traçabilité
**Rationale**: Minimal invasif — 2 colonnes nullable ajoutées à des tables existantes. Zero breaking change.

---

## Decision 8 — UI admin : dans la fiche client existante

**Decision**: Section "Abonnements" dans le modal client de `/admin/clients` — même pattern que la section "Historique Retours" ajoutée en 002.
**Rationale**: FR-007 et FR-008 — l'admin gère les abonnements depuis la fiche client. Pas de nouvelle page. Cohérent avec l'UX existante.
**Actions**: Boutons Pause / Réactiver / Résilier sur chaque abonnement actif/en pause.

---

## Decision 9 — Périodicité : 30 jours fixes

**Decision**: `nextRenewalDate = today + 30 jours` (pas de mois calendaires). Constante `SUBSCRIPTION_PERIOD_DAYS = 30`.
**Rationale**: Spec assumption — abonnements mensuels (30 jours) uniquement pour la v1. Simplifie les calculs.

---

## Decision 10 — subscriptionLogs : journal d'événements

**Decision**: Table `subscription_logs` avec events : `CREATED | RENEWED | PAUSED | RESUMED | CANCELLED | FAILED`. Champ `details` JSONB pour stocker le motif d'échec ou l'orderId généré.
**Rationale**: FR-009 — historique complet visible depuis la fiche client. Pattern identique aux `auditLogs` existants.
