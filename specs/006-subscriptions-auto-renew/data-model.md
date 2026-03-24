# Data Model: Abonnements & Renouvellement Automatique

**Feature**: 006-subscriptions-auto-renew
**Date**: 2026-03-24

---

## Modifications tables existantes

### `products` — ajout `isSubscribable`

```typescript
isSubscribable: boolean("is_subscribable").notNull().default(false),
```

### `orders` — ajout `subscriptionId`

```typescript
subscriptionId: integer("subscription_id").references(() => subscriptions.id),
```

---

## Nouvelles tables

### Table `subscriptions`

```typescript
export const subscriptions = pgTable("subscriptions", {
    id:              serial("id").primaryKey(),
    clientId:        integer("client_id").notNull().references(() => clients.id),
    productId:       integer("product_id").notNull().references(() => products.id),
    variantId:       integer("variant_id").notNull().references(() => productVariants.id),
    status:          varchar("status", { length: 20 }).notNull().default("ACTIF"),
    // ACTIF | EN_PAUSE | EN_ATTENTE | RESILIE
    startDate:       date("start_date").notNull(),
    nextRenewalDate: date("next_renewal_date").notNull(),
    endDate:         date("end_date"),          // null tant que non résilié
    createdBy:       integer("created_by").references(() => users.id),
    notes:           text("notes"),
    createdAt:       timestamp("created_at").notNull().defaultNow(),
    updatedAt:       timestamp("updated_at").notNull().defaultNow(),
});
```

---

### Table `subscriptionLogs`

```typescript
export const subscriptionLogs = pgTable("subscription_logs", {
    id:             serial("id").primaryKey(),
    subscriptionId: integer("subscription_id").notNull().references(() => subscriptions.id),
    event:          varchar("event", { length: 20 }).notNull(),
    // CREATED | RENEWED | PAUSED | RESUMED | CANCELLED | FAILED
    orderId:        integer("order_id").references(() => orders.id), // si applicable
    details:        jsonb("details").$type<Record<string, unknown>>(),
    performedBy:    integer("performed_by").references(() => users.id), // null si cron
    createdAt:      timestamp("created_at").notNull().defaultNow(),
});
```

---

## Types TypeScript

```typescript
export type SubscriptionStatus = "ACTIF" | "EN_PAUSE" | "EN_ATTENTE" | "RESILIE";
export type SubscriptionEvent = "CREATED" | "RENEWED" | "PAUSED" | "RESUMED" | "CANCELLED" | "FAILED";

export const SUBSCRIPTION_PERIOD_DAYS = 30;
```

---

## Constantes de renouvellement

```typescript
// Calcul nextRenewalDate
const nextRenewalDate = new Date(Date.now() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);

// Sélection des abonnements à renouveler
where: and(
    eq(subscriptions.status, "ACTIF"),
    lte(subscriptions.nextRenewalDate, new Date())
)
```

---

## Relations

```
clients (1) ──── (N) subscriptions
products (1) ──── (N) subscriptions
productVariants (1) ──── (N) subscriptions
subscriptions (1) ──── (N) subscriptionLogs
subscriptions (1) ──── (N) orders (via orders.subscriptionId)
orders (N) ──── (1) subscriptions
```

---

## Diagramme cycle de vie

```
         createSubscription()
              │
              ▼
           [ACTIF] ──── renewSubscription() ──── [ACTIF] (nextRenewalDate +30j)
              │                │
              │           stock insuffisant
              │                │
         pauseSubscription()   ▼
              │           [EN_ATTENTE] ──── stock rétabli ──► (cron le traite)
              │
              ▼
          [EN_PAUSE] ──── resumeSubscription() ──── [ACTIF] (nextRenewalDate = today+30)
              │
         cancelSubscription()
              │
              ▼
          [RESILIE] (terminal)
```
