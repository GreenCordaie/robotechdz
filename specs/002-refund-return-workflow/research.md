# Research: Workflow Retours & Remboursements

**Feature**: 002-refund-return-workflow
**Date**: 2026-03-23

---

## Decision 1: Stockage du returnRequest

**Decision**: Ajouter un champ `returnRequest` JSONB sur la table `orders` existante.

**Rationale**: La spec l'indique explicitement. Le codebase utilise déjà JSONB pour `oldData`/`newData` dans `auditLogs`. Évite une nouvelle table avec migration complexe pour un objet qui n'a qu'un seul cycle de vie (une demande par commande).

**Alternatives considered**:
- Nouvelle table `returnRequests` — plus propre mais over-engineering pour la charge actuelle (1 retour par commande max)
- Champ JSON string — rejeté car JSONB offre la queryabilité si besoin futur

---

## Decision 2: Enum returnRequest.status

**Decision**: Utiliser les valeurs `EN_ATTENTE | APPROUVE | REJETE` directement dans le JSONB, sans créer un enum PostgreSQL séparé.

**Rationale**: Le status est encapsulé dans le JSONB — pas besoin d'un enum DB. Le type TypeScript valide les valeurs. Réduit le nombre de migrations.

**Alternatives considered**:
- Enum PostgreSQL `returnStatusEnum` — surcharge migratoire inutile

---

## Decision 3: Autorisation de l'approbation

**Decision**: Action `approveReturn` protégée par `withAuth({ roles: [UserRole.SUPER_ADMIN] })` uniquement.

**Rationale**: La spec FR-004 est explicite : seul SUPER_ADMIN peut approuver/rejeter. Le middleware `withAuth` existant gère déjà ce pattern.

**Alternatives considered**:
- ADMIN peut approuver — rejeté (risque fraude, spec claire)

---

## Decision 4: Réutilisation de l'action refundFullOrder existante

**Decision**: À l'approbation, appeler directement la logique de remboursement inline (dans la nouvelle action `approveReturn`) plutôt que d'appeler `refundFullOrder`.

**Rationale**: `refundFullOrder` dans `caisse/actions.ts` ne crée pas de `clientPayments` record ni de notification Telegram — il fait uniquement le changement de statut et la réallocation des codes. La nouvelle action doit orchestrer tout le workflow : clientPayments + auditLog + Telegram. Mieux de tout centraliser dans `approveReturn`.

**Alternatives considered**:
- Appeler `refundFullOrder` + ajouter les étapes manquantes — risque de duplication d'effets si `refundFullOrder` évolue

---

## Decision 5: Notification Telegram

**Decision**: Utiliser `sendTelegramNotification()` directement depuis `src/lib/telegram.ts` plutôt que passer par N8nService.

**Rationale**: Le workflow retour est synchrone et critique — les notifications doivent être envoyées dans la même transaction applicative. N8nService est asynchrone (webhook) et peut échouer sans impact sur le workflow. La notification Telegram directe est plus fiable pour ce use case.

**Alternatives considered**:
- N8nService.triggerEvent — asynchrone, risque de perte si n8n down

---

## Decision 6: Réduction de dette client (crédit wallet)

**Decision**: Pour `typeRemboursement = CREDIT_WALLET`, réduire `clients.totalDetteDzd` du montant remboursé (valeur minimale 0). Insérer un enregistrement `clientPayments` de type `REMBOURSEMENT`.

**Rationale**: Pattern identique à `recordPayment` dans `clients/actions.ts`. La dette ne peut pas descendre en dessous de 0 — si montant > dette, la différence est ignorée (crédit non monétaire dans cette version).

**Alternatives considered**:
- Créer un champ `creditWallet` séparé — over-engineering pour V1

---

## Decision 7: UI d'initiation

**Decision**: Ajouter un bouton "Retour / Remboursement" dans `CaisseContent.tsx` sur les commandes PAYE/LIVRE (à côté du bouton existant de détail). Créer un nouveau modal `InitiateReturnModal.tsx`.

**Rationale**: `RefundOrderModal.tsx` existant fait du remboursement direct sans approbation — il doit rester pour les cas d'usage admin direct. Le nouveau modal `InitiateReturnModal` introduit le workflow d'approbation. Les deux coexistent.

**Alternatives considered**:
- Modifier `RefundOrderModal` — cassant pour les flows existants

---

## Decision 8: Liste des retours en attente

**Decision**: Créer une section dédiée dans la page `/admin/caisse` (onglet ou section filtrable) affichant les commandes avec `returnRequest.status = EN_ATTENTE`, visible uniquement par SUPER_ADMIN.

**Rationale**: Centralise le workflow d'approbation dans l'interface déjà connue des admins sans ajouter une nouvelle page.

**Alternatives considered**:
- Nouvelle page `/admin/retours` — inutile pour V1, charge cognitive supplémentaire

---

## Technical Findings

### Fichiers clés à modifier
- `src/db/schema.ts` — ajout champ `returnRequest` JSONB sur `orders`
- `src/app/admin/caisse/actions.ts` — ajout `initiateReturn`, `approveReturn`, `rejectReturn`
- `src/app/admin/caisse/CaisseContent.tsx` — bouton + modal initiation, section approbation
- `src/app/admin/clients/ClientDetails.tsx` (ou équivalent) — section historique retours

### Fichiers clés à créer
- `src/components/admin/modals/InitiateReturnModal.tsx`
- `src/components/admin/modals/ApproveReturnModal.tsx`

### Pattern withAuth (confirmé)
```typescript
export const initiateReturn = withAuth(
  { roles: [UserRole.ADMIN, UserRole.CAISSIER] },
  async (data, { user }) => { ... }
);
```

### AuditLog pattern (confirmé)
```typescript
await db.insert(auditLogs).values({
  userId: user.id,
  action: 'INITIATE_RETURN',
  entityType: 'ORDER',
  entityId: String(orderId),
  oldData: { status: prevStatus },
  newData: { returnRequest: { ... } },
});
```
