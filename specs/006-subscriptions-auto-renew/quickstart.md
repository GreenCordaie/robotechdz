# Quickstart: Abonnements & Renouvellement Automatique

**Feature**: 006-subscriptions-auto-renew

---

## Test Scenarios (Manuel)

### Scenario 1 — Créer un abonnement depuis la fiche client (US1)

1. Aller sur `/admin/clients` → ouvrir un client
2. Section "Abonnements" → cliquer "Créer un abonnement"
3. Sélectionner un produit/variante marqué `isSubscribable=true`
4. Valider
5. **Vérifier** :
   - Abonnement ACTIF visible dans la section
   - `nextRenewalDate = aujourd'hui + 30j`
   - Une commande PAYE créée pour ce client

### Scenario 2 — Seuls les produits abonnables apparaissent (US1)

1. Dans le formulaire de création d'abonnement
2. **Vérifier** : seules les variantes dont le produit a `isSubscribable=true` sont listées

### Scenario 3 — Déclencher le renouvellement manuellement (US2)

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:1556/api/admin/cron/renew-subscriptions
```
**Vérifier** : JSON avec `{ processed, renewed, pending, failed }`. Pour les abonnements arrivés à échéance → nouvelle commande créée + notification Telegram.

### Scenario 4 — Idempotence du cron (US2)

1. Déclencher le cron deux fois de suite sur le même abonnement échu
2. **Vérifier** : une seule commande créée (pas de doublon), le 2ème appel retourne `renewed: 0` pour cet abonnement

### Scenario 5 — Renouvellement avec stock insuffisant (US2)

1. Mettre un abonnement avec `nextRenewalDate <= aujourd'hui` pour une variante à 0 stock
2. Déclencher le cron
3. **Vérifier** :
   - Abonnement passe en `EN_ATTENTE`
   - Log `FAILED` visible dans l'historique
   - Alerte Telegram envoyée aux admins

### Scenario 6 — Mettre en pause un abonnement (US3)

1. Fiche client → abonnement ACTIF → cliquer "Pause"
2. **Vérifier** : statut passe à EN_PAUSE
3. Déclencher le cron
4. **Vérifier** : aucune nouvelle commande créée pour cet abonnement

### Scenario 7 — Réactiver un abonnement en pause (US3)

1. Fiche client → abonnement EN_PAUSE → cliquer "Réactiver"
2. **Vérifier** :
   - Statut repasse à ACTIF
   - `nextRenewalDate = aujourd'hui + 30j`
   - Log `RESUMED` dans l'historique

### Scenario 8 — Résilier un abonnement (US3)

1. Fiche client → abonnement ACTIF → cliquer "Résilier"
2. **Vérifier** :
   - Statut passe à RESILIE
   - `endDate` renseignée
   - Log `CANCELLED` dans l'historique
   - Cron n'y touche plus

### Scenario 9 — Récapitulatif Telegram quotidien (US2)

Après l'exécution du cron :
**Vérifier** : message Telegram reçu du type :
```
🔄 Renouvellements du 24/03/2026
✅ 10 abonnements renouvelés
⏳ 1 en attente (stock insuffisant)
❌ 0 échecs
```

### Scenario 10 — Historique visible depuis la fiche client (US2/US3)

1. Fiche client → section Abonnements → développer l'accordéon d'un abonnement
2. **Vérifier** : liste des événements (CREATED, RENEWED, PAUSED...) avec dates et détails
