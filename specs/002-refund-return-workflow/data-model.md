# Data Model: Workflow Retours & Remboursements

**Feature**: 002-refund-return-workflow
**Date**: 2026-03-23

---

## Existing Tables Modified

### orders (modification)

Ajout d'un champ `returnRequest` JSONB nullable.

```typescript
// src/db/schema.ts — dans la table orders
returnRequest: jsonb('return_request').$type<ReturnRequest | null>().default(null),
```

**Type ReturnRequest** (TypeScript, src/lib/types.ts ou src/lib/constants.ts):
```typescript
export type ReturnRequestStatus = 'EN_ATTENTE' | 'APPROUVE' | 'REJETE';
export type RemboursementType = 'ESPECES' | 'CREDIT_WALLET';

export interface ReturnRequest {
  motif: string;                    // Motif libre obligatoire
  typeRemboursement: RemboursementType;
  montant: number;                  // Montant à rembourser (≤ totalAmount)
  status: ReturnRequestStatus;
  initiatedBy: number;              // userId de l'initiateur
  initiatedAt: string;              // ISO timestamp
  approvedBy?: number;              // userId du SUPER_ADMIN
  approvedAt?: string;              // ISO timestamp
  rejectedBy?: number;
  rejectedAt?: string;
  motifRejet?: string;              // Motif de rejet
  previousOrderStatus: string;      // Statut avant initiation (pour restauration si rejet)
}
```

**Contraintes**:
- `montant` ≤ `orders.totalAmount` — validé en action serveur
- Ne peut être créé que si `orders.status` IN (`PAYE`, `LIVRE`)
- Une seule demande de retour par commande (contrainte applicative, pas DB)

---

## Existing Tables Used (no modification)

### clientPayments (existant)

Enregistrement créé à l'approbation d'un retour.

```typescript
{
  clientId: number,            // FK → clients
  orderId: number,             // FK → orders
  montantDzd: number,          // Montant remboursé
  typeAction: 'REMBOURSEMENT', // Enum existant
  // note: pas de champ note dans le schema actuel
}
```

### auditLogs (existant)

3 entrées créées au fil du workflow :

| action | entityType | entityId | oldData | newData |
|--------|-----------|---------|---------|---------|
| `INITIATE_RETURN` | `ORDER` | orderId | `{ status: prevStatus }` | `{ returnRequest: {...} }` |
| `APPROVE_RETURN` | `ORDER` | orderId | `{ returnRequest: { status: 'EN_ATTENTE' } }` | `{ returnRequest: { status: 'APPROUVE' }, clientPaymentId }` |
| `REJECT_RETURN` | `ORDER` | orderId | `{ returnRequest: { status: 'EN_ATTENTE' } }` | `{ returnRequest: { status: 'REJETE', motifRejet } }` |

### digitalCodes (existant)

À l'approbation : codes avec `status = VENDU` et `orderItemId` dans la commande → passent à `DISPONIBLE`.

**Exception** : codes avec `status = UTILISE` → non modifiés, noté dans auditLog.

### clients (existant)

À l'approbation type `CREDIT_WALLET` :
```typescript
// Réduction de la dette (minimum 0)
totalDetteDzd = Math.max(0, totalDetteDzd - montantRembourse)
```

---

## State Transitions

### Order.status (impacté par le workflow retour)

```
PAYE / LIVRE
    → [initiation] → status inchangé + returnRequest.status = EN_ATTENTE
    → [approbation] → status = REMBOURSE + returnRequest.status = APPROUVE
    → [rejet] → status restauré (previousOrderStatus) + returnRequest.status = REJETE
```

### ReturnRequest.status

```
(null) → EN_ATTENTE → APPROUVE
                    → REJETE
```

---

## Indexes

Pas de nouveaux index DB nécessaires. Le champ `returnRequest` JSONB est interrogé par `orderId` (déjà indexé) ou via scan des commandes (faible volume de retours).

Si le volume devient important, ajouter un index GIN sur `returnRequest` ou un index partiel :
```sql
CREATE INDEX CONCURRENTLY idx_orders_return_pending
ON orders((return_request->>'status'))
WHERE return_request IS NOT NULL;
```
(non inclus dans V1)

---

## Migration Drizzle

```typescript
// Ajout du champ dans schema.ts
// Drizzle génère automatiquement :
// ALTER TABLE orders ADD COLUMN return_request jsonb DEFAULT NULL;
```

Commande : `npm run db:generate && npm run db:migrate`
