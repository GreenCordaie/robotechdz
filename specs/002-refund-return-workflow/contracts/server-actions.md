# Server Actions Contracts: Workflow Retours & Remboursements

**Feature**: 002-refund-return-workflow
**File**: `src/app/admin/caisse/actions.ts`

---

## initiateReturn

**Rôles autorisés**: ADMIN, CAISSIER
**Fichier**: `src/app/admin/caisse/actions.ts`

### Input Schema (Zod)
```typescript
z.object({
  orderId: z.number().int().positive(),
  motif: z.string().min(5, "Motif requis (min 5 caractères)"),
  typeRemboursement: z.enum(["ESPECES", "CREDIT_WALLET"]),
  montant: z.number().positive(),
})
```

### Business Logic
1. Charger la commande — vérifier `status IN (PAYE, LIVRE)`
2. Vérifier `returnRequest IS NULL` (pas de demande existante)
3. Vérifier `montant ≤ order.totalAmount`
4. Si `typeRemboursement = CREDIT_WALLET`, vérifier que `order.clientId IS NOT NULL`
5. Écrire `returnRequest = { motif, typeRemboursement, montant, status: 'EN_ATTENTE', initiatedBy, initiatedAt, previousOrderStatus: order.status }`
6. Créer auditLog `INITIATE_RETURN`
7. `revalidatePath('/admin/caisse')`

### Return
```typescript
{ success: true, orderId: number }
| { success: false, error: string }
```

### Error Cases
- `ORDER_NOT_FOUND` — commande introuvable
- `INVALID_STATUS` — commande non remboursable (TERMINE, ANNULE, déjà REMBOURSE)
- `RETURN_ALREADY_EXISTS` — demande déjà en cours
- `AMOUNT_EXCEEDS_TOTAL` — montant > totalAmount
- `NO_CLIENT_FOR_WALLET` — CREDIT_WALLET sans clientId

---

## approveReturn

**Rôles autorisés**: SUPER_ADMIN uniquement
**Fichier**: `src/app/admin/caisse/actions.ts`

### Input Schema (Zod)
```typescript
z.object({
  orderId: z.number().int().positive(),
})
```

### Business Logic (transaction)
1. Charger la commande — vérifier `returnRequest.status = EN_ATTENTE`
2. Créer `clientPayments` record (`typeAction: REMBOURSEMENT`, `montant: returnRequest.montant`, `clientId`, `orderId`)
3. Si `typeRemboursement = CREDIT_WALLET` et `clientId` present :
   - Réduire `clients.totalDetteDzd = MAX(0, totalDetteDzd - montant)`
4. Remettre les codes VENDU → DISPONIBLE :
   - Requête : `digitalCodes WHERE orderItemId IN (orderItems.id WHERE orderId = X) AND status = VENDU`
   - Update `status = DISPONIBLE`
5. Mettre à jour `orders.status = REMBOURSE`
6. Mettre à jour `returnRequest.status = APPROUVE`, `approvedBy`, `approvedAt`
7. Créer auditLog `APPROVE_RETURN`
8. Envoyer notification Telegram (ADMIN + SUPER_ADMIN) :
   ```
   ✅ Retour approuvé
   Commande: #{orderNumber}
   Montant: {montant} DA
   Type: {typeRemboursement}
   Client: {clientName || 'Anonyme'}
   Par: {approvedBy.name}
   ```
9. `revalidatePath('/admin/caisse')` + `revalidatePath('/admin/clients')`

### Return
```typescript
{ success: true }
| { success: false, error: string }
```

### Error Cases
- `ORDER_NOT_FOUND`
- `NO_PENDING_RETURN` — returnRequest absent ou déjà traité
- `PAYMENT_RECORD_FAILED` — échec DB

---

## rejectReturn

**Rôles autorisés**: SUPER_ADMIN uniquement
**Fichier**: `src/app/admin/caisse/actions.ts`

### Input Schema (Zod)
```typescript
z.object({
  orderId: z.number().int().positive(),
  motifRejet: z.string().min(5, "Motif de rejet requis"),
})
```

### Business Logic
1. Charger la commande — vérifier `returnRequest.status = EN_ATTENTE`
2. Restaurer `orders.status = returnRequest.previousOrderStatus`
3. Mettre à jour `returnRequest.status = REJETE`, `rejectedBy`, `rejectedAt`, `motifRejet`
4. Créer auditLog `REJECT_RETURN`
5. `revalidatePath('/admin/caisse')`

### Return
```typescript
{ success: true }
| { success: false, error: string }
```

---

## getReturnsByClient

**Rôles autorisés**: ADMIN, CAISSIER, SUPER_ADMIN
**Fichier**: `src/app/admin/clients/actions.ts`

### Input Schema (Zod)
```typescript
z.object({
  clientId: z.number().int().positive(),
})
```

### Business Logic
- Requête : `orders WHERE clientId = X AND returnRequest IS NOT NULL ORDER BY createdAt DESC`
- Retourne les champs : `id, orderNumber, totalAmount, returnRequest, createdAt`

### Return
```typescript
{
  success: true,
  returns: Array<{
    orderId: number,
    orderNumber: string,
    totalAmount: number,
    returnRequest: ReturnRequest,
    orderCreatedAt: string,
  }>
}
```
