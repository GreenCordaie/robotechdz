# UI Components Contracts: Workflow Retours & Remboursements

**Feature**: 002-refund-return-workflow

---

## InitiateReturnModal

**Fichier**: `src/components/admin/modals/InitiateReturnModal.tsx`

### Props
```typescript
interface InitiateReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    id: number;
    orderNumber: string;
    totalAmount: number;
    clientId: number | null;
    status: string;
  };
}
```

### Behavior
- Formulaire avec champs : motif (textarea), typeRemboursement (radio: Espèces / Crédit wallet), montant (input number, pré-rempli avec totalAmount)
- Si `order.clientId === null` → désactiver l'option "Crédit wallet" avec tooltip "Commande anonyme"
- Validation côté client : motif min 5 chars, montant > 0 et ≤ totalAmount
- Submit → appel `initiateReturn()`
- En cas de succès → fermer le modal + toast succès
- En cas d'erreur → afficher message d'erreur dans le modal

### Trigger
Bouton "Retour / Remboursement" dans la liste des commandes de `CaisseContent.tsx`.
Visible uniquement si `order.status IN ['PAYE', 'LIVRE']` ET `order.returnRequest === null`.

---

## ApproveReturnModal

**Fichier**: `src/components/admin/modals/ApproveReturnModal.tsx`

### Props
```typescript
interface ApproveReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    id: number;
    orderNumber: string;
    returnRequest: ReturnRequest;
    clientName?: string;
  };
}
```

### Behavior
- Affichage récapitulatif : commande, montant, type remboursement, motif, client
- Deux boutons : "Approuver" (vert) et "Rejeter" (rouge)
- Si "Rejeter" → affiche un champ texte "Motif de rejet" (obligatoire min 5 chars)
- Confirmation avant soumission (texte "Cette action est irréversible")
- Submit approuver → appel `approveReturn()`
- Submit rejeter → appel `rejectReturn({ orderId, motifRejet })`

### Trigger
Section "Retours en attente" dans `CaisseContent.tsx`, visible uniquement pour SUPER_ADMIN.
Badge "En attente" sur la commande concernée dans la liste générale.

---

## ReturnHistorySection

**Fichier**: intégré dans `src/app/admin/clients/ClientDetails.tsx` (ou composant dédié)

### Props
```typescript
interface ReturnHistorySectionProps {
  clientId: number;
}
```

### Behavior
- Charge les retours via `getReturnsByClient({ clientId })`
- Tableau avec colonnes : Date commande, Commande #, Montant remboursé, Type, Statut (badge coloré)
  - EN_ATTENTE → badge jaune
  - APPROUVE → badge vert
  - REJETE → badge rouge avec tooltip motif de rejet
- Si aucun retour → message "Aucun retour enregistré"
- Tri par date décroissante

---

## Modifications de CaisseContent.tsx

### Bouton "Retour" par commande
```typescript
// Condition d'affichage du bouton
const canInitiateReturn = (order: Order) =>
  ['PAYE', 'LIVRE'].includes(order.status) &&
  order.returnRequest === null;

// Condition d'affichage du badge "en attente"
const hasPendingReturn = (order: Order) =>
  order.returnRequest?.status === 'EN_ATTENTE';
```

### Section "Retours en attente" (SUPER_ADMIN only)
- Filtre des commandes avec `returnRequest.status = EN_ATTENTE`
- Affichage en haut de la liste ou dans un onglet dédié
- Chaque entrée : orderNumber, client, montant, type remboursement, motif + boutons Approuver/Rejeter
