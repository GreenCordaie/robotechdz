# Module Contract: Subscriptions

**Feature**: 006-subscriptions-auto-renew

---

## Server Actions (`src/app/admin/clients/actions.ts` — ajouts)

```typescript
// Créer un abonnement (ADMIN, SUPER_ADMIN)
// Génère immédiatement une première commande + allocation codes
createSubscription({
    clientId: number,
    variantId: number,
    notes?: string,
}): Promise<{ success: true; subscriptionId: number; orderId: number }>

// Mettre en pause (ADMIN, SUPER_ADMIN)
pauseSubscription({ id: number }): Promise<{ success: true }>

// Réactiver (ADMIN, SUPER_ADMIN) — recalcule nextRenewalDate = today + 30j
resumeSubscription({ id: number }): Promise<{ success: true }>

// Résilier (ADMIN, SUPER_ADMIN)
cancelSubscription({ id: number; motif?: string }): Promise<{ success: true }>

// Lister les abonnements d'un client (ADMIN, CAISSIER, SUPER_ADMIN)
getClientSubscriptions({ clientId: number }): Promise<{
    success: true;
    subscriptions: SubscriptionWithLogs[]
}>
```

---

## Cron Endpoint (`src/app/api/admin/cron/renew-subscriptions/route.ts`)

```
GET /api/admin/cron/renew-subscriptions
Authorization: Bearer {CRON_SECRET}
```

**Algorithme** :
1. Vérifier `CRON_SECRET` (timing-safe)
2. Récupérer tous les abonnements `status=ACTIF AND nextRenewalDate <= today`
3. Pour chaque abonnement :
   a. Vérifier idempotence : commande existante avec `subscriptionId = id AND createdAt >= nextRenewalDate - 30j` → skip si trouvé
   b. Vérifier stock disponible pour `variantId`
   c. Si stock OK : `db.transaction()` → insert order + orderItem → `allocateOrderStock()` → update `nextRenewalDate += 30j` → insert `subscriptionLog(RENEWED)` → notif WhatsApp + Telegram
   d. Si stock KO : update `status = EN_ATTENTE` → insert `subscriptionLog(FAILED)` → alerte Telegram admins
4. Envoyer récapitulatif Telegram (N renouvelés, M en attente, K échoués)

**Response 200** :
```json
{
    "processed": 12,
    "renewed": 10,
    "pending": 1,
    "failed": 1,
    "duration_ms": 3420
}
```

**Response 401** : token invalide

---

## UI Components (`src/components/admin/SubscriptionsSection.tsx`)

**Props** :
```typescript
interface SubscriptionsSectionProps {
    clientId: number;
    userRole: string;
}
```

**Features** :
- Liste des abonnements avec colonnes : produit/variante, statut badge coloré, date début, prochain renouvellement, actions
- Bouton "Créer un abonnement" → formulaire (sélection variante `isSubscribable=true`, notes)
- Actions par abonnement : Pause (si ACTIF), Réactiver (si EN_PAUSE), Résilier (si ACTIF/EN_PAUSE)
- Accordéon historique des logs par abonnement
- Statut badges : ACTIF=vert, EN_PAUSE=jaune, EN_ATTENTE=orange, RESILIE=rouge

---

## Types partagés

```typescript
interface SubscriptionWithLogs {
    id: number;
    clientId: number;
    productName: string;
    variantName: string;
    variantId: number;
    status: SubscriptionStatus;
    startDate: string;
    nextRenewalDate: string;
    endDate: string | null;
    notes: string | null;
    logs: SubscriptionLogEntry[];
}

interface SubscriptionLogEntry {
    id: number;
    event: SubscriptionEvent;
    orderId: number | null;
    details: Record<string, unknown> | null;
    performedBy: number | null;
    createdAt: string;
}
```
